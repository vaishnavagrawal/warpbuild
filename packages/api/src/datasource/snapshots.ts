import { db } from "@nextjs-starter/db";
import {
	datasource,
	type SchemaDefinition,
	schemaSnapshot,
} from "@nextjs-starter/db/schema/datasource";
import { desc, eq } from "drizzle-orm";

import {
	type DatasourceConnection,
	safeConnectionErrorMessage,
} from "./connect";
import { introspectPostgres } from "./introspect";
import {
	estimateTokens,
	renderSchemaText,
	schemaChecksum,
} from "./render-schema";

export type SnapshotRow = typeof schemaSnapshot.$inferSelect;

export async function getLatestSnapshot(
	datasourceId: string,
): Promise<SnapshotRow | null> {
	const [row] = await db
		.select()
		.from(schemaSnapshot)
		.where(eq(schemaSnapshot.datasourceId, datasourceId))
		.orderBy(desc(schemaSnapshot.version))
		.limit(1);
	return row ?? null;
}

export type RefreshResult = {
	status: "created" | "unchanged";
	snapshot: SnapshotRow;
	previousVersion: number | null;
};

/**
 * Introspect and conditionally persist a new snapshot. If the checksum hasn't
 * changed since the latest snapshot, no row is created.
 *
 * Version uniqueness is guarded by the DB constraint; single-writer MVP
 * assumption means we don't need advisory locking.
 */
export async function refreshSnapshot(opts: {
	datasourceId: string;
}): Promise<RefreshResult> {
	const { datasourceId } = opts;

	// Load datasource row for connection details
	const [ds] = await db
		.select()
		.from(datasource)
		.where(eq(datasource.id, datasourceId))
		.limit(1);

	if (!ds) throw new Error(`Datasource ${datasourceId} not found`);

	const connection: DatasourceConnection = {
		connectionString: ds.connectionString,
		sslMode: ds.sslMode,
	};

	let definition: SchemaDefinition;
	try {
		definition = await introspectPostgres(connection);
	} catch (err) {
		// Record failure on the datasource but never create a snapshot row.
		// Sanitize first: lastError is surfaced to the client by the redacted
		// datasource projection, and the rethrown message reaches the tRPC caller.
		const message = safeConnectionErrorMessage(err, ds.connectionString);
		await db
			.update(datasource)
			.set({
				status: "error",
				lastCheckedAt: new Date(),
				lastError: message,
			})
			.where(eq(datasource.id, datasourceId));
		throw new Error(message);
	}

	const latest = await getLatestSnapshot(datasourceId);
	const checksum = schemaChecksum(definition);

	if (latest && latest.checksum === checksum) {
		// Mark datasource healthy even when nothing changed
		await db
			.update(datasource)
			.set({
				status: "connected",
				lastCheckedAt: new Date(),
				lastError: null,
			})
			.where(eq(datasource.id, datasourceId));

		return {
			status: "unchanged",
			snapshot: latest,
			previousVersion: latest.version,
		};
	}

	const renderedText = renderSchemaText(definition);
	const tableCount = definition.schemas.reduce(
		(sum, s) => sum + s.tables.length,
		0,
	);
	const tokenEstimate = estimateTokens(renderedText);
	const nextVersion = latest ? latest.version + 1 : 1;

	// Insert always returns exactly one row; assert to satisfy TS
	const [inserted] = (await db
		.insert(schemaSnapshot)
		.values({
			datasourceId,
			version: nextVersion,
			checksum,
			definition,
			renderedText,
			tableCount,
			tokenEstimate,
		})
		.returning()) as [typeof schemaSnapshot.$inferSelect];

	await db
		.update(datasource)
		.set({
			status: "connected",
			lastCheckedAt: new Date(),
			lastError: null,
		})
		.where(eq(datasource.id, datasourceId));

	return {
		status: "created",
		snapshot: inserted,
		previousVersion: latest?.version ?? null,
	};
}
