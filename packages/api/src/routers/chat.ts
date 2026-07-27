import { db } from "@nextjs-starter/db";
import { chat } from "@nextjs-starter/db/schema/chat";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import {
	adjectives,
	animals,
	uniqueNamesGenerator,
} from "unique-names-generator";
import { z } from "zod";
import { getLatestSnapshot } from "../datasource/snapshots";
import { publicProcedure, router } from "../index";

function generateChatTitle(): string {
	return uniqueNamesGenerator({
		dictionaries: [adjectives, animals],
		separator: " ",
		style: "capital",
	});
}

// MVP has no multi-tenancy; all procedures are public.
export const chatRouter = router({
	/** Create a new chat pinned to a datasource + its latest snapshot. */
	create: publicProcedure
		.input(
			z.object({
				datasourceId: z.string(),
				title: z.string().optional(),
			}),
		)
		.mutation(async ({ input }) => {
			// Get the latest snapshot for this datasource
			const snapshot = await getLatestSnapshot(input.datasourceId);
			if (!snapshot) {
				throw new TRPCError({
					code: "PRECONDITION_FAILED",
					message: "No schema snapshot found. Please refresh the schema first.",
				});
			}

			const title = input.title?.trim() || generateChatTitle();

			const [row] = await db
				.insert(chat)
				.values({
					title,
					datasourceId: input.datasourceId,
					snapshotId: snapshot.id,
				})
				.returning();

			if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
			return { id: row.id, title: row.title, createdAt: row.createdAt };
		}),

	/** List chats, newest first. */
	list: publicProcedure.query(async () => {
		const rows = await db
			.select({
				id: chat.id,
				title: chat.title,
				datasourceId: chat.datasourceId,
				createdAt: chat.createdAt,
			})
			.from(chat)
			.orderBy(desc(chat.createdAt))
			.limit(50);
		return rows;
	}),

	/** Get a single chat by ID. */
	get: publicProcedure
		.input(z.object({ id: z.string() }))
		.query(async ({ input }) => {
			const [row] = await db
				.select()
				.from(chat)
				.where(eq(chat.id, input.id))
				.limit(1);
			if (!row) {
				throw new TRPCError({ code: "NOT_FOUND", message: "Chat not found" });
			}
			return {
				id: row.id,
				title: row.title,
				datasourceId: row.datasourceId,
				snapshotId: row.snapshotId,
				createdAt: row.createdAt,
			};
		}),
});
