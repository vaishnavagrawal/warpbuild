import type { SslMode } from "@nextjs-starter/db/schema/datasource";
import { env } from "@nextjs-starter/env/server";
import { Client, type ClientConfig } from "pg";

// Redaction/describe helpers live in redact.ts (no env or pg imports, so they
// stay unit-testable) and are re-exported here to keep one import site.
export {
	type ConnectionTarget,
	connectionErrorMessage,
	describeConnection,
	safeConnectionErrorMessage,
	sanitizeConnectionError,
} from "./redact";

/**
 * Everything needed to open a connection to an external datasource. Kept as a
 * plain object (not the drizzle row) so callers can pass unsaved form input to
 * `testConnection` before a row exists.
 */
export type DatasourceConnection = {
	connectionString: string;
	sslMode: SslMode;
};

/**
 * `pg` has no `sslmode` option of its own, so map ours onto its `ssl` field.
 *
 * `prefer` cannot be expressed by node-postgres (it has no negotiate-then-
 * downgrade path), so it is treated as "try TLS, don't verify the chain" — the
 * pragmatic choice for local Postgres and managed providers with self-signed
 * certs. `require` also skips chain verification because the MVP has no CA
 * bundle configuration; see the `ssl` jsonb open item in spec/db-schema.md.
 */
export function sslConfigFor(sslMode: SslMode): ClientConfig["ssl"] {
	switch (sslMode) {
		case "disable":
			return false;
		case "require":
		case "prefer":
			return { rejectUnauthorized: false };
	}
}

/**
 * Open a short-lived client, run `fn`, and always close it.
 *
 * Serverless plus an external DB means no long-lived pool is held across a
 * chat; we connect per call. Known scaling item, not an MVP blocker.
 * Node runtime only — `pg` needs raw TCP.
 */
export async function withDatasourceClient<T>(
	connection: DatasourceConnection,
	fn: (client: Client) => Promise<T>,
): Promise<T> {
	const client = new Client({
		connectionString: connection.connectionString,
		ssl: sslConfigFor(connection.sslMode),
		connectionTimeoutMillis: env.DATASOURCE_CONNECT_TIMEOUT_MS,
		application_name: "nlsql-agent",
	});

	await client.connect();
	try {
		return await fn(client);
	} finally {
		await client.end().catch(() => {
			// Closing is best-effort; a failed teardown must not mask the result.
		});
	}
}
