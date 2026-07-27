import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
	server: {
		DATABASE_URL: z.string().min(1),
		BETTER_AUTH_SECRET: z.string().min(32),
		BETTER_AUTH_URL: z.url(),
		CORS_ORIGIN: z.url(),
		NODE_ENV: z
			.enum(["development", "production", "test"])
			.default("development"),
		/** Per-statement timeout applied to every read query on a datasource. */
		DATASOURCE_STATEMENT_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(15_000),
		/** Connection timeout for datasource clients. */
		DATASOURCE_CONNECT_TIMEOUT_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(10_000),
		/** Hard row cap; results beyond this are truncated. */
		DATASOURCE_MAX_ROWS: z.coerce.number().int().positive().default(500),

		// ── LLM (OpenAI-compatible endpoint) ──────────────────────────────────────
		/** Base URL of the OpenAI-compatible API (e.g. http://localhost:11434/v1). */
		LLM_BASE_URL: z.string().url(),
		/** API key for the LLM endpoint. */
		LLM_API_KEY: z.string().min(1),
		/** Model identifier in provider/model format (e.g. openai/gpt-4o-mini). */
		LLM_MODEL: z.string().min(1),
	},
	runtimeEnv: process.env,
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	emptyStringAsUndefined: true,
});
