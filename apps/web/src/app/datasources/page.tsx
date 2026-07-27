"use client";

import { Button } from "@nextjs-starter/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@nextjs-starter/ui/components/card";
import { Skeleton } from "@nextjs-starter/ui/components/skeleton";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ConnectionStatus } from "@/components/datasource/connection-status";
import { DatasourceForm } from "@/components/datasource/datasource-form";
import { SchemaPanel } from "@/components/datasource/schema-panel";
import { TestConnectionResult } from "@/components/datasource/test-connection-result";
import { trpc } from "@/utils/trpc";

export default function DatasourcesPage() {
	const queryClient = useQueryClient();
	const [testResult, setTestResult] = useState<{
		ok: boolean;
		serverVersion?: string;
		error?: string;
		checkedAt: string;
	} | null>(null);

	const datasourceList = useQuery(trpc.datasource.list.queryOptions());

	const testDraftMutation = useMutation(
		trpc.datasource.testDraft.mutationOptions({
			onSuccess: (data) => {
				setTestResult(data);
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const testConnectionMutation = useMutation(
		trpc.datasource.testConnection.mutationOptions({
			onSuccess: (data) => {
				setTestResult(data);
				queryClient.invalidateQueries({ queryKey: [["datasource"]] });
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	if (datasourceList.isLoading) {
		return (
			<div className="mx-auto max-w-3xl space-y-6 p-6">
				<Skeleton className="h-8 w-48" />
				<Card>
					<CardHeader>
						<Skeleton className="h-5 w-32" />
						<Skeleton className="h-4 w-64" />
					</CardHeader>
					<CardContent className="space-y-4">
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
						<Skeleton className="h-8 w-full" />
					</CardContent>
				</Card>
			</div>
		);
	}

	if (datasourceList.isError) {
		return (
			<div className="mx-auto max-w-3xl space-y-6 p-6">
				<h1 className="font-semibold text-lg">Datasources</h1>
				<Card>
					<CardHeader>
						<CardTitle>Error</CardTitle>
						<CardDescription className="text-destructive">
							Failed to load datasources: {datasourceList.error.message}
						</CardDescription>
					</CardHeader>
				</Card>
			</div>
		);
	}

	// MVP: single datasource. Use the first one if it exists.
	const datasource = datasourceList.data?.[0] ?? null;

	return (
		<div className="mx-auto max-w-3xl space-y-6 p-6">
			<h1 className="font-semibold text-lg">Datasource Configuration</h1>

			<Card>
				<CardHeader>
					<CardTitle>
						{datasource ? "Edit Datasource" : "Add Datasource"}
					</CardTitle>
					<CardDescription>
						{datasource
							? "Update your database connection settings."
							: "Configure a PostgreSQL connection to get started."}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{datasource && (
						<div className="flex items-center justify-between">
							<ConnectionStatus
								status={datasource.status}
								lastCheckedAt={datasource.lastCheckedAt}
								lastError={datasource.lastError}
							/>
							{datasource.status !== "unverified" ||
							datasource.lastCheckedAt ? null : (
								<Button
									variant="outline"
									size="sm"
									disabled={testConnectionMutation.isPending}
									onClick={() =>
										testConnectionMutation.mutate({ id: datasource.id })
									}
								>
									{testConnectionMutation.isPending
										? "Testing…"
										: "Verify Saved Connection"}
								</Button>
							)}
						</div>
					)}

					<DatasourceForm
						datasource={datasource}
						onTestDraft={(values) => {
							setTestResult(null);
							testDraftMutation.mutate(values);
						}}
						testDraftPending={testDraftMutation.isPending}
					/>

					<TestConnectionResult result={testResult} />
				</CardContent>
			</Card>

			{datasource && (
				<SchemaPanel
					datasourceId={datasource.id}
					datasourceStatus={datasource.status}
				/>
			)}
		</div>
	);
}
