import { createContext } from "@nextjs-starter/api/context";
import { appRouter } from "@nextjs-starter/api/routers/index";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { NextRequest } from "next/server";

function handler(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    // @ts-expect-error - Next.js version mismatch in monorepo
    createContext: () => createContext(req),
  });
}
export { handler as GET, handler as POST };
