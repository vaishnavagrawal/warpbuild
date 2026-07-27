/**
 * Pure helpers for describing and redacting datasource credentials.
 *
 * Deliberately free of any import that touches env or `pg` so this module can
 * be unit-tested without a configured environment. `connect.ts` re-exports
 * everything here, so callers keep a single import site.
 */

/**
 * A redacted view of a connection string, safe to return to the client.
 * The password is never included.
 */
export type ConnectionTarget = {
	host: string;
	port: number | null;
	database: string;
	user: string;
};

/**
 * Parse a Postgres connection string into its non-secret parts.
 * Returns `null` when the string is unparseable rather than throwing, so
 * read procedures can still render a row with a broken connection string.
 */
export function describeConnection(
	connectionString: string,
): ConnectionTarget | null {
	try {
		const url = new URL(connectionString);
		return {
			host: url.hostname,
			port: url.port ? Number(url.port) : null,
			database: url.pathname.replace(/^\//, "") || "",
			user: decodeURIComponent(url.username),
		};
	} catch {
		return null;
	}
}

/** Normalise a driver/DNS error into a single-line message for the UI. */
export function connectionErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return String(error);
}

/**
 * Strip the connection string and its password out of a message.
 *
 * Every path that surfaces a datasource error to the client or persists it to
 * `datasource.lastError` (which IS returned to the client) must go through
 * here — driver errors sometimes echo the DSN back.
 */
export function sanitizeConnectionError(
	message: string,
	connectionString: string,
): string {
	if (!connectionString) return message;
	let safe = message.replaceAll(connectionString, "[REDACTED]");
	try {
		const url = new URL(connectionString);
		if (url.password) {
			safe = safe.replaceAll(url.password, "[REDACTED]");
			safe = safe.replaceAll(decodeURIComponent(url.password), "[REDACTED]");
		}
	} catch {
		// Unparseable DSN: the plain string replacement above is all we can do.
	}
	return safe;
}

/** `connectionErrorMessage` + `sanitizeConnectionError` in one step. */
export function safeConnectionErrorMessage(
	error: unknown,
	connectionString: string,
): string {
	return sanitizeConnectionError(
		connectionErrorMessage(error),
		connectionString,
	);
}
