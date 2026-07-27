import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkV5Messages } from "@mastra/ai-sdk/ui";
import { RequestContext } from "@mastra/core/request-context";
import { db } from "@nextjs-starter/db";
import { chat } from "@nextjs-starter/db/schema/chat";
import { schemaSnapshot } from "@nextjs-starter/db/schema/datasource";
import { createUIMessageStreamResponse } from "ai";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { mastra } from "@/mastra";
import type { AnalystRequestContext } from "@/mastra/types";

export const runtime = "nodejs";

/**
 * No multi-tenancy in the MVP — all memory operations use a constant resourceId.
 * When multi-tenancy lands, this becomes the authenticated user's ID.
 */
const RESOURCE_ID = "local";

/**
 * POST /api/chat
 *
 * Expects JSON body with:
 *   - chatId: string — the chat session ID (doubles as Mastra threadId)
 *   - messages: UIMessage[] — the conversation (from AI SDK useChat)
 *   - ...other AI SDK params (trigger, resumeData, etc.)
 *
 * Flow:
 *   1. Resolve chatId → chat row → datasourceId + snapshotId
 *   2. Fetch the snapshot's renderedText + dialect
 *   3. Build RequestContext with those values
 *   4. Stream via handleChatStream with the analyst agent
 */
export async function POST(req: Request) {
	const body = await req.json();
	const { chatId, ...params } = body;

	if (!chatId || typeof chatId !== "string") {
		return NextResponse.json({ error: "chatId is required" }, { status: 400 });
	}

	// ─── Resolve chat → datasource → snapshot ──────────────────────────────────

	const [chatRow] = await db
		.select()
		.from(chat)
		.where(eq(chat.id, chatId))
		.limit(1);

	if (!chatRow) {
		return NextResponse.json({ error: "Chat not found" }, { status: 404 });
	}

	const [snapshot] = await db
		.select()
		.from(schemaSnapshot)
		.where(eq(schemaSnapshot.id, chatRow.snapshotId))
		.limit(1);

	if (!snapshot) {
		return NextResponse.json(
			{ error: "Schema snapshot not found for this chat" },
			{ status: 404 },
		);
	}

	// ─── Build RequestContext ───────────────────────────────────────────────────

	const requestContext = new RequestContext<AnalystRequestContext>();
	requestContext.set("datasourceId", chatRow.datasourceId);
	requestContext.set("snapshotId", chatRow.snapshotId);
	requestContext.set("renderedText", snapshot.renderedText);
	requestContext.set("dialect", snapshot.definition.dialect);
	requestContext.set("chatId" as never, chatId);

	// ─── Stream ────────────────────────────────────────────────────────────────

	const stream = await handleChatStream({
		mastra,
		agentId: "analyst-agent",
		params: {
			...params,
			requestContext,
			memory: {
				...params.memory,
				thread: chatId,
				resource: RESOURCE_ID,
			},
		},
	});

	return createUIMessageStreamResponse({ stream: stream as any });
}

/**
 * GET /api/chat?chatId=<id>
 *
 * Returns the existing message history for a chat session.
 */
export async function GET(req: Request) {
	const { searchParams } = new URL(req.url);
	const chatId = searchParams.get("chatId");

	if (!chatId) {
		return NextResponse.json(
			{ error: "chatId query parameter is required" },
			{ status: 400 },
		);
	}

	const memory = await mastra.getAgentById("analyst-agent").getMemory();

	let response = null;
	try {
		response = await memory?.recall({
			threadId: chatId,
			resourceId: RESOURCE_ID,
		});
	} catch {
		// No previous messages — return empty array
	}

	const uiMessages = toAISdkV5Messages(response?.messages || []);
	return NextResponse.json(uiMessages);
}
