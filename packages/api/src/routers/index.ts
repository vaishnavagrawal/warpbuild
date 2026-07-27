import { protectedProcedure, publicProcedure, router } from "../index";
import { datasourceRouter } from "./datasource";
import { schemaRouter } from "./schema";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	datasource: datasourceRouter,
	schema: schemaRouter,
});
export type AppRouter = typeof appRouter;
