import { relations } from "drizzle-orm";
import {
	index,
	integer,
	jsonb,
	pgTable,
	text,
	timestamp,
	unique,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

/** Datasource engines. Only `postgres` is implemented in the MVP. */
export const DATASOURCE_TYPES = ["postgres", "clickhouse", "mongo"] as const;
export type DatasourceType = (typeof DATASOURCE_TYPES)[number];

export const SSL_MODES = ["disable", "prefer", "require"] as const;
export type SslMode = (typeof SSL_MODES)[number];

export const DATASOURCE_STATUSES = [
	"unverified",
	"connected",
	"error",
] as const;
export type DatasourceStatus = (typeof DATASOURCE_STATUSES)[number];

/**
 * Structured introspection result stored in `schema_snapshot.definition`.
 * `renderedText` on the snapshot is the prompt-ready rendering of this.
 */
export type SchemaDefinition = {
	dialect: "postgres";
	serverVersion: string;
	schemas: Array<{
		name: string;
		tables: Array<{
			name: string;
			kind: "table" | "view" | "materialized_view";
			comment: string | null;
			columns: Array<{
				name: string;
				dataType: string;
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

/**
 * One row per configured external database.
 *
 * `connectionString` is plaintext for the MVP (encryption is explicitly
 * deferred) and must never be returned to the client — read procedures return a
 * redacted projection instead.
 */
export const datasource = pgTable("datasource", {
	id: text("id")
		.primaryKey()
		.$defaultFn(() => nanoid()),
	name: text("name").notNull(),
	type: text("type").$type<DatasourceType>().notNull().default("postgres"),
	connectionString: text("connection_string").notNull(),
	sslMode: text("ssl_mode").$type<SslMode>().notNull().default("prefer"),
	status: text("status")
		.$type<DatasourceStatus>()
		.notNull()
		.default("unverified"),
	lastCheckedAt: timestamp("last_checked_at"),
	lastError: text("last_error"),
	createdAt: timestamp("created_at").defaultNow().notNull(),
	updatedAt: timestamp("updated_at")
		.defaultNow()
		.$onUpdate(() => /* @__PURE__ */ new Date())
		.notNull(),
});

/**
 * Immutable, versioned introspection result. Refresh appends a version, it
 * never mutates one. Only successful introspections become rows.
 */
export const schemaSnapshot = pgTable(
	"schema_snapshot",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		datasourceId: text("datasource_id")
			.notNull()
			.references(() => datasource.id, { onDelete: "cascade" }),
		/** Monotonic per datasource, starts at 1. */
		version: integer("version").notNull(),
		/** sha256 of the canonicalised `definition`; lets refresh skip no-ops. */
		checksum: text("checksum").notNull(),
		definition: jsonb("definition").$type<SchemaDefinition>().notNull(),
		renderedText: text("rendered_text").notNull(),
		tableCount: integer("table_count").notNull(),
		tokenEstimate: integer("token_estimate").notNull(),
		syncedAt: timestamp("synced_at").defaultNow().notNull(),
	},
	(table) => [
		unique("schema_snapshot_datasourceId_version_key").on(
			table.datasourceId,
			table.version,
		),
		index("schema_snapshot_datasourceId_idx").on(table.datasourceId),
	],
);

export const datasourceRelations = relations(datasource, ({ many }) => ({
	snapshots: many(schemaSnapshot),
}));

export const schemaSnapshotRelations = relations(schemaSnapshot, ({ one }) => ({
	datasource: one(datasource, {
		fields: [schemaSnapshot.datasourceId],
		references: [datasource.id],
	}),
}));
