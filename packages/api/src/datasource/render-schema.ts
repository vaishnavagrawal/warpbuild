import { createHash } from "node:crypto";
import type { SchemaDefinition } from "@nextjs-starter/db/schema/datasource";
import { parsePgArray } from "./introspect";

/**
 * Compact DDL-ish text for an LLM system prompt. Token-lean, no ASCII art.
 */
export function renderSchemaText(def: SchemaDefinition): string {
	const lines: string[] = [];

	for (const schema of def.schemas ?? []) {
		for (const table of schema.tables ?? []) {
			const header = table.comment
				? `${schema.name}.${table.name} (${table.kind}) -- ${table.comment}`
				: `${schema.name}.${table.name} (${table.kind})`;
			lines.push(header);

			for (const col of table.columns ?? []) {
				let line = `  ${col.name} ${col.dataType}`;
				if (!col.nullable) line += " NOT NULL";
				if (col.default) line += ` DEFAULT ${col.default}`;
				if (col.isPrimaryKey) line += " PK";
				if (col.comment) line += `  -- ${col.comment}`;
				lines.push(line);
			}

			for (const fk of table.foreignKeys ?? []) {
				const cols = parsePgArray(fk.columns).join(", ");
				const refCols = parsePgArray(fk.refColumns).join(", ");
				lines.push(
					`  FK (${cols}) -> ${fk.refSchema}.${fk.refTable}(${refCols})`,
				);
			}

			lines.push("");
		}
	}

	return lines.join("\n").trimEnd();
}

/**
 * Stable sha256 hex digest of the definition. Keys are recursively sorted so
 * property insertion order doesn't affect the hash.
 */
export function schemaChecksum(def: SchemaDefinition): string {
	const canonical = JSON.stringify(sortKeysDeep(def));
	return createHash("sha256").update(canonical).digest("hex");
}

/**
 * Rough token estimate — ceil(charCount / 4). This is an approximation that
 * works reasonably for English + SQL identifier text with GPT-family tokenizers.
 */
export function estimateTokens(text: string): number {
	return Math.ceil(text.length / 4);
}

/** Recursively sort object keys for canonical JSON serialisation. */
function sortKeysDeep(value: unknown): unknown {
	if (value === null || typeof value !== "object") return value;
	if (Array.isArray(value)) return value.map(sortKeysDeep);

	const sorted: Record<string, unknown> = {};
	for (const key of Object.keys(value).sort()) {
		sorted[key] = sortKeysDeep((value as Record<string, unknown>)[key]);
	}
	return sorted;
}
