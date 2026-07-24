import type { ToolContext } from '../toolContext';
import { createDuckdbQueryTool } from './duckdbQuery';
import { createGeocodeTool } from './geocode';
import { createGetChartSpecTool } from './getChartSpec';
import { createGetMapStyleTool } from './getMapStyle';
import { createLoadBuiltinDatasetTool } from './loadBuiltinDataset';
import { createUpdateChartSpecTool } from './updateChartSpec';
import { createUpdateMapStyleTool } from './updateMapStyle';

/**
 * The tool registry handed to the agent loop. Each factory closes over the shared
 * ToolContext so tools can touch app state without importing React or jotai.
 *
 * The body is composed from clearly delimited SEAM sections so a chapter branch can
 * drop a capability by deleting a section (and its `...spread` in the return). The
 * chapter order is: ch1 keeps the data tools, ch2 adds visualization. Keep this
 * table and the seams in sync.
 *
 *   section        | name                 | purpose
 *   ---------------|----------------------|------------------------------------------
 *   data tools     | duckdb_query         | run one SQL statement; explore / create tables
 *   data tools     | load_builtin_dataset | load a bundled sample dataset (parquet) into a table
 *   data tools     | geocode_address      | place name / address -> coordinates via Nominatim
 *   visualization  | update_map_style     | set a table's MapLibre paint/layout
 *   visualization  | get_map_style        | read a table's current (or default) map style
 *   visualization  | update_chart_spec    | set a table's Vega-Lite spec
 *   visualization  | get_chart_spec       | read a table's current chart spec
 */
export function createTools(ctx: ToolContext) {
    // CHAPTER SEAM: data tools — the base kept from ch1 (SQL + built-in datasets +
    // geocoding). Dropped entirely only in ch0 (chat-only). Its system-prompt
    // counterpart is the DATA_GUIDANCE + BUILTIN_DATASETS sections in systemPrompt.ts.
    const dataTools = {
        duckdb_query: createDuckdbQueryTool(ctx),
        load_builtin_dataset: createLoadBuiltinDatasetTool(ctx),
        geocode_address: createGeocodeTool(),
    };

    // CHAPTER SEAM: visualization tools — map + chart read/write (added in ch2). The
    // update_* write tools validate the model's paint/spec before applying them.
    const visualizationTools = {
        update_map_style: createUpdateMapStyleTool(ctx),
        get_map_style: createGetMapStyleTool(ctx),
        update_chart_spec: createUpdateChartSpecTool(ctx),
        get_chart_spec: createGetChartSpecTool(ctx),
    };

    return {
        ...dataTools,
        ...visualizationTools,
    };
}

export type AgentTools = ReturnType<typeof createTools>;
