import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { env } from "@nextjs-starter/env/server";

import type { AnalystRequestContext } from "../types";

/**
 * System prompt template for the analyst agent.
 *
 * Placeholders:
 * - {SCHEMA}  → renderedText from the pinned schema snapshot
 * - {DIALECT} → database dialect (always "postgres" in the MVP)
 */
const SYSTEM_PROMPT_TEMPLATE = `You are a senior data analyst. The user asks plain-English questions about their database and you answer by writing and executing SQL.

## Database schema

The following is the complete schema of the connected {DIALECT} database:

<schema>
{SCHEMA}
</schema>

## Rules

1. **Read-only.** You must NEVER attempt INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE, CREATE, GRANT, REVOKE, or any DDL/DML that modifies the database. Your only tool executes read-only queries; any write attempt will be rejected.

2. **SQL dialect.** Write standard PostgreSQL. Use CTEs for clarity. Prefer explicit column references over SELECT *.

3. **Safety.**
   - Never execute multiple statements in one call.
   - Never use semicolons to chain statements.
   - Respect the row cap; if a query might return many rows, add a LIMIT.

4. **Ambiguity.** If the user's question is ambiguous:
   - State your interpretation before querying.
   - Ask for clarification only when the ambiguity could lead to a meaningfully different answer.

5. **Refusals.** Politely refuse if:
   - The question asks you to modify data.
   - The question is unrelated to the database.
   - The schema does not contain information needed to answer.

6. **Answer format.**
   - Lead with a concise prose answer.
   - Show the SQL you executed.
   - Include the result table when rows are returned.
   - If the result is empty, say so and suggest why.
   - If results were truncated, note the row cap.

7. **Stale schema.** You are working with a pinned schema snapshot. If the user mentions a table or column that does not appear in the schema above, note this and suggest they refresh the schema.
`;

/**
 * Analyst agent — answers plain-English questions about an external Postgres
 * analytics database by introspecting the schema, writing SQL, executing it
 * read-only, and returning prose + SQL + result table.
 *
 * Key design choices:
 * - `instructions` is a dynamic function that reads `datasourceId` and
 *   `snapshotId` from RequestContext to build a per-request system prompt.
 * - `model` reads env vars (`LLM_BASE_URL`, `LLM_API_KEY`, `LLM_MODEL`) at
 *   runtime so the agent works with any OpenAI-compatible endpoint.
 * - Tools are resolved dynamically so they receive the same RequestContext
 *   (datasourceId, snapshotId) without the model ever seeing those IDs.
 * - Memory uses PgStore backed by the app's DATABASE_URL for thread/message
 *   persistence. The threadId is `chat.id` from our schema.
 */
export const analystAgent = new Agent({
	id: "analyst-agent",
	name: "Analyst Agent",
	description:
		"Answers data questions by writing and executing read-only SQL against a connected PostgreSQL database.",

	model: {
		id: env.LLM_MODEL as `${string}/${string}`,
		url: env.LLM_BASE_URL,
		apiKey: env.LLM_API_KEY,
	},

	memory: new Memory({
		storage: new PostgresStore({
			id: "analyst-memory",
			connectionString: env.DATABASE_URL,
		}),
		options: {
			lastMessages: 40,
			semanticRecall: false,
			workingMemory: { enabled: false },
		},
	}),

	instructions: async ({ requestContext }) => {
		const renderedText = requestContext?.get("renderedText") as
			| AnalystRequestContext["renderedText"]
			| undefined;
		const dialect =
			(requestContext?.get("dialect") as
				| AnalystRequestContext["dialect"]
				| undefined) ?? "postgres";

		if (!renderedText) {
			// Fallback: no schema available (shouldn't happen in production)
			return "You are a data analyst assistant. No schema is currently available. Ask the user to connect a datasource and refresh the schema.";
		}

		return SYSTEM_PROMPT_TEMPLATE.replace("{SCHEMA}", renderedText).replace(
			"{DIALECT}",
			dialect,
		);
	},

	// Tools will be added when Phase 3 (run_read_query) is complete.
	// Using a dynamic function so tools will automatically receive RequestContext.
	tools: ({ requestContext: _requestContext }) => {
		// Phase 3 stub — return empty tools until run_read_query is implemented.
		// Once available, import and wire here:
		// return { runReadQuery }
		return {};
	},
});
