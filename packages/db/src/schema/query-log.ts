import { relations } from "drizzle-orm";
import {
	boolean,
	index,
	integer,
	pgTable,
	text,
	timestamp,
} from "drizzle-orm/pg-core";
import { nanoid } from "nanoid";

import { chat } from "./chat";
import { datasource } from "./datasource";

export const QUERY_LOG_STATUSES = [
	"success",
	"rejected",
	"error",
	"timeout",
] as const;
export type QueryLogStatus = (typeof QUERY_LOG_STATUSES)[number];

/** Which read-only guard layer tripped. */
export const QUERY_REJECTION_REASONS = [
	"not_read_only",
	"multi_statement",
	"parse_failed",
] as const;
export type QueryRejectionReason = (typeof QUERY_REJECTION_REASONS)[number];

/**
 * Every SQL statement the agent produced, including the ones the read-only
 * guard refused. `rejected` rows are the evidence that the guard held.
 */
export const queryLog = pgTable(
	"query_log",
	{
		id: text("id")
			.primaryKey()
			.$defaultFn(() => nanoid()),
		/** Nullable so a dev/test harness can execute without a chat. */
		chatId: text("chat_id").references(() => chat.id, { onDelete: "cascade" }),
		datasourceId: text("datasource_id")
			.notNull()
			.references(() => datasource.id, { onDelete: "cascade" }),
		/** Mastra message id; correlates a statement to a turn. */
		messageId: text("message_id"),
		/** Exactly what the tool received, pre-mutation. */
		sql: text("sql").notNull(),
		status: text("status").$type<QueryLogStatus>().notNull(),
		rejectionReason: text("rejection_reason").$type<QueryRejectionReason>(),
		rowCount: integer("row_count"),
		truncated: boolean("truncated").default(false).notNull(),
		durationMs: integer("duration_ms"),
		error: text("error"),
		createdAt: timestamp("created_at").defaultNow().notNull(),
	},
	(table) => [
		index("query_log_chatId_idx").on(table.chatId),
		index("query_log_createdAt_idx").on(table.createdAt),
	],
);

export const queryLogRelations = relations(queryLog, ({ one }) => ({
	chat: one(chat, {
		fields: [queryLog.chatId],
		references: [chat.id],
	}),
	datasource: one(datasource, {
		fields: [queryLog.datasourceId],
		references: [datasource.id],
	}),
}));
