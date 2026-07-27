import type { SchemaDefinition } from "@nextjs-starter/db/schema/datasource";
import type { Client } from "pg";

import { type DatasourceConnection, withDatasourceClient } from "./connect";

/**
 * Introspect a Postgres database and return a structured schema definition.
 * Uses two bulk queries (columns + FKs) to avoid N+1 per table.
 */
export async function introspectPostgres(
	connection: DatasourceConnection,
): Promise<SchemaDefinition> {
	return withDatasourceClient(connection, async (client) => {
		const [serverVersion, columns, foreignKeys] = await Promise.all([
			queryServerVersion(client),
			queryColumns(client),
			queryForeignKeys(client),
		]);

		return assembleDefinition(serverVersion, columns, foreignKeys);
	});
}

async function queryServerVersion(client: Client): Promise<string> {
	const res = await client.query("SHOW server_version");
	return res.rows[0].server_version as string;
}

interface ColumnRow {
	schema_name: string;
	table_name: string;
	relkind: string;
	table_comment: string | null;
	column_name: string;
	ordinal_position: number;
	data_type: string;
	is_nullable: boolean;
	column_default: string | null;
	is_primary_key: boolean;
	column_comment: string | null;
}

/**
 * Single query for all columns across all user schemas. Joins pg_class,
 * pg_attribute, pg_namespace, and pg_constraint to get PKs in one pass.
 */
async function queryColumns(client: Client): Promise<ColumnRow[]> {
	const sql = `
		SELECT
			n.nspname                              AS schema_name,
			c.relname                              AS table_name,
			c.relkind                              AS relkind,
			obj_description(c.oid, 'pg_class')     AS table_comment,
			a.attname                              AS column_name,
			a.attnum                               AS ordinal_position,
			format_type(a.atttypid, a.atttypmod)   AS data_type,
			NOT a.attnotnull                       AS is_nullable,
			pg_get_expr(ad.adbin, ad.adrelid)      AS column_default,
			COALESCE(pk.is_pk, false)              AS is_primary_key,
			col_description(c.oid, a.attnum)       AS column_comment
		FROM pg_namespace n
		JOIN pg_class c ON c.relnamespace = n.oid
		JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
		LEFT JOIN pg_attrdef ad ON ad.adrelid = c.oid AND ad.adnum = a.attnum
		LEFT JOIN LATERAL (
			SELECT true AS is_pk
			FROM pg_constraint con
			WHERE con.conrelid = c.oid
				AND con.contype = 'p'
				AND a.attnum = ANY(con.conkey)
			LIMIT 1
		) pk ON true
		WHERE c.relkind IN ('r', 'p', 'v', 'm')
			AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
			AND n.nspname NOT LIKE 'pg_temp%'
		ORDER BY n.nspname, c.relname, a.attnum
	`;

	const res = await client.query(sql);
	return res.rows as ColumnRow[];
}

export function parsePgArray(val: unknown): string[] {
	if (Array.isArray(val)) return val;
	if (typeof val === "string") {
		const trimmed = val.trim();
		if (!trimmed) return [];
		const content =
			trimmed.startsWith("{") && trimmed.endsWith("}")
				? trimmed.slice(1, -1)
				: trimmed;
		if (!content) return [];
		return content
			.split(",")
			.map((s) => s.trim().replace(/^"|"$/g, ""))
			.filter(Boolean);
	}
	return [];
}

interface ForeignKeyRow {
	schema_name: string;
	table_name: string;
	columns: unknown;
	ref_schema: string;
	ref_table: string;
	ref_columns: unknown;
}

async function queryForeignKeys(client: Client): Promise<ForeignKeyRow[]> {
	const sql = `
		SELECT
			n.nspname AS schema_name,
			c.relname AS table_name,
			ARRAY(
				SELECT a.attname
				FROM unnest(con.conkey) WITH ORDINALITY AS k(num, ord)
				JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.num
				ORDER BY k.ord
			)::text[] AS columns,
			rn.nspname AS ref_schema,
			rc.relname AS ref_table,
			ARRAY(
				SELECT a.attname
				FROM unnest(con.confkey) WITH ORDINALITY AS k(num, ord)
				JOIN pg_attribute a ON a.attrelid = con.confrelid AND a.attnum = k.num
				ORDER BY k.ord
			)::text[] AS ref_columns
		FROM pg_constraint con
		JOIN pg_class c ON c.oid = con.conrelid
		JOIN pg_namespace n ON n.oid = c.relnamespace
		JOIN pg_class rc ON rc.oid = con.confrelid
		JOIN pg_namespace rn ON rn.oid = rc.relnamespace
		WHERE con.contype = 'f'
			AND n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
			AND n.nspname NOT LIKE 'pg_temp%'
		ORDER BY n.nspname, c.relname
	`;

	const res = await client.query(sql);
	return res.rows as ForeignKeyRow[];
}

type TableKind = SchemaDefinition["schemas"][number]["tables"][number]["kind"];

function mapRelkind(relkind: string): TableKind {
	switch (relkind) {
		case "r":
		case "p":
			return "table";
		case "v":
			return "view";
		case "m":
			return "materialized_view";
		default:
			return "table";
	}
}

function assembleDefinition(
	serverVersion: string,
	columns: ColumnRow[],
	foreignKeys: ForeignKeyRow[],
): SchemaDefinition {
	// Group FKs by schema+table for O(1) lookup during assembly
	const fkMap = new Map<string, ForeignKeyRow[]>();
	for (const fk of foreignKeys) {
		const key = `${fk.schema_name}.${fk.table_name}`;
		const list = fkMap.get(key);
		if (list) list.push(fk);
		else fkMap.set(key, [fk]);
	}

	// Build schemas -> tables -> columns from the sorted column rows
	const schemaMap = new Map<
		string,
		Map<
			string,
			{ kind: TableKind; comment: string | null; columns: ColumnRow[] }
		>
	>();

	for (const row of columns) {
		let tables = schemaMap.get(row.schema_name);
		if (!tables) {
			tables = new Map();
			schemaMap.set(row.schema_name, tables);
		}
		let table = tables.get(row.table_name);
		if (!table) {
			table = {
				kind: mapRelkind(row.relkind),
				comment: row.table_comment,
				columns: [],
			};
			tables.set(row.table_name, table);
		}
		table.columns.push(row);
	}

	// Assemble final structure sorted deterministically
	const schemas = [...schemaMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([schemaName, tables]) => ({
			name: schemaName,
			tables: [...tables.entries()]
				.sort(([a], [b]) => a.localeCompare(b))
				.map(([tableName, table]) => ({
					name: tableName,
					kind: table.kind,
					comment: table.comment,
					columns: table.columns
						.sort((a, b) => a.ordinal_position - b.ordinal_position)
						.map((col) => ({
							name: col.column_name,
							dataType: col.data_type,
							nullable: col.is_nullable,
							default: col.column_default,
							isPrimaryKey: col.is_primary_key,
							comment: col.column_comment,
						})),
					foreignKeys: (fkMap.get(`${schemaName}.${tableName}`) ?? []).map(
						(fk) => ({
							columns: parsePgArray(fk.columns),
							refSchema: fk.ref_schema,
							refTable: fk.ref_table,
							refColumns: parsePgArray(fk.ref_columns),
						}),
					),
				})),
		}));

	return {
		dialect: "postgres",
		serverVersion,
		schemas,
	};
}
