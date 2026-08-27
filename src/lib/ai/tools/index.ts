import type { ToolContext } from '../toolContext';
import { createDuckdbQueryTool } from './duckdbQuery';
import { createLoadBuiltinDatasetTool } from './loadBuiltinDataset';

/**
 * The tool registry handed to the agent loop. Each factory closes over the shared
 * ToolContext so tools can touch app state without importing React or jotai.
 *
 * The body is composed from clearly delimited SEAM sections so a chapter branch can
 * drop a capability by deleting a section (and its `...spread` in the return). The
 * chapter order is: ch1 keeps the data tools. Keep this table and the seams in sync.
 *
 *   section        | name                 | purpose
 *   ---------------|----------------------|------------------------------------------
 *   data tools     | duckdb_query         | run one SQL statement; explore / create tables
 *   data tools     | load_builtin_dataset | load a bundled sample dataset (parquet) into a table
 */
export function createTools(ctx: ToolContext) {
    // CHAPTER SEAM: data tools — the base kept from ch1 (SQL + built-in datasets).
    // Dropped entirely only in ch0 (chat-only). Its system-prompt
    // counterpart is the DATA_GUIDANCE + BUILTIN_DATASETS sections in systemPrompt.ts.
    const dataTools = {
        duckdb_query: createDuckdbQueryTool(ctx),
        load_builtin_dataset: createLoadBuiltinDatasetTool(ctx),
    };

    return {
        ...dataTools,
    };
}

export type AgentTools = ReturnType<typeof createTools>;
