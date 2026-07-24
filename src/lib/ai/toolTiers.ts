/**
 * The workshop's capability ladder. The agent only receives the tools listed
 * in ENABLED_TOOLS, and the system prompt only describes those tools. Each
 * curriculum chapter enables one more tier by editing that one line:
 *
 *   Chapter 1 (a bare model):          []
 *   Chapter 2 (one general-purpose):   [...TIER_1]
 *   Chapter 3 (knowledge on demand):   [...TIER_1, ...TIER_2]
 *   Chapter 4+ (specialized tools):    [...TIER_1, ...TIER_2, ...TIER_3]
 */
export const TIER_1 = ['duckdb_query', 'load_builtin_dataset'] as const;
export const TIER_2 = ['get_skill'] as const;
export const TIER_3 = [
    'update_map_style',
    'get_map_style',
    'update_chart_spec',
    'get_chart_spec',
    'geocode_address',
] as const;

export type ToolName = (typeof TIER_1)[number] | (typeof TIER_2)[number] | (typeof TIER_3)[number];

// Workshop participants edit this line — one tier per chapter.
export const ENABLED_TOOLS: readonly ToolName[] = [...TIER_1, ...TIER_2, ...TIER_3];
