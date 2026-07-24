import type { Tool } from 'ai';

import { hasFetched } from '../skills/gate';
import type { ToolContext } from '../toolContext';
import { createDuckdbQueryTool } from './duckdbQuery';
import { createGeocodeTool } from './geocode';
import { createGetChartSpecTool } from './getChartSpec';
import { createGetMapStyleTool } from './getMapStyle';
import { createGetSkillTool } from './getSkill';
import { createLoadBuiltinDatasetTool } from './loadBuiltinDataset';
import { createUpdateChartSpecTool } from './updateChartSpec';
import { createUpdateMapStyleTool } from './updateMapStyle';

/**
 * Wraps a tool so it refuses to run until a skill of `domain` has been fetched via
 * get_skill. The wrapped execute short-circuits with an error object (no side
 * effects) telling the model which skill to fetch first. This is the entire
 * prerequisite gate — small enough to read on one screen, which is the point.
 */
function requireSkill<T extends Tool>(domain: string, suggestion: string, tool: T): T {
    const inner = tool.execute;
    if (!inner) return tool;
    return {
        ...tool,
        execute: (input: unknown, options: unknown) => {
            if (!hasFetched(domain)) {
                return {
                    error:
                        `Fetch the '${suggestion}' skill with get_skill before using this tool. ` +
                        `This loads the required ${domain} format documentation.`,
                };
            }
            return (inner as (i: unknown, o: unknown) => unknown)(input, options);
        },
    } as T;
}

/**
 * The tool registry handed to the agent loop. Each factory closes over the shared
 * ToolContext so tools can touch app state without importing React or jotai.
 *
 * The body is composed from clearly delimited SEAM sections so a chapter branch can
 * drop a capability by deleting a section (and its `...spread` in the return). The
 * chapter order is: ch1 keeps the data tools, ch2 adds visualization, ch4 adds the
 * skill system. Keep this table and the seams in sync.
 *
 *   section        | name                 | purpose
 *   ---------------|----------------------|------------------------------------------
 *   data tools     | duckdb_query         | run one SQL statement; explore / create tables
 *   data tools     | load_builtin_dataset | load a bundled sample dataset (parquet) into a table
 *   data tools     | geocode_address      | place name / address -> coordinates via Nominatim
 *   visualization  | update_map_style     | set a table's MapLibre paint/layout (gated: map.* skill)
 *   visualization  | get_map_style        | read a table's current (or default) map style
 *   visualization  | update_chart_spec    | set a table's Vega-Lite spec (gated: vega.* skill)
 *   visualization  | get_chart_spec       | read a table's current chart spec
 *   skill system   | get_skill            | fetch skill instructions; unlocks the gated tools
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
    // update_* write tools are naive here; the skill-system seam below wraps them
    // with the prerequisite gate.
    const visualizationTools = {
        update_map_style: createUpdateMapStyleTool(ctx),
        get_map_style: createGetMapStyleTool(ctx),
        update_chart_spec: createUpdateChartSpecTool(ctx),
        get_chart_spec: createGetChartSpecTool(ctx),
    };

    // CHAPTER SEAM: skill system — get_skill + the gate wiring that requires a map.*
    // skill for update_map_style and a vega.* skill for update_chart_spec (added in
    // ch4). Deleting this seam means deleting the two requireSkill() lines below, the
    // skillSystem object, and its spread in the return.
    const skillSystem = {
        get_skill: createGetSkillTool(),
    };
    visualizationTools.update_map_style = requireSkill('map', 'map.styling', visualizationTools.update_map_style);
    visualizationTools.update_chart_spec = requireSkill('vega', 'vega.basics', visualizationTools.update_chart_spec);

    return {
        ...dataTools,
        ...visualizationTools,
        ...skillSystem,
    };
}

export type AgentTools = ReturnType<typeof createTools>;
