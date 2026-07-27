import { describe, expect, test } from "bun:test";

import { checkReadOnlySql } from "../guard";
import { sanitizeConnectionError } from "../redact";

/**
 * Regression tests for the audit findings: dangerous function families were
 * matched by exact name (so `dblink_exec` slipped past `\bdblink\b`), quoted
 * identifiers were treated as code (so a legal `"col;name"` was rejected as
 * multi-statement), and error messages could echo a DSN back to the client.
 */
describe("guard: dangerous function families", () => {
	const rejected = [
		"SELECT dblink_exec('conn', 'INSERT INTO t VALUES (1)')",
		"SELECT dblink_connect('host=x dbname=y')",
		"SELECT * FROM dblink('conn', 'select 1') AS t(a int)",
		"SELECT lo_import('/etc/passwd')",
		"SELECT lo_export(1, '/tmp/x')",
		"SELECT pg_read_file('/etc/passwd')",
		"SELECT pg_read_binary_file('/etc/passwd')",
		"SELECT pg_file_write('/tmp/x', 'y', false)",
		"SELECT pg_write_file('/tmp/x', 'y')",
		"SELECT set_config('role', 'postgres', false)",
		"SELECT pg_terminate_backend(123)",
	];

	for (const sql of rejected) {
		test(`rejects ${sql.slice(0, 48)}`, () => {
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("not_read_only");
		});
	}

	test("does not reject an ordinary column that merely starts with pg_", () => {
		expect(checkReadOnlySql("SELECT pg_class_oid FROM t").ok).toBe(true);
	});
});

describe("guard: quoted identifiers are not code", () => {
	test("accepts a quoted identifier containing a semicolon", () => {
		const result = checkReadOnlySql('SELECT "col;name" FROM t');
		expect(result.ok).toBe(true);
	});

	test("accepts a quoted identifier containing a forbidden keyword", () => {
		const result = checkReadOnlySql('SELECT "delete" FROM "update" ');
		expect(result.ok).toBe(true);
	});

	test("still rejects a real second statement after a quoted identifier", () => {
		const result = checkReadOnlySql('SELECT "a" FROM t; DROP TABLE t');
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.reason).toBe("multi_statement");
	});
});

describe("sanitizeConnectionError", () => {
	const dsn = "postgresql://alice:s3cr3t@db.example.com:5432/analytics";

	test("redacts a whole DSN echoed by the driver", () => {
		const out = sanitizeConnectionError(`could not connect to ${dsn}`, dsn);
		expect(out).not.toContain("s3cr3t");
		expect(out).toContain("[REDACTED]");
	});

	test("redacts a bare password occurrence", () => {
		const out = sanitizeConnectionError(
			'password authentication failed: "s3cr3t"',
			dsn,
		);
		expect(out).not.toContain("s3cr3t");
	});

	test("passes through when there is no connection string", () => {
		expect(sanitizeConnectionError("boom", "")).toBe("boom");
	});

	test("tolerates an unparseable connection string", () => {
		expect(sanitizeConnectionError("boom not-a-url", "not-a-url")).toBe(
			"boom [REDACTED]",
		);
	});
});
