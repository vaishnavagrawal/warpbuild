# App DB Schema — Design

Schema for **our own** Postgres (the control plane), not the user's analytics
database. The user's DB is external, read-only, and never written to by us.

Lives in `packages/db/src/schema/`, one file per concern, re-exported from
`schema/index.ts` alongside the existing `auth.ts`.

## Conventions (inherited from `auth.ts`)

- `pgTable`, singular table names, snake_case columns, camelCase TS keys
- `text` primary keys generated with `nanoid` (already a dependency)
- `createdAt` / `updatedAt` as `timestamp().defaultNow().notNull()`, `updatedAt`
  with `$onUpdate`
- Explicit indexes named `<table>_<column>_idx`
- Status/type columns are `text` + a zod union at the boundary, **not** `pgEnum`.
  Reason: adding a value to a pgEnum needs a migration and Postgres can't drop
  enum values. For an MVP that will grow `type` from `postgres` to `clickhouse`
  and `mongo`, text is cheaper. Type safety comes from zod + `$type<>()`.

## Files

| File | Tables |
|---|---|
| `auth.ts` (exists) | `user`, `session`, `account`, `verification` |
| `datasource.ts` | `datasource`, `schema_snapshot` |
| `chat.ts` | `chat` |
| `query_log.ts` | `query_log` |
| *(managed by `@mastra/pg`)* | Mastra thread/message/working-memory tables |

---

## 1. `datasource`

One row per configured external database. MVP has exactly one, but nothing in
the model assumes that.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `name` | text notNull | user-facing label, e.g. "Local analytics" |
| `type` | text notNull, default `'postgres'` | `postgres` \| `clickhouse` \| `mongo` (only `postgres` implemented) |
| `connectionString` | text notNull | see security note below |
| `sslMode` | text notNull, default `'prefer'` | `disable` \| `prefer` \| `require`. Needed the moment this points at Neon/Supabase/RDS |
| `status` | text notNull, default `'unverified'` | `unverified` \| `connected` \| `error` |
| `lastCheckedAt` | timestamp nullable | set by Test Connection and by introspection |
| `lastError` | text nullable | last connection/introspection failure, for the config UI |
| `createdAt` / `updatedAt` | timestamp notNull | |

Indexes: none needed beyond the PK at this scale.

**No `activeSnapshotId` column.** A pointer from `datasource` → `schema_snapshot`
plus the FK back the other way is a circular reference, which drizzle can express
but which needs explicit type annotations and gives two sources of truth. The
current schema is instead derived: `max(version) where datasource_id = ?`. One
place to be wrong instead of two.

**Security note.** `connectionString` is stored in plaintext for the MVP — this is
on the explicitly deferred list. Two rules that hold anyway:
- It is never returned to the client. The tRPC read procedures return a redacted
  projection (`host`, `database`, `user`, no password).
- When encryption lands, the migration is: add `credentialId` → new `credential`
  table (`{ id, kind, cipherText, keyRef }`), backfill, drop the column. Nothing
  else in the schema is affected, which is why a separate `credential` table is
  *not* worth building now.

---

## 2. `schema_snapshot`

An immutable, versioned introspection result. This is what makes "static
datasource per chat" and "manual refresh" work: refresh appends a version, it
never mutates one.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `datasourceId` | text notNull → `datasource.id` ON DELETE CASCADE | |
| `version` | integer notNull | monotonic **per datasource**, starts at 1 |
| `checksum` | text notNull | sha256 of the canonicalised `definition`. Lets refresh detect "nothing changed" and skip creating a version |
| `definition` | jsonb notNull | structured schema, shape below |
| `renderedText` | text notNull | prompt-ready rendering, cached at introspection time |
| `tableCount` | integer notNull | |
| `tokenEstimate` | integer notNull | drives the prompt-stuffing vs. tool-lookup threshold later |
| `syncedAt` | timestamp notNull default now | |

Constraints: `unique(datasourceId, version)`, index on `datasourceId`.

Only successful introspections become rows. Failures are recorded on
`datasource.lastError` so a broken refresh can't strand a chat on an empty schema.

`renderedText` is stored rather than rendered per request so that a chat's prompt
is byte-identical across turns and reproducible after the fact when debugging a
bad answer.

### `definition` shape

```ts
type SchemaDefinition = {
  dialect: "postgres";
  serverVersion: string;
  schemas: Array<{
    name: string;                    // "public"
    tables: Array<{
      name: string;
      kind: "table" | "view" | "materialized_view";
      comment: string | null;        // COMMENT ON TABLE
      columns: Array<{
        name: string;
        dataType: string;            // format_type() output
        nullable: boolean;
        default: string | null;
        isPrimaryKey: boolean;
        comment: string | null;
      }>;
      foreignKeys: Array<{
        columns: string[];
        refSchema: string;
        refTable: string;
        refColumns: string[];
      }>;
    }>;
  }>;
};
```

Structured JSON rather than plain text — the brainstorm proposed plain text, but
that closes the door on per-table lookup tools, a schema browser UI, and diffing
two versions. `renderedText` gives the plain-text benefit without the cost.

---

## 3. `chat`

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid; **also the Mastra `threadId`** |
| `title` | text nullable | derived from the first user message |
| `datasourceId` | text notNull → `datasource.id` ON DELETE CASCADE | |
| `snapshotId` | text notNull → `schema_snapshot.id` ON DELETE RESTRICT | the pinned schema version |
| `createdAt` / `updatedAt` | timestamp notNull | |

Indexes: `chat_datasourceId_idx`.

Two deliberate FK choices:
- `snapshotId` is **RESTRICT**. A snapshot referenced by a chat can never be
  deleted, so a chat's prompt is always reconstructable.
- `datasourceId` is **CASCADE**. Deleting a datasource deletes its chats.
  Acceptable for an MVP; if chat history needs to outlive a datasource later,
  this becomes a soft delete on `datasource`.

Pinning at chat creation (not per message) is what "datasources are static for a
chat session" means concretely. Refresh creates v2; this chat keeps v1 until the
user starts a new one. The UI surfaces "schema v1 · newer available".

### No messages table

Message persistence belongs to `@mastra/pg`, which owns its own tables. The
mapping, which is the whole integration contract:

| Mastra concept | Our value |
|---|---|
| `threadId` | `chat.id` |
| `resourceId` | constant `"local"` (no multi-tenancy in the MVP) |

When multi-tenancy arrives, `resourceId` becomes `user.id` and `chat` gains a
`userId` FK. Nothing else moves.

---

## 4. `query_log`

Every SQL statement the agent produced, including the ones the read-only guard
refused. Not observability tooling — this is the only way to debug a wrong
answer, so it ships with the MVP.

| Column | Type | Notes |
|---|---|---|
| `id` | text PK | nanoid |
| `chatId` | text nullable → `chat.id` ON DELETE CASCADE | nullable so a dev/test harness can execute without a chat |
| `datasourceId` | text notNull → `datasource.id` ON DELETE CASCADE | |
| `messageId` | text nullable | Mastra message id, correlates a statement to a turn |
| `sql` | text notNull | exactly what the tool received, pre-mutation |
| `status` | text notNull | `success` \| `rejected` \| `error` \| `timeout` |
| `rejectionReason` | text nullable | which guard tripped: `not_read_only` \| `multi_statement` \| `parse_failed` |
| `rowCount` | integer nullable | |
| `truncated` | boolean notNull default false | row cap was hit |
| `durationMs` | integer nullable | |
| `error` | text nullable | driver error message |
| `createdAt` | timestamp notNull default now | |

Indexes: `query_log_chatId_idx`, `query_log_createdAt_idx`.

`rejected` rows are the interesting ones — they are the signal that the model is
trying to write, and the evidence that the guard held.

---

## Lifecycle

```
create datasource ──► test connection ──► introspect ──► snapshot v1
                                                             │
                                        create chat ─────────┤ pins v1
                                                             │
              user clicks Refresh ──► introspect ──► checksum differs?
                                                    ├─ no  ─► no new row
                                                    └─ yes ─► snapshot v2
                                                             │
                                        existing chat still on v1
                                        new chat pins v2
```

Per turn: `chat` → `snapshotId` → `renderedText` into the system prompt;
`chat` → `datasourceId` → connection for `run_read_query`; both IDs travel in
Mastra's `RuntimeContext`, never as tool parameters the model can set.

## Entity relationships

```
user (existing, unused by MVP)

datasource 1──n schema_snapshot
    │                  │
    │ 1                │ 1
    n                  n
  chat ────────────────┘        (chat pins exactly one snapshot)
    │ 1
    n
 query_log ──n──1 datasource

@mastra/pg tables ──── keyed by threadId = chat.id
```

## Open items

- `schema_snapshot` retention. Unbounded growth is harmless at MVP scale;
  pruning needs to respect the RESTRICT from `chat`.
- Whether `sslMode` should be a full `ssl` jsonb (CA certs etc.) once this points
  at a managed Postgres.
