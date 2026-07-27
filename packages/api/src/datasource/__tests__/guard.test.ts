import { describe, expect, test } from "bun:test";
import { checkReadOnlySql } from "../guard";

describe("checkReadOnlySql", () => {
	describe("rejection: write statements", () => {
		test("rejects INSERT INTO", () => {
			const result = checkReadOnlySql("INSERT INTO t VALUES (1)");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects UPDATE", () => {
			const result = checkReadOnlySql("UPDATE t SET a=1");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects DELETE", () => {
			const result = checkReadOnlySql("DELETE FROM t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects DROP TABLE", () => {
			const result = checkReadOnlySql("DROP TABLE t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects TRUNCATE", () => {
			const result = checkReadOnlySql("TRUNCATE t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects ALTER TABLE", () => {
			const result = checkReadOnlySql("ALTER TABLE t ADD COLUMN x INT");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects GRANT", () => {
			const result = checkReadOnlySql("GRANT ALL ON t TO public");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects SET ROLE", () => {
			const result = checkReadOnlySql("SET ROLE postgres");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});
	});

	describe("rejection: multi-statement", () => {
		test("rejects SELECT followed by DROP TABLE", () => {
			const result = checkReadOnlySql("SELECT 1; DROP TABLE t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("multi_statement");
			}
		});

		test("rejects SELECT followed by DELETE (no space)", () => {
			const result = checkReadOnlySql("SELECT 1;DELETE FROM t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("multi_statement");
			}
		});
	});

	describe("rejection: comment-based smuggling", () => {
		test("rejects -- comment hiding a second statement", () => {
			// The attacker tries: SELECT 1 --\nDROP TABLE t
			// After comment stripping, code is "SELECT 1 " + "DROP TABLE t"
			// The forbidden keyword scan catches DROP.
			const result = checkReadOnlySql("SELECT 1 --\nDROP TABLE t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects /* */ comment prefix hiding a write", () => {
			// /*x*/DELETE FROM t
			const result = checkReadOnlySql("/*x*/DELETE FROM t");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});
	});

	describe("rejection: data-modifying CTE", () => {
		test("rejects WITH ... INSERT ... RETURNING CTE", () => {
			const sql =
				"WITH x AS (INSERT INTO t VALUES (1) RETURNING *) SELECT * FROM x";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});
	});

	describe("rejection: empty/whitespace input", () => {
		test("rejects empty string", () => {
			const result = checkReadOnlySql("");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("parse_failed");
			}
		});

		test("rejects whitespace-only input", () => {
			const result = checkReadOnlySql("   \n\t  ");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("parse_failed");
			}
		});

		test("rejects comment-only input", () => {
			const result = checkReadOnlySql("-- just a comment");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("parse_failed");
			}
		});
	});

	describe("acceptance: valid read-only queries", () => {
		test("accepts plain SELECT", () => {
			const result = checkReadOnlySql("SELECT 1");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.sql).toBe("SELECT 1");
			}
		});

		test("accepts SELECT with trailing semicolon", () => {
			const result = checkReadOnlySql("SELECT * FROM users;");
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.sql).toBe("SELECT * FROM users");
			}
		});

		test("accepts multi-line SELECT with joins and comments", () => {
			const sql = `
-- fetch user data
SELECT u.id, u.name, o.total
FROM users u
/* join orders */
JOIN orders o ON o.user_id = u.id
WHERE u.active = true
ORDER BY o.total DESC
LIMIT 10;
`;
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
		});

		test("accepts read-only WITH ... SELECT CTE", () => {
			const sql = "WITH x AS (SELECT id, name FROM users) SELECT * FROM x";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.sql).toContain("WITH");
			}
		});

		test("accepts SELECT with string literal containing 'delete'", () => {
			const sql = "SELECT * FROM logs WHERE action = 'delete'";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.sql).toBe("SELECT * FROM logs WHERE action = 'delete'");
			}
		});

		test("accepts SELECT with string literal containing semicolons", () => {
			const sql = "SELECT * FROM t WHERE val = 'a;b;c'";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
			if (result.ok) {
				expect(result.sql).toBe("SELECT * FROM t WHERE val = 'a;b;c'");
			}
		});

		test("preserves string literals in WHERE clause (IN and OR)", () => {
			const inSql = "SELECT * FROM customers WHERE country IN ('USA', 'UK')";
			const inResult = checkReadOnlySql(inSql);
			expect(inResult.ok).toBe(true);
			if (inResult.ok) {
				expect(inResult.sql).toBe("SELECT * FROM customers WHERE country IN ('USA', 'UK')");
			}

			const orSql = "SELECT * FROM customers WHERE country = 'USA' OR country = 'UK'";
			const orResult = checkReadOnlySql(orSql);
			expect(orResult.ok).toBe(true);
			if (orResult.ok) {
				expect(orResult.sql).toBe("SELECT * FROM customers WHERE country = 'USA' OR country = 'UK'");
			}
		});

		test("accepts SELECT with string literal containing INSERT keyword", () => {
			const sql = "SELECT * FROM audit WHERE description = 'INSERT INTO users'";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
		});

		test("accepts SELECT with dollar-quoted string containing forbidden keywords", () => {
			const sql = "SELECT $$ DELETE FROM t; DROP TABLE x $$ AS example_text";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
		});
	});

	describe("edge cases", () => {
		test("rejects lowercase insert", () => {
			const result = checkReadOnlySql("insert into t values (1)");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("rejects mixed-case DrOp TaBlE", () => {
			const result = checkReadOnlySql("DrOp TaBlE users");
			expect(result.ok).toBe(false);
			if (!result.ok) {
				expect(result.reason).toBe("not_read_only");
			}
		});

		test("accepts SELECT with subquery containing no forbidden ops", () => {
			const sql = "SELECT * FROM (SELECT id FROM users WHERE active) sub";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
		});

		test("does not false-positive on column name containing 'update'", () => {
			// 'updated_at' contains 'update' but is not a whole-word match
			const sql = "SELECT updated_at FROM users";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
		});

		test("does not false-positive on 'do' inside a word like 'domain'", () => {
			const sql = "SELECT domain FROM sites";
			const result = checkReadOnlySql(sql);
			expect(result.ok).toBe(true);
		});
	});
});
