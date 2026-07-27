/**
 * Shape of the values passed via Mastra's RequestContext for the analyst agent.
 *
 * These IDs travel in the context — never as tool parameters the model can set.
 * The /api/chat route resolves chat → datasource → snapshot and sets these
 * before calling handleChatStream.
 */
export type AnalystRequestContext = {
	/** `datasource.id` — identifies which external DB connection to use. */
	datasourceId: string;
	/** `schema_snapshot.id` — the pinned schema version for this chat. */
	snapshotId: string;
	/** Pre-rendered prompt-ready schema text from the snapshot row. */
	renderedText: string;
	/** Database dialect. Always "postgres" in the MVP. */
	dialect: "postgres";
};
