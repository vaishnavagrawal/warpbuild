"use client";

import { useChat } from "@ai-sdk/react";
import { Badge } from "@nextjs-starter/ui/components/badge";
import { Spinner } from "@nextjs-starter/ui/components/spinner";
import { useQuery } from "@tanstack/react-query";
import type { ToolUIPart } from "ai";
import { DefaultChatTransport } from "ai";
import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
	Conversation,
	ConversationContent,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
	Message,
	MessageContent,
	MessageResponse,
} from "@/components/ai-elements/message";
import {
	PromptInput,
	PromptInputBody,
	PromptInputFooter,
	type PromptInputMessage,
	PromptInputSubmit,
	PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { TimeDisplay } from "@/components/chat/time-display";
import {
	ToolCallDisplay,
	toolPartToDisplayProps,
} from "@/components/chat/tool-call-display";
import { parseAssistantText } from "@/lib/parse-assistant-text";
import { trpc } from "@/utils/trpc";

export default function ChatPage() {
	const params = useParams<{ chatId: string }>();
	const chatId = params.chatId;

	const [input, setInput] = useState("");

	const { data: chat } = useQuery(trpc.chat.get.queryOptions({ id: chatId }));

	const { messages, setMessages, sendMessage, status, stop } = useChat({
		transport: new DefaultChatTransport({
			api: "/api/chat",
			body: { chatId },
		}),
	});

	// Load existing messages on mount
	useEffect(() => {
		const fetchMessages = async () => {
			try {
				const res = await fetch(`/api/chat?chatId=${chatId}`);
				if (res.ok) {
					const data = await res.json();
					if (data.length > 0) {
						setMessages(data);
					}
				}
			} catch {
				// No history yet — start fresh
			}
		};
		fetchMessages();
	}, [chatId, setMessages]);

	const isStreaming = status === "streaming";
	const isBusy = status === "submitted" || isStreaming;

	const handleSubmit = (message: PromptInputMessage) => {
		const text = (message.text || input).trim();
		if (!text || isBusy) return;
		sendMessage({ text });
		setInput("");
	};

	return (
		<div className="mx-auto flex h-full w-full max-w-3xl flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-4 py-2.5">
				<Link
					href="/chat"
					className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-muted-foreground text-sm transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				>
					<ArrowLeftIcon className="size-4" aria-hidden="true" />
					Chats
				</Link>
				{chat?.title && (
					<>
						<span className="text-muted-foreground/40 text-sm">/</span>
						<span className="max-w-xs truncate font-medium text-foreground text-sm">
							{chat.title}
						</span>
					</>
				)}
				<div className="ml-auto flex items-center gap-3">
					{chat?.createdAt && (
						<span className="hidden items-center gap-1 text-muted-foreground text-xs sm:flex">
							<TimeDisplay
								date={chat.createdAt}
								format="datetime"
								showIcon
								className="text-muted-foreground/80"
							/>
						</span>
					)}
					{chat?.snapshotId && (
						<Badge variant="outline" className="font-normal">
							pinned schema
						</Badge>
					)}
				</div>
			</div>

			<Conversation className="min-h-0 flex-1">
				<ConversationContent>
					{messages.length === 0 && (
						<div className="flex h-full flex-col items-center justify-center gap-1.5 py-16 text-center">
							<p className="font-medium text-sm">
								Ask a question about your data
							</p>
							<p className="text-muted-foreground text-xs">
								The agent writes the SQL, runs it read-only, and explains the
								result.
							</p>
						</div>
					)}

					{messages.map((message) => (
						<div key={message.id}>
							{message.parts?.map((part, i) => {
								const isLastPart = i === message.parts.length - 1;
								const isAssistant = message.role === "assistant";
								const animating = isStreaming && isAssistant && isLastPart;

								if (part.type === "text") {
									if (!isAssistant) {
										return (
											<Message key={`${message.id}-${i}`} from={message.role}>
												<MessageContent>
													<MessageResponse>{part.text}</MessageResponse>
												</MessageContent>
												<div className="flex justify-end px-1">
													<TimeDisplay
														date={
															(message as { createdAt?: Date | string })
																.createdAt ?? new Date()
														}
														format="time"
														className="select-none text-[10px] text-muted-foreground/60"
													/>
												</div>
											</Message>
										);
									}

									// Some models emit their tool protocol as plain text instead
									// of structured tool parts. Lift those blocks out of the
									// prose and render them with the same Tool UI; drop the
									// reasoning blocks entirely.
									const segments = parseAssistantText(part.text);

									return segments.map((segment, s) => {
										const key = `${message.id}-${i}-${s}`;
										const isLastSegment = s === segments.length - 1;

										if (segment.kind === "tool") {
											return (
												<ToolCallDisplay
													key={key}
													toolName={segment.toolName}
													state={segment.state}
													input={segment.input}
													output={segment.output}
												/>
											);
										}

										return (
											<Message key={key} from={message.role}>
												<MessageContent>
													<MessageResponse
														isAnimating={animating && isLastSegment}
														caret={
															animating && isLastSegment ? "block" : undefined
														}
													>
														{segment.text}
													</MessageResponse>
												</MessageContent>
												{isLastSegment && (
													<div className="flex justify-start px-1">
														<TimeDisplay
															date={
																(message as { createdAt?: Date | string })
																	.createdAt ?? new Date()
															}
															format="time"
															className="select-none text-[10px] text-muted-foreground/60"
														/>
													</div>
												)}
											</Message>
										);
									});
								}

								if (part.type?.startsWith("tool-")) {
									return (
										<ToolCallDisplay
											key={`${message.id}-${i}`}
											{...toolPartToDisplayProps(part as ToolUIPart)}
										/>
									);
								}

								return null;
							})}
						</div>
					))}

					{isBusy &&
						(messages.length === 0 ||
							messages.at(-1)?.role === "user" ||
							(messages.at(-1)?.role === "assistant" &&
								(!messages.at(-1)?.parts ||
									messages.at(-1)?.parts.length === 0))) && (
							<Message from="assistant" className="mt-2">
								<MessageContent>
									<div className="flex items-center gap-2 py-1 text-muted-foreground text-xs">
										<Spinner className="size-3.5" />
										<Shimmer duration={1.5}>
											Thinking and running query…
										</Shimmer>
									</div>
								</MessageContent>
							</Message>
						)}

					<ConversationScrollButton />
				</ConversationContent>
			</Conversation>

			<div className="shrink-0 border-t bg-background p-3">
				<PromptInput onSubmit={handleSubmit} className="rounded-lg">
					<PromptInputBody>
						<PromptInputTextarea
							onChange={(e) => setInput(e.target.value)}
							value={input}
							placeholder={
								isBusy
									? "Query is running, please wait…"
									: "Ask about your data…"
							}
							disabled={isBusy}
						/>
					</PromptInputBody>
					<PromptInputFooter>
						<div className="flex items-center gap-2 text-muted-foreground text-xs">
							<span>
								{isBusy
									? "Query is running…"
									: "Enter to send · Shift+Enter for a new line"}
							</span>
							<span className="font-normal text-muted-foreground/40">•</span>
							<TimeDisplay
								format="live"
								showIcon
								className="text-[11px] text-muted-foreground/80"
							/>
						</div>
						<PromptInputSubmit
							status={status}
							onStop={stop}
							disabled={!isBusy && input.trim().length === 0}
						/>
					</PromptInputFooter>
				</PromptInput>
			</div>
		</div>
	);
}
