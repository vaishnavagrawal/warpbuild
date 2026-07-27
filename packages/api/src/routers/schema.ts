import { db } from "@nextjs-starter/db";
import { schemaSnapshot } from "@nextjs-starter/db/schema/datasource";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { connectionErrorMessage } from "../datasource/connect";
import { getLatestSnapshot, refreshSnapshot } from "../datasource/snapshots";
import { publicProcedure, router } from "../index";

// MVP has no multi-tenancy; all procedures are public.
export const schemaRouter = router({
	/** Latest snapshot for a datasource, or null if never introspected. */
	latest: publicProcedure
		.input(z.object({ datasourceId: z.string() }))
		.query(async ({ input }) => {
			const row = await getLatestSnapshot(input.datasourceId);
			if (!row) return null;
			return {
				id: row.id,
				version: row.version,
				checksum: row.checksum,
				tableCount: row.tableCount,
				tokenEstimate: row.tokenEstimate,
				syncedAt: row.syncedAt,
				definition: row.definition,
			};
		}),

	/** Rendered prompt text for a specific snapshot — debugging only. */
	renderedText: publicProcedure
		.input(z.object({ snapshotId: z.string() }))
		.query(async ({ input }) => {
			const [row] = await db
				.select({ renderedText: schemaSnapshot.renderedText })
				.from(schemaSnapshot)
				.where(eq(schemaSnapshot.id, input.snapshotId))
				.limit(1);
			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Snapshot not found",
				});
			}
			return { renderedText: row.renderedText };
		}),

	/** Version history metadata, newest first. */
	list: publicProcedure
		.input(z.object({ datasourceId: z.string() }))
		.query(async ({ input }) => {
			const rows = await db
				.select({
					id: schemaSnapshot.id,
					version: schemaSnapshot.version,
					checksum: schemaSnapshot.checksum,
					tableCount: schemaSnapshot.tableCount,
					syncedAt: schemaSnapshot.syncedAt,
				})
				.from(schemaSnapshot)
				.where(eq(schemaSnapshot.datasourceId, input.datasourceId))
				.orderBy(desc(schemaSnapshot.version));
			return rows;
		}),

	/** Trigger a fresh introspection; creates a new snapshot if schema changed. */
	refresh: publicProcedure
		.input(z.object({ datasourceId: z.string() }))
		.mutation(async ({ input }) => {
			try {
				const result = await refreshSnapshot({
					datasourceId: input.datasourceId,
				});
				return {
					status: result.status,
					version: result.snapshot.version,
					tableCount: result.snapshot.tableCount,
					syncedAt: result.snapshot.syncedAt,
				};
			} catch (err) {
				throw new TRPCError({
					code: "INTERNAL_SERVER_ERROR",
					message: connectionErrorMessage(err),
					cause: err,
				});
			}
		}),
});
