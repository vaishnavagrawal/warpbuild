"use client";

import { Button } from "@nextjs-starter/ui/components/button";
import { Input } from "@nextjs-starter/ui/components/input";
import { Label } from "@nextjs-starter/ui/components/label";
import {
	NativeSelect,
	NativeSelectOption,
} from "@nextjs-starter/ui/components/native-select";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import z from "zod";

import { trpc } from "@/utils/trpc";

interface DatasourceView {
	id: string;
	name: string;
	type: "postgres" | "clickhouse" | "mongo";
	sslMode: "disable" | "prefer" | "require";
	status: "unverified" | "connected" | "error";
	lastCheckedAt: string | null;
	lastError: string | null;
	createdAt: string;
	updatedAt: string;
	target: {
		host: string;
		port: number | null;
		database: string;
		user: string;
	} | null;
}

interface DatasourceFormProps {
	datasource: DatasourceView | null;
	onTestDraft: (values: {
		connectionString: string;
		sslMode: "disable" | "prefer" | "require";
	}) => void;
	testDraftPending: boolean;
}

export function DatasourceForm({
	datasource,
	onTestDraft,
	testDraftPending,
}: DatasourceFormProps) {
	const queryClient = useQueryClient();
	const isEditing = datasource !== null;

	const createMutation = useMutation(
		trpc.datasource.create.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [["datasource"]] });
				toast.success("Datasource created successfully");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const updateMutation = useMutation(
		trpc.datasource.update.mutationOptions({
			onSuccess: () => {
				queryClient.invalidateQueries({ queryKey: [["datasource"]] });
				toast.success("Datasource updated successfully");
			},
			onError: (error) => {
				toast.error(error.message);
			},
		}),
	);

	const form = useForm({
		defaultValues: {
			name: datasource?.name ?? "",
			connectionString: "",
			sslMode: (datasource?.sslMode ?? "prefer") as
				| "disable"
				| "prefer"
				| "require",
		},
		onSubmit: async ({ value }) => {
			if (isEditing) {
				const patch: {
					id: string;
					name?: string;
					connectionString?: string;
					sslMode?: "disable" | "prefer" | "require";
				} = { id: datasource.id };

				if (value.name !== datasource.name) {
					patch.name = value.name;
				}
				if (value.connectionString) {
					patch.connectionString = value.connectionString;
				}
				if (value.sslMode !== datasource.sslMode) {
					patch.sslMode = value.sslMode;
				}

				await updateMutation.mutateAsync(patch);
			} else {
				await createMutation.mutateAsync({
					name: value.name,
					connectionString: value.connectionString,
					sslMode: value.sslMode,
				});
			}
		},
		validators: {
			onSubmit: isEditing
				? z.object({
						name: z.string().min(1, "Name is required"),
						connectionString: z.string(),
						sslMode: z.enum(["disable", "prefer", "require"]),
					})
				: z.object({
						name: z.string().min(1, "Name is required"),
						connectionString: z
							.string()
							.min(1, "Connection string is required"),
						sslMode: z.enum(["disable", "prefer", "require"]),
					}),
		},
	});

	const isPending = createMutation.isPending || updateMutation.isPending;

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				e.stopPropagation();
				form.handleSubmit();
			}}
			className="space-y-4"
		>
			<div>
				<form.Field name="name">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor={field.name}>Name</Label>
							<Input
								id={field.name}
								name={field.name}
								type="text"
								placeholder="My Postgres Database"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="text-destructive text-xs">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>
			</div>

			<div>
				<form.Field name="connectionString">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor={field.name}>
								Connection String
								{isEditing && (
									<span className="font-normal text-muted-foreground">
										{" "}
										(leave blank to keep current)
									</span>
								)}
							</Label>
							<Input
								id={field.name}
								name={field.name}
								type="password"
								autoComplete="off"
								placeholder="postgresql://user:password@host:5432/database"
								value={field.state.value}
								onBlur={field.handleBlur}
								onChange={(e) => field.handleChange(e.target.value)}
							/>
							{isEditing && datasource.target && (
								<p className="text-muted-foreground text-xs">
									Current: {datasource.target.user}@{datasource.target.host}
									{datasource.target.port ? `:${datasource.target.port}` : ""}/
									{datasource.target.database}
								</p>
							)}
							{field.state.meta.errors.map((error) => (
								<p key={error?.message} className="text-destructive text-xs">
									{error?.message}
								</p>
							))}
						</div>
					)}
				</form.Field>
			</div>

			<div>
				<form.Field name="sslMode">
					{(field) => (
						<div className="space-y-1.5">
							<Label htmlFor={field.name}>SSL Mode</Label>
							<NativeSelect
								id={field.name}
								name={field.name}
								value={field.state.value}
								onChange={(e) =>
									field.handleChange(
										e.target.value as "disable" | "prefer" | "require",
									)
								}
								className="w-full"
							>
								<NativeSelectOption value="disable">Disable</NativeSelectOption>
								<NativeSelectOption value="prefer">Prefer</NativeSelectOption>
								<NativeSelectOption value="require">Require</NativeSelectOption>
							</NativeSelect>
						</div>
					)}
				</form.Field>
			</div>

			<div className="flex items-center gap-2 pt-2">
				<form.Subscribe
					selector={(state) => ({
						canSubmit: state.canSubmit,
						isSubmitting: state.isSubmitting,
						values: state.values,
					})}
				>
					{({ canSubmit, isSubmitting, values }) => (
						<>
							<Button
								type="submit"
								disabled={!canSubmit || isSubmitting || isPending}
							>
								{isPending ? "Saving…" : isEditing ? "Update" : "Create"}
							</Button>
							<Button
								type="button"
								variant="outline"
								disabled={!values.connectionString || testDraftPending}
								onClick={() =>
									onTestDraft({
										connectionString: values.connectionString,
										sslMode: values.sslMode,
									})
								}
							>
								{testDraftPending ? "Testing…" : "Test Connection"}
							</Button>
						</>
					)}
				</form.Subscribe>
			</div>
		</form>
	);
}
