import type { ToolContext } from '../toolContext';
import { createDuckdbQueryTool } from './duckdbQuery';
import { createGeocodeTool } from './geocode';
import { createGetChartSpecTool } from './getChartSpec';
import { createGetMapStyleTool } from './getMapStyle';
import { createUpdateChartSpecTool } from './updateChartSpec';
import { createUpdateMapStyleTool } from './updateMapStyle';

/**
 * The tool registry handed to the agent loop. Each factory closes over the shared
 * ToolContext so tools can touch app state without importing React or jotai.
 *
 *   name              | purpose
 *   ------------------|-------------------------------------------------------
 *   duckdb_query      | run one SQL statement; explore data / create tables
 *   update_map_style  | set a table's MapLibre paint/layout (opens Map tab)
 *   get_map_style     | read a table's current (or default) map style
 *   update_chart_spec | set a table's Vega-Lite spec (opens Chart tab)
 *   get_chart_spec    | read a table's current chart spec
 *   geocode_address   | place name / address -> coordinates via Nominatim
 */
export function createTools(ctx: ToolContext) {
    return {
        duckdb_query: createDuckdbQueryTool(ctx),
        update_map_style: createUpdateMapStyleTool(ctx),
        get_map_style: createGetMapStyleTool(ctx),
        update_chart_spec: createUpdateChartSpecTool(ctx),
        get_chart_spec: createGetChartSpecTool(ctx),
        geocode_address: createGeocodeTool(),
    };
}

export type AgentTools = ReturnType<typeof createTools>;
