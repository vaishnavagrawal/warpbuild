"use client";

import { Badge } from "@nextjs-starter/ui/components/badge";
import { Button } from "@nextjs-starter/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@nextjs-starter/ui/components/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@nextjs-starter/ui/components/collapsible";
import { Skeleton } from "@nextjs-starter/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRightIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { trpc } from "@/utils/trpc";

interface SchemaPanelProps {
	datasourceId: string;
	datasourceStatus: "unverified" | "connected" | "error";
}

export function SchemaPanel({
	datasourceId,
	datasourceStatus,
}: SchemaPanelProps) {
	const queryClient = useQueryClient();

	const latestSnapshot = useQuery(
		trpc.schema.latest.queryOptions({ datasourceId }),
	);

	const refreshMutation = useMutation(
		trpc.schema.refresh.mutationOptions({
			onSuccess: (data) => {
				queryClient.invalidateQueries({ queryKey: [["schema"]] });
				if (data.status === "created") {
					toast.success(
						`Schema refreshed — new version v${data.version} with ${data.tableCount} tables`,
					);
				} else {
					toast.info("No schema changes detected");
				}
			},
			onError: (error) => {
				toast.error(`Schema refresh failed: ${error.message}`);
			},
		}),
	);

	if (latestSnapshot.isLoading) {
		return <SchemaSkeletonLoader />;
	}

	if (latestSnapshot.isError) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Schema</CardTitle>
					<CardDescription className="text-destructive">
						Failed to load schema: {latestSnapshot.error.message}
					</CardDescription>
				</CardHeader>
			</Card>
		);
	}

	const snapshot = latestSnapshot.data;

	if (!snapshot) {
		return (
			<Card>
				<CardHeader>
					<CardTitle>Schema</CardTitle>
					<CardDescription>
						{datasourceStatus !== "connected"
							? "Test the connection first, then refresh to introspect the database schema."
							: "No schema snapshot yet. Click Refresh to introspect the database."}
					</CardDescription>
				</CardHeader>
				<CardContent>
					<Button
						variant="outline"
						disabled={
							datasourceStatus !== "connected" || refreshMutation.isPending
						}
						onClick={() => refreshMutation.mutate({ datasourceId })}
					>
						<RefreshCwIcon className="size-3.5" />
						{refreshMutation.isPending ? "Refreshing…" : "Refresh Schema"}
					</Button>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card>
			<CardHeader>
				<div className="flex items-center justify-between">
					<div className="flex items-center gap-2">
						<CardTitle>Schema</CardTitle>
						<Badge variant="secondary">v{snapshot.version}</Badge>
						<Badge variant="outline">{snapshot.tableCount} tables</Badge>
					</div>
					<Button
						variant="outline"
						size="sm"
						disabled={refreshMutation.isPending}
						onClick={() => refreshMutation.mutate({ datasourceId })}
					>
						<RefreshCwIcon className="size-3.5" />
						{refreshMutation.isPending ? "Refreshing…" : "Refresh"}
					</Button>
				</div>
				<CardDescription>
					Synced at {new Date(snapshot.syncedAt).toLocaleString()}
				</CardDescription>
			</CardHeader>
			<CardContent>
				<TableList definition={snapshot.definition} />
			</CardContent>
		</Card>
	);
}

function SchemaSkeletonLoader() {
	return (
		<Card>
			<CardHeader>
				<div className="flex items-center gap-2">
					<Skeleton className="h-5 w-16" />
					<Skeleton className="h-5 w-10" />
					<Skeleton className="h-5 w-20" />
				</div>
				<Skeleton className="h-4 w-40" />
			</CardHeader>
			<CardContent className="space-y-2">
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
				<Skeleton className="h-8 w-full" />
			</CardContent>
		</Card>
	);
}

interface TableDefinition {
	name: string;
	kind: "table" | "view" | "materialized_view";
	comment: string | null;
	columns: Array<{
		name: string;
		dataType: string;
		nullable: boolean;
		default: string | null;
		isPrimaryKey: boolean;
		comment: string | null;
	}>;
	foreignKeys: Array<{
		columns: string[];
		refSchema: string;
		refTable: string;
		refColumns: string[];
	}>;
}

interface SchemaDefinition {
	dialect: "postgres";
	serverVersion: string;
	schemas: Array<{
		name: string;
		tables: TableDefinition[];
	}>;
}

interface TableListProps {
	definition: SchemaDefinition;
}

function TableList({ definition }: TableListProps) {
	const allTables = definition.schemas.flatMap((s) =>
		s.tables.map((t) => ({ ...t, schema: s.name })),
	);

	if (allTables.length === 0) {
		return <p className="text-muted-foreground text-xs">No tables found.</p>;
	}

	return (
		<ul className="list-none space-y-1" aria-label="Database tables">
			{allTables.map((table) => (
				<li key={`${table.schema}.${table.name}`}>
					<TableItem table={table} />
				</li>
			))}
		</ul>
	);
}

function TableItem({ table }: { table: TableDefinition & { schema: string } }) {
	return (
		<Collapsible>
			<CollapsibleTrigger className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-muted [&[data-open]>svg]:rotate-90">
				<ChevronRightIcon className="size-3.5 shrink-0 transition-transform" />
				<span className="font-medium">
					{table.schema !== "public" && (
						<span className="text-muted-foreground">{table.schema}.</span>
					)}
					{table.name}
				</span>
				<span className="ml-auto text-muted-foreground">
					{table.columns.length} col{table.columns.length !== 1 ? "s" : ""}
				</span>
			</CollapsibleTrigger>
			<CollapsibleContent>
				<div className="ml-5 border-l py-1 pl-3">
					<table
						className="w-full text-xs"
						aria-label={`Columns for ${table.name}`}
					>
						<thead>
							<tr className="text-muted-foreground">
								<th className="py-0.5 pr-4 text-left font-medium">Column</th>
								<th className="py-0.5 pr-4 text-left font-medium">Type</th>
								<th className="py-0.5 text-left font-medium">Nullable</th>
							</tr>
						</thead>
						<tbody>
							{table.columns.map((col) => (
								<tr key={col.name}>
									<td className="py-0.5 pr-4">
										{col.isPrimaryKey && (
											<span className="mr-1 text-amber-600" title="Primary Key">
												🔑
											</span>
										)}
										{col.name}
									</td>
									<td className="py-0.5 pr-4 text-muted-foreground">
										{col.dataType}
									</td>
									<td className="py-0.5 text-muted-foreground">
										{col.nullable ? "yes" : "no"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</CollapsibleContent>
		</Collapsible>
	);
}
