import { db } from "@nextjs-starter/db";
import { datasource } from "@nextjs-starter/db/schema/datasource";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import {
	type DatasourceConnection,
	safeConnectionErrorMessage,
	withDatasourceClient,
} from "../datasource/connect";
import {
	createDatasourceInput,
	idInput,
	testDraftInput,
	toDatasourceView,
	updateDatasourceInput,
} from "../datasource/validation";
import { publicProcedure, router } from "../index";

// MVP has no multi-tenancy — all procedures use publicProcedure deliberately.
export const datasourceRouter = router({
	list: publicProcedure.query(async () => {
		const rows = await db.select().from(datasource);
		return rows.map(toDatasourceView);
	}),

	get: publicProcedure.input(idInput).query(async ({ input }) => {
		const [row] = await db
			.select()
			.from(datasource)
			.where(eq(datasource.id, input.id));
		if (!row) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Datasource not found",
			});
		}
		return toDatasourceView(row);
	}),

	create: publicProcedure
		.input(createDatasourceInput)
		.mutation(async ({ input }) => {
			const type = input.type ?? "postgres";
			if (type !== "postgres") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Datasource type "${type}" is not implemented`,
				});
			}

			const [row] = await db
				.insert(datasource)
				.values({
					name: input.name,
					connectionString: input.connectionString,
					sslMode: input.sslMode ?? "prefer",
					type,
				})
				.returning();

			// INSERT RETURNING always yields a row; guard satisfies noUncheckedIndexedAccess.
			if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			return toDatasourceView(row);
		}),

	update: publicProcedure
		.input(updateDatasourceInput)
		.mutation(async ({ input }) => {
			const { id, ...patch } = input;

			// Reset verification state when connection details change.
			const connectionChanged =
				patch.connectionString !== undefined || patch.sslMode !== undefined;

			const values: Record<string, unknown> = {};
			if (patch.name !== undefined) values.name = patch.name;
			if (patch.connectionString !== undefined)
				values.connectionString = patch.connectionString;
			if (patch.sslMode !== undefined) values.sslMode = patch.sslMode;
			if (connectionChanged) {
				values.status = "unverified";
				values.lastError = null;
			}

			const [row] = await db
				.update(datasource)
				.set(values)
				.where(eq(datasource.id, id))
				.returning();

			if (!row) {
				throw new TRPCError({
					code: "NOT_FOUND",
					message: "Datasource not found",
				});
			}
			return toDatasourceView(row);
		}),

	testConnection: publicProcedure.input(idInput).mutation(async ({ input }) => {
		const [row] = await db
			.select()
			.from(datasource)
			.where(eq(datasource.id, input.id));
		if (!row) {
			throw new TRPCError({
				code: "NOT_FOUND",
				message: "Datasource not found",
			});
		}

		const conn: DatasourceConnection = {
			connectionString: row.connectionString,
			sslMode: row.sslMode,
		};
		const checkedAt = new Date();

		try {
			const result = await withDatasourceClient(conn, async (client) => {
				const res = await client.query("SELECT version()");
				return res.rows[0]?.version as string;
			});

			await db
				.update(datasource)
				.set({ status: "connected", lastCheckedAt: checkedAt, lastError: null })
				.where(eq(datasource.id, input.id));

			return { ok: true as const, serverVersion: result, checkedAt };
		} catch (err) {
			// lastError is returned by the redacted projection, so sanitize first.
			const message = safeConnectionErrorMessage(err, row.connectionString);
			await db
				.update(datasource)
				.set({ status: "error", lastCheckedAt: checkedAt, lastError: message })
				.where(eq(datasource.id, input.id));

			return { ok: false as const, error: message, checkedAt };
		}
	}),

	testDraft: publicProcedure
		.input(testDraftInput)
		.mutation(async ({ input }) => {
			const type = input.type ?? "postgres";
			if (type !== "postgres") {
				throw new TRPCError({
					code: "BAD_REQUEST",
					message: `Datasource type "${type}" is not implemented`,
				});
			}

			const conn: DatasourceConnection = {
				connectionString: input.connectionString,
				sslMode: input.sslMode ?? "prefer",
			};
			const checkedAt = new Date();

			try {
				const result = await withDatasourceClient(conn, async (client) => {
					const res = await client.query("SELECT version()");
					return res.rows[0]?.version as string;
				});
				return { ok: true as const, serverVersion: result, checkedAt };
			} catch (err) {
				return {
					ok: false as const,
					error: safeConnectionErrorMessage(err, conn.connectionString),
					checkedAt,
				};
			}
		}),
});
