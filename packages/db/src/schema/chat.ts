import { relations } from "drizzle-orm";
import { index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

import { datasource, schemaSnapshot } from "./datasource";

/**
 * A chat session. `id` doubles as the Mastra `threadId`; message persistence is
 * owned by `@mastra/pg`, so there is no messages table here.
 *
 * The datasource and its schema version are pinned at creation time — refresh
 * creates a new snapshot, but an existing chat keeps the one it pinned.
 */
export const chat = pgTable(
	"chat",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		title: text("title"),
		datasourceId: text("datasource_id")
			.notNull()
			.references(() => datasource.id, { onDelete: "cascade" }),
		/** Pinned schema version. RESTRICT so a chat's prompt stays reconstructable. */
		snapshotId: text("snapshot_id")
			.notNull()
			.references(() => schemaSnapshot.id, { onDelete: "restrict" }),
		createdAt: timestamp("created_at").defaultNow().notNull(),
		updatedAt: timestamp("updated_at")
			.defaultNow()
			.$onUpdate(() => /* @__PURE__ */ new Date())
			.notNull(),
	},
	(table) => [index("chat_datasourceId_idx").on(table.datasourceId)],
);

export const chatRelations = relations(chat, ({ one }) => ({
	datasource: one(datasource, {
		fields: [chat.datasourceId],
		references: [datasource.id],
	}),
	snapshot: one(schemaSnapshot, {
		fields: [chat.snapshotId],
		references: [schemaSnapshot.id],
	}),
}));
