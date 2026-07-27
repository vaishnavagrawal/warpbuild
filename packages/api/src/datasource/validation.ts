import {
	DATASOURCE_TYPES,
	type DatasourceStatus,
	type DatasourceType,
	SSL_MODES,
	type SslMode,
} from "@nextjs-starter/db/schema/datasource";
import { z } from "zod";
import { type ConnectionTarget, describeConnection } from "./connect";

// --- Zod schemas derived from DB const arrays (never re-typed literals) ---

export const datasourceTypeSchema = z.enum(DATASOURCE_TYPES);
export const sslModeSchema = z.enum(SSL_MODES);

const postgresUrlPattern = /^postgres(ql)?:\/\//;

export const connectionStringSchema = z
	.string()
	.min(1)
	.refine((s) => postgresUrlPattern.test(s), {
		message: "Must be a postgres:// or postgresql:// URL",
	});

export const createDatasourceInput = z.object({
	name: z.string().min(1),
	connectionString: connectionStringSchema,
	sslMode: sslModeSchema.optional(),
	type: datasourceTypeSchema.optional(),
});

export const updateDatasourceInput = z.object({
	id: z.string().min(1),
	name: z.string().min(1).optional(),
	connectionString: connectionStringSchema.optional(),
	sslMode: sslModeSchema.optional(),
});

export const testDraftInput = z.object({
	connectionString: connectionStringSchema,
	sslMode: sslModeSchema.optional(),
	type: datasourceTypeSchema.optional(),
});

export const idInput = z.object({ id: z.string().min(1) });

// --- Redacted projection (connection string never leaves the server) ---

export type DatasourceView = {
	id: string;
	name: string;
	type: DatasourceType;
	sslMode: SslMode;
	status: DatasourceStatus;
	lastCheckedAt: Date | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
	target: ConnectionTarget | null;
};

/**
 * Single projection point — the connection string never leaks past here.
 */
export function toDatasourceView(row: {
	id: string;
	name: string;
	type: DatasourceType;
	connectionString: string;
	sslMode: SslMode;
	status: DatasourceStatus;
	lastCheckedAt: Date | null;
	lastError: string | null;
	createdAt: Date;
	updatedAt: Date;
}): DatasourceView {
	return {
		id: row.id,
		name: row.name,
		type: row.type,
		sslMode: row.sslMode,
		status: row.status,
		lastCheckedAt: row.lastCheckedAt,
		lastError: row.lastError,
		createdAt: row.createdAt,
		updatedAt: row.updatedAt,
		target: describeConnection(row.connectionString),
	};
}
