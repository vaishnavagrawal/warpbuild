/**
 * Parses assistant text into renderable segments.
 *
 * Open-weight models served over OpenAI-compatible endpoints frequently emit
 * their tool protocol as plain text inside the message body rather than as
 * structured tool calls:
 *
 *   <tool_call> {"name": "run_read_query", "arguments": "{\"sql\":\"…\"}"} </tool_call>
 *   <tool_response> {"columns": […], "rows": […]} </tool_response>
 *
 * Those blocks carry real information, so instead of dropping them we lift them
 * out of the prose and hand them to the same AI SDK `Tool` UI used for genuine
 * structured tool parts. Reasoning blocks (`<think>` and friends) carry no
 * user-facing value and are removed outright.
 */

/** Reasoning-style tags whose contents are hidden from the user entirely. */
const REASONING_TAGS = [
	"think",
	"thinking",
	"thought",
	"reasoning",
	"scratchpad",
] as const;

const CLOSED_REASONING = new RegExp(
	`<(${REASONING_TAGS.join("|")})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
	"gi",
);

/** An opening reasoning tag with no close yet — the tail of an in-flight stream. */
const UNCLOSED_REASONING = new RegExp(
	`<(${REASONING_TAGS.join("|")})\\b[^>]*>[\\s\\S]*$`,
	"i",
);

const ORPHAN_REASONING_CLOSE = new RegExp(
	`<\\/(${REASONING_TAGS.join("|")})\\s*>`,
	"gi",
);

const CALL_TAGS = ["tool_call", "tool_calls", "function_call"];
const RESPONSE_TAGS = [
	"tool_response",
	"tool_result",
	"tool_output",
	"function_results",
];

/**
 * A `<tool_call>` block optionally followed by its `<tool_response>` block.
 * The trailing `(?:$)` alternative catches a call that is still streaming.
 */
const TOOL_BLOCK = new RegExp(
	`<(?:${CALL_TAGS.join("|")})\\b[^>]*>([\\s\\S]*?)(?:<\\/(?:${CALL_TAGS.join(
		"|",
	)})\\s*>|$)` +
		`(?:\\s*<(?:${RESPONSE_TAGS.join(
			"|",
		)})\\b[^>]*>([\\s\\S]*?)(?:<\\/(?:${RESPONSE_TAGS.join("|")})\\s*>|$))?`,
	"gi",
);

/** A partially streamed tag such as `<tool_ca` at the very end of the text. */
const PARTIAL_TAG = /<\/?[a-z_]*$/i;
const KNOWN_TAGS = [...REASONING_TAGS, ...CALL_TAGS, ...RESPONSE_TAGS];

export type ToolSegmentState = "input-available" | "output-available";

export type AssistantSegment =
	| { kind: "text"; text: string }
	| {
			kind: "tool";
			toolName: string;
			input?: Record<string, unknown>;
			output?: unknown;
			state: ToolSegmentState;
	  };

/** Removes reasoning blocks and dangling partial tags from a text chunk. */
function stripReasoning(text: string): string {
	return text
		.replace(CLOSED_REASONING, "")
		.replace(UNCLOSED_REASONING, "")
		.replace(ORPHAN_REASONING_CLOSE, "")
		.replace(PARTIAL_TAG, (match) => {
			// Only drop it if it could still grow into a tag we handle.
			const name = match.replace(/^<\/?/, "").toLowerCase();
			return name && KNOWN_TAGS.some((tag) => tag.startsWith(name))
				? ""
				: match;
		});
}

function tidy(text: string): string {
	return text.replace(/\n{3,}/g, "\n\n").trim();
}

function parseJsonish(raw: string): unknown {
	const trimmed = raw.trim();
	if (!trimmed) return undefined;
	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
}

/** Tool arguments may arrive as an object or as a JSON-encoded string. */
function normalizeInput(value: unknown): Record<string, unknown> | undefined {
	const parsed = typeof value === "string" ? parseJsonish(value) : value;
	if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
		return parsed as Record<string, unknown>;
	}
	return parsed === undefined ? undefined : { value: parsed };
}

function parseToolCall(payload: string): {
	toolName: string;
	input?: Record<string, unknown>;
} {
	const parsed = parseJsonish(payload);

	if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
		const obj = parsed as Record<string, unknown>;
		const name = obj.name ?? obj.tool ?? obj.tool_name ?? obj.function;
		return {
			toolName: typeof name === "string" ? name : "tool",
			input: normalizeInput(obj.arguments ?? obj.parameters ?? obj.args),
		};
	}

	return { toolName: "tool", input: undefined };
}

/**
 * Splits assistant text into prose and inline tool-call segments.
 * Returns segments in document order; empty text segments are dropped.
 */
export function parseAssistantText(text: string): AssistantSegment[] {
	if (!text) return [];

	const segments: AssistantSegment[] = [];
	let cursor = 0;

	TOOL_BLOCK.lastIndex = 0;
	let match = TOOL_BLOCK.exec(text);

	while (match !== null) {
		const before = tidy(stripReasoning(text.slice(cursor, match.index)));
		if (before) segments.push({ kind: "text", text: before });

		const { toolName, input } = parseToolCall(match[1] ?? "");
		const responsePayload = match[2];
		const output =
			responsePayload === undefined ? undefined : parseJsonish(responsePayload);

		segments.push({
			kind: "tool",
			toolName,
			input,
			output,
			state: output === undefined ? "input-available" : "output-available",
		});

		cursor = match.index + match[0].length;
		match = TOOL_BLOCK.exec(text);
	}

	const rest = tidy(stripReasoning(text.slice(cursor)));
	if (rest) segments.push({ kind: "text", text: rest });

	return segments;
}
