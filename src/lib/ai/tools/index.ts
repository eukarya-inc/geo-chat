import type { Tool } from 'ai';

import { hasFetched } from '../skills/gate';
import { ENABLED_TOOLS, type ToolName } from '../toolTiers';
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
 * ENABLED_TOOLS in toolTiers.ts decides which of these the agent actually receives.
 *
 *   name                 | purpose
 *   ---------------------|----------------------------------------------------
 *   duckdb_query         | run one SQL statement; explore data / create tables
 *   load_builtin_dataset | load a bundled sample dataset (parquet) into a table
 *   get_skill            | fetch skill instructions; unlocks the gated tools below
 *   update_map_style  | set a table's MapLibre paint/layout (needs a map.* skill)
 *   get_map_style     | read a table's current (or default) map style
 *   update_chart_spec | set a table's Vega-Lite spec (needs a vega.* skill)
 *   get_chart_spec    | read a table's current chart spec
 *   geocode_address   | place name / address -> coordinates via Nominatim
 */
export function createTools(ctx: ToolContext, enabled: readonly ToolName[] = ENABLED_TOOLS) {
    const all = {
        duckdb_query: createDuckdbQueryTool(ctx),
        load_builtin_dataset: createLoadBuiltinDatasetTool(ctx),
        get_skill: createGetSkillTool(),
        update_map_style: requireSkill('map', 'map.styling', createUpdateMapStyleTool(ctx)),
        get_map_style: createGetMapStyleTool(ctx),
        update_chart_spec: requireSkill('vega', 'vega.basics', createUpdateChartSpecTool(ctx)),
        get_chart_spec: createGetChartSpecTool(ctx),
        geocode_address: createGeocodeTool(),
    };
    // Keys outside `enabled` are absent at runtime. The cast keeps the full
    // static type: the default tier set includes every tool, and workshop
    // tiers are only ever narrowed by editing ENABLED_TOOLS.
    const entries = Object.entries(all).filter(([name]) => (enabled as readonly string[]).includes(name));
    return Object.fromEntries(entries) as typeof all;
}

export type AgentTools = ReturnType<typeof createTools>;
