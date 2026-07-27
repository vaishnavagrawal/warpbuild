/**
 * Mastra tool: run_read_query
 *
 * Wraps `runReadQuery` so an agent can execute read-only SQL against the
 * datasource bound to the current chat. The datasourceId, chatId, and
 * messageId come from Mastra's RequestContext (set by the server before
 * the agent runs) — the model CANNOT choose which datasource to query.
 */
import { createTool } from "@mastra/core/tools";
import { runReadQuery } from "@nextjs-starter/api/datasource/run-query";
import { z } from "zod";

export const runReadQueryTool = createTool({
	id: "run_read_query",
	description:
		"Execute a read-only SQL query against the datasource. Only SELECT and WITH statements are allowed. Returns columns, rows, and metadata.",
	inputSchema: z.object({
		sql: z.string().describe("The SQL query to execute (SELECT or WITH only)."),
		purpose: z
			.string()
			.optional()
			.describe("Short description of what this query is trying to find."),
	}),
	outputSchema: z.object({
		ok: z.boolean(),
		columns: z.array(z.string()).optional(),
		rows: z.array(z.record(z.string(), z.unknown())).optional(),
		rowCount: z.number().optional(),
		truncated: z.boolean().optional(),
		sql: z.string(),
		durationMs: z.number(),
		error: z.string().optional(),
		reason: z.string().optional(),
	}),
	execute: async (inputData, context) => {
		const requestContext = context.requestContext;
		const datasourceId = requestContext.get("datasourceId" as never) as
			| string
			| undefined;
		const chatId = requestContext.get("chatId" as never) as string | undefined;
		const messageId = requestContext.get("messageId" as never) as
			| string
			| undefined;

		if (!datasourceId) {
			return {
				ok: false,
				sql: inputData.sql,
				durationMs: 0,
				error: "No datasourceId in request context. Cannot execute query.",
			};
		}

		const result = await runReadQuery({
			datasourceId,
			sql: inputData.sql,
			chatId: chatId ?? null,
			messageId: messageId ?? null,
		});

		if (result.ok) {
			return {
				ok: true,
				columns: result.columns,
				rows: result.rows,
				rowCount: result.rowCount,
				truncated: result.truncated,
				sql: result.sql,
				durationMs: result.durationMs,
			};
		}

		return {
			ok: false,
			sql: result.sql,
			durationMs: result.durationMs,
			error: result.error,
			reason: result.reason,
		};
	},
});
