/**
 * Four-layer read-only SQL guard.
 *
 * This is a best-effort client-side parse check. It is NOT a substitute for
 * real enforcement — the actual safety net is `SET TRANSACTION READ ONLY` at
 * the connection level (see run-query.ts). This guard exists to:
 *  1. Give instant feedback without a round-trip.
 *  2. Log rejection reasons for debugging model misbehavior.
 *  3. Reject obviously malicious payloads before they touch a connection.
 *
 * No SQL parser dependency is added by design. A regex + small tokenizer is the
 * right size for a guard that is always backed by transaction-level READ ONLY.
 */
import type { QueryRejectionReason } from "@nextjs-starter/db/schema/query-log";

export type GuardResult =
	| { ok: true; sql: string }
	| { ok: false; reason: QueryRejectionReason; message: string };

/**
 * Tokenize a SQL string into segments that are either "code" (outside string
 * literals) or "string" (inside single-quoted or dollar-quoted literals).
 * Comments are stripped from code segments. This is quote-aware: `--` and `/*`
 * inside string literals are preserved as-is.
 */
function tokenize(input: string): { code: string[]; full: string } {
	const codeSegments: string[] = [];
	let full = "";
	let i = 0;
	const len = input.length;
	let current = "";

	while (i < len) {
		// Single-quoted string literal
		if (input[i] === "'") {
			// Everything inside quotes is NOT code — flush current code
			codeSegments.push(current);
			full += current;
			current = "";

			const startIdx = i;
			i++; // skip opening quote
			while (i < len) {
				if (input[i] === "'" && input[i + 1] === "'") {
					// escaped quote
					i += 2;
				} else if (input[i] === "'") {
					i++; // skip closing quote
					break;
				} else {
					i++;
				}
			}
			full += input.slice(startIdx, i);
			continue;
		}

		// Double-quoted identifier: "col;name". Not code — a quoted identifier can
		// never be a statement boundary or a keyword, so treating it as opaque both
		// removes false-positive rejections and gives nothing away to an attacker.
		if (input[i] === '"') {
			codeSegments.push(current);
			full += current;
			current = "";

			const startIdx = i;
			i++; // skip opening quote
			while (i < len) {
				if (input[i] === '"' && input[i + 1] === '"') {
					i += 2; // escaped quote inside identifier
				} else if (input[i] === '"') {
					i++; // skip closing quote
					break;
				} else {
					i++;
				}
			}
			full += input.slice(startIdx, i);
			continue;
		}

		// Dollar-quoted string literal: $tag$...$tag$
		if (input[i] === "$") {
			const tagMatch = input.slice(i).match(/^\$([A-Za-z0-9_]*)\$/);
			if (tagMatch) {
				const tag = tagMatch[0]; // e.g. $$ or $tag$
				codeSegments.push(current);
				full += current;
				current = "";

				const startIdx = i;
				i += tag.length; // skip opening tag
				const endIdx = input.indexOf(tag, i);
				if (endIdx === -1) {
					// unterminated — treat rest as string
					i = len;
				} else {
					i = endIdx + tag.length;
				}
				full += input.slice(startIdx, i);
				continue;
			}
		}

		// Line comment: --
		if (input[i] === "-" && input[i + 1] === "-") {
			// Skip to end of line
			const nlIdx = input.indexOf("\n", i);
			if (nlIdx === -1) {
				i = len;
			} else {
				i = nlIdx + 1;
				current += " "; // replace comment with space to avoid token merging
				full += " ";
			}
			continue;
		}

		// Block comment: /* ... */
		if (input[i] === "/" && input[i + 1] === "*") {
			const endIdx = input.indexOf("*/", i + 2);
			if (endIdx === -1) {
				i = len;
			} else {
				i = endIdx + 2;
				current += " "; // replace comment with space
				full += " ";
			}
			continue;
		}

		current += input[i];
		i++;
	}

	codeSegments.push(current);
	full += current;

	return { code: codeSegments, full };
}

/**
 * Check if a semicolon exists in the code segments (outside of string literals).
 */
function hasSemicolonInCode(codeSegments: string[]): boolean {
	return codeSegments.some((seg) => seg.includes(";"));
}

/**
 * Forbidden keywords/identifiers that indicate a non-read-only statement.
 * Matched as whole words (word boundary on both sides) in code segments only.
 */
const FORBIDDEN_KEYWORDS = [
	"INSERT",
	"UPDATE",
	"DELETE",
	"DROP",
	"TRUNCATE",
	"ALTER",
	"CREATE",
	"GRANT",
	"REVOKE",
	"COMMENT",
	"COPY",
	"CALL",
	"DO",
	"VACUUM",
	"REINDEX",
	"REFRESH",
	"SET",
	"RESET",
	"LOCK",
	"NOTIFY",
	"LISTEN",
	"PREPARE",
	"EXECUTE",
	"DEALLOCATE",
	"BEGIN",
	"COMMIT",
	"ROLLBACK",
	"SAVEPOINT",
	"SECURITY",
] as const;

/**
 * Dangerous function families, matched as prefixes rather than exact names.
 *
 * Exact-name matching is a trap here: `\bdblink\b` does not match
 * `dblink_exec` because `_` is a word character, so a single missing variant is
 * a bypass. These patterns cover the whole family instead. `dblink` matters
 * most — it writes to a *remote* server, which transaction-level READ ONLY on
 * this connection cannot stop.
 */
const FORBIDDEN_FUNCTION_RE =
	/\b(?:dblink\w*|lo_(?:import|export)\w*|pg_\w*(?:read|write)\w*|set_config|pg_terminate_backend|pg_cancel_backend)\b/i;

/**
 * Build a single regex that matches any of the forbidden keywords as whole words.
 * Case-insensitive.
 */
const FORBIDDEN_RE = new RegExp(`\\b(${FORBIDDEN_KEYWORDS.join("|")})\\b`, "i");

/**
 * Check that the first meaningful keyword is SELECT or WITH.
 */
function firstKeywordIsReadOnly(codeFull: string): boolean {
	const trimmed = codeFull.trimStart();
	const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)/);
	if (!match?.[1]) return false;
	const kw = match[1].toUpperCase();
	return kw === "SELECT" || kw === "WITH";
}

/**
 * Four-layer read-only SQL guard. Pure function, no I/O.
 *
 * Layers:
 *  a. Strip comments (quote-aware) and trailing whitespace/semicolons.
 *  b. Reject empty input.
 *  c. Reject multi-statement (semicolons outside string literals after
 *     stripping one optional trailing one).
 *  d. First keyword must be SELECT/WITH + scan for forbidden keywords
 *     anywhere in code segments.
 */
export function checkReadOnlySql(input: string): GuardResult {
	// Layer a: tokenize (strips comments, is quote-aware)
	const { code, full } = tokenize(input);

	// Strip trailing whitespace and one optional trailing semicolon from the
	// full code representation for first-keyword and forbidden-keyword checks.
	let cleaned = full.trimEnd();
	if (cleaned.endsWith(";")) {
		cleaned = cleaned.slice(0, -1).trimEnd();
	}

	// Layer b: reject empty
	if (cleaned.length === 0) {
		return {
			ok: false,
			reason: "parse_failed",
			message: "Empty or whitespace-only input.",
		};
	}

	// Layer c: multi-statement check.
	// After stripping one optional trailing semicolon from code segments,
	// any remaining semicolon outside a string literal -> multi-statement.
	// We work on code segments: strip trailing semicolons from the last segment,
	// then check for any remaining ones.
	const codeForSemiCheck = [...code];
	// Trim trailing semicolons from the last code segment
	const lastIdx = codeForSemiCheck.length - 1;
	const lastSegRaw = codeForSemiCheck[lastIdx];
	let lastSeg = lastSegRaw ? lastSegRaw.trimEnd() : "";
	if (lastSeg.endsWith(";")) {
		lastSeg = lastSeg.slice(0, -1);
	}
	codeForSemiCheck[lastIdx] = lastSeg;

	if (hasSemicolonInCode(codeForSemiCheck)) {
		return {
			ok: false,
			reason: "multi_statement",
			message: "Multiple statements are not allowed.",
		};
	}

	// Layer d: first keyword check
	if (!firstKeywordIsReadOnly(cleaned)) {
		return {
			ok: false,
			reason: "not_read_only",
			message: "Only SELECT and WITH statements are allowed.",
		};
	}

	// Layer d (continued): scan for forbidden keywords in code segments.
	// Join code segments (string literals are excluded) and match.
	const codeOnly = code.join(" ");
	const forbiddenMatch = codeOnly.match(FORBIDDEN_RE);
	if (forbiddenMatch?.[1]) {
		return {
			ok: false,
			reason: "not_read_only",
			message: `Forbidden keyword detected: ${forbiddenMatch[1].toUpperCase()}.`,
		};
	}

	const forbiddenFunction = codeOnly.match(FORBIDDEN_FUNCTION_RE);
	if (forbiddenFunction) {
		return {
			ok: false,
			reason: "not_read_only",
			message: `Forbidden function detected: ${forbiddenFunction[0]}.`,
		};
	}

	// All layers passed — return the cleaned SQL (comments stripped, trimmed).
	return { ok: true, sql: cleaned };
}
