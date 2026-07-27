"use client";

import { Badge } from "@nextjs-starter/ui/components/badge";
import { Button } from "@nextjs-starter/ui/components/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@nextjs-starter/ui/components/empty";
import { Skeleton } from "@nextjs-starter/ui/components/skeleton";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	DatabaseIcon,
	MessageSquareIcon,
	MessageSquarePlusIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { TimeDisplay } from "@/components/chat/time-display";
import { queryClient, trpc } from "@/utils/trpc";

export default function ChatLandingPage() {
	const router = useRouter();

	const { data: datasources, isLoading: loadingDs } = useQuery(
		trpc.datasource.list.queryOptions(),
	);
	const { data: chats, isLoading: loadingChats } = useQuery(
		trpc.chat.list.queryOptions(),
	);

	const activeDatasource = datasources?.[0];

	// A chat pins a schema snapshot at creation, so one must exist first.
	const { data: snapshot, isLoading: loadingSnapshot } = useQuery({
		...trpc.schema.latest.queryOptions({
			datasourceId: activeDatasource?.id ?? "",
		}),
		enabled: Boolean(activeDatasource?.id),
	});

	const createChat = useMutation(
		trpc.chat.create.mutationOptions({
			onSuccess: (data) => {
				queryClient.invalidateQueries({ queryKey: [["chat", "list"]] });
				window.location.href = `/chat/${data.id}`;
			},
			onError: (error) => toast.error(error.message),
		}),
	);

	const isLoading = loadingDs || loadingChats || loadingSnapshot;

	const handleNewChat = () => {
		if (!activeDatasource) return;
		createChat.mutate({ datasourceId: activeDatasource.id });
	};

	if (isLoading) {
		return (
			<PageShell>
				<div className="flex items-center justify-between">
					<Skeleton className="h-6 w-24" />
					<Skeleton className="h-8 w-28" />
				</div>
				<div className="flex flex-col gap-1.5">
					<Skeleton className="h-11 w-full" />
					<Skeleton className="h-11 w-full" />
					<Skeleton className="h-11 w-full" />
				</div>
			</PageShell>
		);
	}

	// ── No datasource configured ────────────────────────────────────────────────
	if (!activeDatasource) {
		return (
			<PageShell>
				<Header />
				<Empty className="flex-1 rounded-lg border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<DatabaseIcon />
						</EmptyMedia>
						<EmptyTitle>No datasource configured</EmptyTitle>
						<EmptyDescription>
							Connect a PostgreSQL database before starting a chat.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={() => router.push("/datasources")}>
							Configure datasource
						</Button>
					</EmptyContent>
				</Empty>
			</PageShell>
		);
	}

	// ── Datasource exists but schema was never introspected ────────────────────
	if (!snapshot) {
		return (
			<PageShell>
				<Header />
				<Empty className="flex-1 rounded-lg border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<TriangleAlertIcon />
						</EmptyMedia>
						<EmptyTitle>Schema not introspected yet</EmptyTitle>
						<EmptyDescription>
							A chat pins a schema version at creation. Refresh the schema for
							<span className="font-medium"> {activeDatasource.name} </span>
							to continue.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={() => router.push("/datasources")}>
							Refresh schema
						</Button>
					</EmptyContent>
				</Empty>
			</PageShell>
		);
	}

	// ── Ready ───────────────────────────────────────────────────────────────────
	return (
		<PageShell>
			<Header
				meta={
					<>
						<Badge variant="secondary" className="font-normal">
							{activeDatasource.name}
						</Badge>
						<Badge variant="outline" className="font-normal">
							schema v{snapshot.version}
						</Badge>
					</>
				}
				action={
					<Button
						onClick={handleNewChat}
						disabled={createChat.isPending}
						size="sm"
					>
						<MessageSquarePlusIcon className="size-4" aria-hidden="true" />
						{createChat.isPending ? "Creating…" : "New chat"}
					</Button>
				}
			/>

			{chats && chats.length > 0 ? (
				<ul className="flex flex-col gap-1" aria-label="Recent chats">
					{chats.map((chat) => (
						<li key={chat.id}>
							<button
								type="button"
								onClick={() => (window.location.href = `/chat/${chat.id}`)}
								className="flex w-full items-center gap-3 rounded-md border border-transparent px-3 py-2.5 text-left text-sm transition-colors hover:border-border hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								<MessageSquareIcon
									className="size-4 shrink-0 text-muted-foreground"
									aria-hidden="true"
								/>
								<span className="flex-1 truncate">
									{chat.title || "Untitled chat"}
								</span>
								<TimeDisplay
									date={chat.createdAt}
									format="datetime"
									className="shrink-0 text-muted-foreground text-xs"
								/>
							</button>
						</li>
					))}
				</ul>
			) : (
				<Empty className="flex-1 rounded-lg border">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<MessageSquareIcon />
						</EmptyMedia>
						<EmptyTitle>No chats yet</EmptyTitle>
						<EmptyDescription>
							Ask a plain-English question and the agent writes the SQL.
						</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						<Button onClick={handleNewChat} disabled={createChat.isPending}>
							<MessageSquarePlusIcon className="size-4" aria-hidden="true" />
							{createChat.isPending ? "Creating…" : "Start your first chat"}
						</Button>
					</EmptyContent>
				</Empty>
			)}
		</PageShell>
	);
}

function PageShell({ children }: { children: React.ReactNode }) {
	return (
		<div className="mx-auto flex h-full max-w-2xl flex-col gap-5 p-6">
			{children}
		</div>
	);
}

function Header({
	meta,
	action,
}: {
	meta?: React.ReactNode;
	action?: React.ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<div className="flex flex-wrap items-center gap-2">
				<h1 className="font-semibold text-base tracking-tight">Chats</h1>
				{meta}
			</div>
			{action}
		</div>
	);
}
