"use client";

import { Spinner } from "@nextjs-starter/ui/components/spinner";
import type { ToolUIPart } from "ai";
import { CodeBlock } from "@/components/ai-elements/code-block";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
	Tool,
	ToolContent,
	ToolHeader,
	ToolInput,
} from "@/components/ai-elements/tool";
import {
	type SqlResult,
	SqlResultTable,
} from "@/components/chat/sql-result-table";

const SQL_TOOL_NAMES = new Set([
	"run_read_query",
	"run_sql_query",
	"run_query",
]);

/** Keys a model might use to wrap a row set inside its response payload. */
const ROW_SET_KEYS = ["rows", "result_set", "results", "data", "records"];

export type ToolCallDisplayProps = {
	toolName: string;
	state: ToolUIPart["state"];
	input?: Record<string, unknown>;
	output?: unknown;
	errorText?: string;
	/** Collapsed by default; SQL results are worth showing up front. */
	defaultOpen?: boolean;
};

/** Normalizes a structured AI SDK tool part into display props. */
export function toolPartToDisplayProps(part: ToolUIPart): ToolCallDisplayProps {
	// TS can't narrow this discriminated union usefully here, so read via cast.
	const fields = part as Record<string, unknown>;
	return {
		toolName: part.type.replace(/^tool-/, ""),
		state: part.state ?? "output-available",
		input: fields.input as Record<string, unknown> | undefined,
		output: fields.output,
		errorText: fields.errorText as string | undefined,
	};
}

/**
 * Renders a tool call using the AI SDK `Tool` elements, with SQL-aware
 * formatting: the query as a SQL code block and the rows as a table.
 *
 * Used for both genuine structured tool parts and tool calls the model emitted
 * inline as text (see `parseAssistantText`).
 */
export function ToolCallDisplay({
	toolName,
	state,
	input,
	output,
	errorText,
	defaultOpen,
}: ToolCallDisplayProps) {
	const isSqlTool = SQL_TOOL_NAMES.has(toolName);
	const sql = pickSql(input);
	const sqlResult = isSqlTool ? toSqlResult(output) : undefined;
	const error = errorText ?? pickError(output);
	const isExecuting =
		state === "input-available" ||
		state === "input-streaming" ||
		(output === undefined && !error && !sqlResult);

	return (
		<Tool defaultOpen={defaultOpen ?? Boolean(sqlResult || isExecuting)}>
			<ToolHeader
				className="cursor-pointer"
				state={state}
				title={isSqlTool ? "SQL Query" : undefined}
				type={`tool-${toolName}` as ToolUIPart["type"]}
			/>
			<ToolContent>
				{sql ? (
					<Section title="SQL">
						<div className="rounded-md bg-muted/50">
							<CodeBlock code={sql} language="sql" />
						</div>
					</Section>
				) : (
					input && <ToolInput input={input} />
				)}

				{sqlResult && (
					<Section title="Result">
						<SqlResultTable result={sqlResult} />
					</Section>
				)}

				{!sqlResult && isExecuting && (
					<Section title="Status">
						<div className="flex items-center gap-2 rounded-md bg-muted/40 p-3 text-muted-foreground text-xs">
							<Spinner className="size-3.5" />
							<Shimmer duration={1.5}>Executing database query…</Shimmer>
						</div>
					</Section>
				)}

				{!sqlResult && output !== undefined && !error && !isExecuting && (
					<Section title="Result">
						<div className="rounded-md bg-muted/50">
							<CodeBlock
								code={
									typeof output === "string"
										? output
										: JSON.stringify(output, null, 2)
								}
								language="json"
							/>
						</div>
					</Section>
				)}

				{error && (
					<Section title="Error">
						<div className="rounded-md bg-destructive/10 p-3 text-destructive text-xs">
							{error}
						</div>
					</Section>
				)}
			</ToolContent>
		</Tool>
	);
}

function Section({
	title,
	children,
}: {
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-2">
			<h4 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{title}
			</h4>
			{children}
		</div>
	);
}

function pickSql(input?: Record<string, unknown>): string | undefined {
	if (!input) return undefined;
	for (const key of ["sql", "query", "statement"]) {
		const value = input[key];
		if (typeof value === "string" && value.trim()) return value;
	}
	return undefined;
}

function pickError(output: unknown): string | undefined {
	if (output && typeof output === "object") {
		const error = (output as Record<string, unknown>).error;
		if (typeof error === "string") return error;
	}
	return undefined;
}

function isRowArray(value: unknown): value is Record<string, unknown>[] {
	return (
		Array.isArray(value) &&
		value.every(
			(row) => row !== null && typeof row === "object" && !Array.isArray(row),
		)
	);
}

/**
 * Coerces a tool output into `SqlResult`. The real tool already returns that
 * shape; inline model output is looser (a bare row array, or rows nested under
 * `result_set` / `data` / …), so derive the columns from the row keys.
 */
function toSqlResult(output: unknown): SqlResult | undefined {
	if (!output || typeof output !== "object") return undefined;

	const obj = output as Record<string, unknown>;

	if (Array.isArray(obj.columns) && isRowArray(obj.rows)) {
		return output as SqlResult;
	}

	let rows: Record<string, unknown>[] | undefined;
	if (isRowArray(output)) {
		rows = output;
	} else {
		for (const key of ROW_SET_KEYS) {
			if (isRowArray(obj[key])) {
				rows = obj[key] as Record<string, unknown>[];
				break;
			}
		}
	}

	if (!rows) return undefined;

	const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
	const rowCount =
		typeof obj.rowCount === "number" ? obj.rowCount : rows.length;

	return {
		columns,
		rows,
		rowCount,
		truncated: obj.truncated === true,
		sql: typeof obj.sql === "string" ? obj.sql : undefined,
		durationMs: typeof obj.durationMs === "number" ? obj.durationMs : undefined,
	};
}
