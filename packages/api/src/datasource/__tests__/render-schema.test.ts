import { describe, expect, test } from "bun:test";
import type { SchemaDefinition } from "@nextjs-starter/db/schema/datasource";

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

describe("renderSchemaText", () => {
	test("produces readable output", () => {
		const text = renderSchemaText(baseDef);
		expect(text).toContain("public.users (table)");
		expect(text).toContain("id integer NOT NULL");
		expect(text).toContain("PK");
		expect(text).toContain("-- Unique email");
	});
});

describe("estimateTokens", () => {
	test("approximates ceil(length / 4)", () => {
		expect(estimateTokens("abcd")).toBe(1);
		expect(estimateTokens("abcde")).toBe(2);
		expect(estimateTokens("")).toBe(0);
	});
});
