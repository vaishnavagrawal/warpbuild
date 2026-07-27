import { Mastra } from "@mastra/core";
import { PostgresStore } from "@mastra/pg";
import { env } from "@nextjs-starter/env/server";

import { analystAgent } from "./agents/analyst-agent";

/**
 * Mastra instance for the NL→SQL agent app.
 *
 * - Registers the analyst agent.
 * - Uses PostgresStore for Mastra's own infrastructure tables (threads, etc.).
 * - Memory is configured directly on the agent (same PG instance).
 */
export const mastra = new Mastra({
	agents: { analystAgent },
	storage: new PostgresStore({
		id: "nlsql-mastra-storage",
		connectionString: env.DATABASE_URL,
	}),
});
