import { describe, expect, test } from "bun:test";
import type { SchemaDefinition } from "@nextjs-starter/db/schema/datasource";

import { parsePgArray } from "../introspect";
import {
	estimateTokens,
	renderSchemaText,
	schemaChecksum,
} from "../render-schema";

const baseDef: SchemaDefinition = {
	dialect: "postgres",
	serverVersion: "16.2",
	schemas: [
		{
			name: "public",
			tables: [
				{
					name: "users",
					kind: "table",
					comment: "All registered users",
					columns: [
						{
							name: "id",
							dataType: "integer",
							nullable: false,
							default: "nextval('users_id_seq'::regclass)",
							isPrimaryKey: true,
							comment: null,
						},
						{
							name: "email",
							dataType: "text",
							nullable: false,
							default: null,
							isPrimaryKey: false,
							comment: "Unique email",
						},
					],
					foreignKeys: [],
				},
			],
		},
	],
};

describe("schemaChecksum", () => {
	test("stable across repeated calls", () => {
		const a = schemaChecksum(baseDef);
		const b = schemaChecksum(baseDef);
		expect(a).toBe(b);
		expect(a).toHaveLength(64); // sha256 hex
	});

	test("changes when a column changes", () => {
		const modified: SchemaDefinition = structuredClone(baseDef);
		const col = modified.schemas[0]?.tables[0]?.columns[1];
		if (col) col.dataType = "varchar(255)";
		expect(schemaChecksum(modified)).not.toBe(schemaChecksum(baseDef));
	});

	test("key-order independence", () => {
		// Manually construct an object with different insertion order
		const reordered: SchemaDefinition = {
			serverVersion: "16.2",
			dialect: "postgres",
			schemas: [
				{
					tables: [
						{
							foreignKeys: [],
							comment: "All registered users",
							name: "users",
							kind: "table",
							columns: [
								{
									isPrimaryKey: true,
									comment: null,
									name: "id",
									dataType: "integer",
									nullable: false,
									default: "nextval('users_id_seq'::regclass)",
								},
								{
									comment: "Unique email",
									isPrimaryKey: false,
									name: "email",
									dataType: "text",
									nullable: false,
									default: null,
								},
							],
						},
					],
					name: "public",
				},
			],
		};

		expect(schemaChecksum(reordered)).toBe(schemaChecksum(baseDef));
	});
});

describe("parsePgArray", () => {
	test("parses array literals, raw string arrays, and JS arrays", () => {
		expect(parsePgArray(["a", "b"])).toEqual(["a", "b"]);
		expect(parsePgArray("{a,b}")).toEqual(["a", "b"]);
		expect(parsePgArray('{"col_1","col_2"}')).toEqual(["col_1", "col_2"]);
		expect(parsePgArray("{user_id}")).toEqual(["user_id"]);
		expect(parsePgArray("user_id")).toEqual(["user_id"]);
		expect(parsePgArray(null)).toEqual([]);
		expect(parsePgArray(undefined)).toEqual([]);
	});
});

describe("renderSchemaText", () => {
	test("produces readable output", () => {
		const text = renderSchemaText(baseDef);
		expect(text).toContain("public.users (table)");
		expect(text).toContain("id integer NOT NULL");
		expect(text).toContain("PK");
		expect(text).toContain("-- Unique email");
	});

	test("handles string-formatted foreign key columns without throwing", () => {
		const defWithFk: SchemaDefinition = {
			...baseDef,
			schemas: [
				{
					name: "public",
					tables: [
						{
							...baseDef.schemas[0]!.tables[0]!,
							foreignKeys: [
								{
									columns: "{user_id}" as unknown as string[],
									refSchema: "public",
									refTable: "profiles",
									refColumns: "{id}" as unknown as string[],
								},
							],
						},
					],
				},
			],
		};
		const text = renderSchemaText(defWithFk);
		expect(text).toContain("FK (user_id) -> public.profiles(id)");
	});
});

describe("estimateTokens", () => {
	test("approximates ceil(length / 4)", () => {
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("")).toBe(0);
	});
});
