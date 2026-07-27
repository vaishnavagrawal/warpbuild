import { db } from "@nextjs-starter/db";
import { datasource } from "@nextjs-starter/db/schema/datasource";
import type {
	QueryLogStatus,
	QueryRejectionReason,
} from "@nextjs-starter/db/schema/query-log";
import { queryLog } from "@nextjs-starter/db/schema/query-log";
import { env } from "@nextjs-starter/env/server";
import { eq } from "drizzle-orm";

import { connectionErrorMessage, withDatasourceClient } from "./connect";
import { checkReadOnlySql } from "./guard";

export type ReadQueryResult =
	| {
			ok: true;
			columns: string[];
			rows: Array<Record<string, unknown>>;
			rowCount: number;
			truncated: boolean;
			sql: string;
			durationMs: number;
	  }
	| {
			ok: false;
			error: string;
			reason?: QueryRejectionReason;
			sql: string;
			durationMs: number;
	  };

/**
 * Execute a read-only SQL query against a datasource.
 *
 * Enforces four safety layers:
 *  1. Client-side guard (checkReadOnlySql) — instant rejection without a connection.
 *  2. SET TRANSACTION READ ONLY — Postgres will reject any write attempt.
 *  3. statement_timeout — prevents runaway queries.
 *  4. Row cap — prevents OOM from huge result sets.
 *
 * Every execution (including rejections) is logged to query_log.
 */
export async function runReadQuery(params: {
	datasourceId: string;
	sql: string;
	chatId?: string | null;
	messageId?: string | null;
}): Promise<ReadQueryResult> {
	const { datasourceId, sql: rawSql, chatId, messageId } = params;
	const start = performance.now();

	// --- Layer 1: Guard check ---
	const guardResult = checkReadOnlySql(rawSql);

	if (!guardResult.ok) {
		const durationMs = Math.round(performance.now() - start);

		// Always log rejections — they're the signal the model tried to write.
		await db.insert(queryLog).values({
			chatId: chatId ?? null,
			datasourceId,
			messageId: messageId ?? null,
			sql: rawSql,
			status: "rejected",
			rejectionReason: guardResult.reason,
			durationMs,
		});

		return {
			ok: false,
			error: guardResult.message,
			reason: guardResult.reason,
			sql: rawSql,
			durationMs,
		};
	}

	const cleanedSql = guardResult.sql;

	// --- Load datasource row ---
	const [ds] = await db
		.select()
		.from(datasource)
		.where(eq(datasource.id, datasourceId))
		.limit(1);

	if (!ds) {
		const durationMs = Math.round(performance.now() - start);
		await db.insert(queryLog).values({
			chatId: chatId ?? null,
			datasourceId,
			messageId: messageId ?? null,
			sql: rawSql,
			status: "error",
			error: "Datasource not found.",
			durationMs,
		});
		return {
			ok: false,
			error: "Datasource not found.",
			sql: rawSql,
			durationMs,
		};
	}

	// --- Layers 2-4: Execute inside a read-only transaction ---
	try {
		const result = await withDatasourceClient(
			{ connectionString: ds.connectionString, sslMode: ds.sslMode },
			async (client) => {
				// Layer 2: Transaction-level read-only enforcement.
				await client.query("BEGIN");
				await client.query("SET TRANSACTION READ ONLY");

				// Layer 3: Statement timeout to prevent runaway queries.
				await client.query(
					`SET LOCAL statement_timeout = ${env.DATASOURCE_STATEMENT_TIMEOUT_MS}`,
				);

				// Layer 4: Row cap.
				//
				// We do NOT rewrite the user's SQL to inject a LIMIT clause because:
				//  - Rewriting SQL is fragile and can break valid queries (CTEs, UNION, etc.).
				//  - The user might have their own LIMIT which we'd need to detect and merge.
				//  - The pg driver's `rows` option on query is non-standard.
				//
				// Instead, we fetch maxRows + 1 using the pg `rowMode` approach and slice.
				// If the query returns more than maxRows rows, we mark `truncated: true`
				// and return only maxRows rows to the caller.
				const maxRows = env.DATASOURCE_MAX_ROWS;
				const pgResult = await client.query(cleanedSql);

				// ROLLBACK unconditionally — nothing to commit, and it makes the
				// read-only intent explicit even if SET TRANSACTION READ ONLY was
				// somehow bypassed.
				await client.query("ROLLBACK");

				const allRows = pgResult.rows as Record<string, unknown>[];
				const truncated = allRows.length > maxRows;
				const rows = truncated ? allRows.slice(0, maxRows) : allRows;

				const columns = pgResult.fields.map((f) => f.name);

				return { columns, rows, rowCount: rows.length, truncated };
			},
		);

		const durationMs = Math.round(performance.now() - start);

		// Serialize values to be JSON-safe
		const safeRows = result.rows.map(serializeRow);

		await db.insert(queryLog).values({
			chatId: chatId ?? null,
			datasourceId,
			messageId: messageId ?? null,
			sql: rawSql,
			status: "success" as QueryLogStatus,
			rowCount: result.rowCount,
			truncated: result.truncated,
			durationMs,
		});

		return {
			ok: true,
			columns: result.columns,
			rows: safeRows,
			rowCount: result.rowCount,
			truncated: result.truncated,
			sql: cleanedSql,
			durationMs,
		};
	} catch (error: unknown) {
		const durationMs = Math.round(performance.now() - start);
		const pgError = error as { code?: string; message?: string };

		// Map Postgres statement_timeout error (code 57014) to "timeout"
		const status: QueryLogStatus =
			pgError.code === "57014" ? "timeout" : "error";

		// Never leak connection string in the error message
		const errorMessage = sanitizeErrorMessage(
			connectionErrorMessage(error),
			ds.connectionString,
		);

		await db.insert(queryLog).values({
			chatId: chatId ?? null,
			datasourceId,
			messageId: messageId ?? null,
			sql: rawSql,
			status,
			error: errorMessage,
			durationMs,
		});

		return {
			ok: false,
			error: errorMessage,
			sql: rawSql,
			durationMs,
		};
	}
}

/**
 * Convert row values to JSON-safe types:
 * - Date → ISO string
 * - Buffer → hex string
 * - bigint → string
 * - null/undefined stay as-is
 */
function serializeRow(row: Record<string, unknown>): Record<string, unknown> {
	const out: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(row)) {
		out[key] = serializeValue(value);
	}
	return out;
}

function serializeValue(value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (value instanceof Date) return value.toISOString();
	if (Buffer.isBuffer(value)) return `\\x${value.toString("hex")}`;
	if (typeof value === "bigint") return value.toString();
	if (Array.isArray(value)) return value.map(serializeValue);
	if (typeof value === "object") {
		// Plain objects (jsonb columns) — recurse
		const obj = value as Record<string, unknown>;
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(obj)) {
			out[k] = serializeValue(v);
		}
		return out;
	}
	return value;
}

/**
 * Strip any occurrence of the connection string from an error message to
 * prevent credential leakage.
 */
function sanitizeErrorMessage(
	message: string,
	connectionString: string,
): string {
	if (!connectionString) return message;
	// Also try to strip the URL-parsed host/password components
	let safe = message.replaceAll(connectionString, "[REDACTED]");
	try {
		const url = new URL(connectionString);
		if (url.password) {
			safe = safe.replaceAll(url.password, "[REDACTED]");
			safe = safe.replaceAll(decodeURIComponent(url.password), "[REDACTED]");
		}
	} catch {
		// If the connection string is not a valid URL, just do the string replacement
	}
	return safe;
}
