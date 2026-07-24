import type { QueryColumn } from '@/lib/duckdb/db';
import { BUILTIN_DATASETS } from './builtinDatasets';
import { ENABLED_TOOLS, type ToolName } from './toolTiers';

/** A table and its columns, used to give the model schema context. */
export interface TableContext {
    name: string;
    columns: QueryColumn[];
}

export interface PromptContext {
    /** Current date, shown to the model (helps with "recent"/"today" questions). */
    now: Date;
    /** Tables currently in the database, with their schemas. */
    tables: TableContext[];
}

const MAX_COLUMNS_LISTED = 20;

const ROLE_AND_ENV = `You are a geospatial data assistant running entirely in the user's web browser.

## Environment
- Data lives in a DuckDB-WASM database (schema \`main\`) with the spatial extension loaded, so PostGIS-style functions (ST_Read, ST_Point, ST_GeometryType, ST_Area, ST_Distance, …) are available.
- You have no filesystem or network access except through your tools. The user sees three visual tabs — Table, Map, and Chart — that render whatever table is selected.
- Tables with a GEOMETRY column can be drawn on the map; any table can be charted.`;

/** "## How to work" — steps renumber themselves as tiers grow. */
function howToWorkSection(has: (t: ToolName) => boolean): string | null {
    const steps: string[] = [];
    if (has('duckdb_query')) {
        steps.push(
            'Explore before you answer. Use `duckdb_query` to inspect schemas and sample rows. Always add a LIMIT to exploratory SELECTs.'
        );
        steps.push(
            'When a result is worth visualizing, CREATE TABLE it (a stable, named table the visual tabs can read) rather than returning a huge SELECT.'
        );
    }
    if (has('update_map_style') || has('update_chart_spec')) {
        steps.push(
            'To draw a map, call `update_map_style` with the table, its geometry kind, and MapLibre paint properties. To make a chart, call `update_chart_spec` with a Vega-Lite spec. Read the current state first with `get_map_style` / `get_chart_spec` when adjusting an existing visualization.'
        );
    }
    if (has('geocode_address')) {
        steps.push(
            'Use `geocode_address` to turn a place name or address into coordinates when the user gives you one instead of data.'
        );
    }
    return steps.length ? `## How to work\n${steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}` : null;
}

/** "## Built-in datasets" — only relevant once the model can load one itself. */
function builtinDatasetsSection(has: (t: ToolName) => boolean): string | null {
    if (!has('load_builtin_dataset')) return null;
    return `## Built-in datasets
These bundled sample datasets can be loaded on demand. When the user asks about data matching one of these and its table is not yet listed in the Context below, load it yourself by calling \`load_builtin_dataset\` with the table name, then continue with the task.
${BUILTIN_DATASETS.map(d => `- ${d.table} (${d.url}): ${d.description}`).join('\n')}`;
}

/** "## Skills" — the gate sentence only applies once a gated tool is actually enabled. */
function skillsSection(has: (t: ToolName) => boolean): string | null {
    if (!has('get_skill')) return null;
    const bullets = [
        "- Deeper how-to instructions live in *skills*. Call `get_skill` to load the ones relevant to the task; its description lists the catalog. Fetch skills the moment the task looks non-trivial — don't guess formats from memory.",
    ];
    if (has('update_map_style') || has('update_chart_spec')) {
        bullets.push(
            '- Some tools are gated: `update_map_style` requires a `map.*` skill and `update_chart_spec` requires a `vega.*` skill. If you call them before fetching, they return an error telling you which skill to get first.'
        );
    }
    return `## Skills\n${bullets.join('\n')}`;
}

/** "## Rules" — always present; each rule only applies when its tool is enabled. */
function rulesSection(has: (t: ToolName) => boolean): string {
    const bullets: string[] = [];
    if (has('update_map_style')) {
        bullets.push(
            '- MapLibre expressions must use DIRECT property access: `["get", "column_name"]`. Never wrap it in a "properties" accessor like `["get", "properties", ...]`.'
        );
        bullets.push(
            '- Match the geometry kind to the data: point → circle-* paint, line → line-* paint, polygon → fill-* paint.'
        );
    }
    if (has('update_chart_spec')) {
        bullets.push('- In Vega-Lite specs, never set `data`, `width`, or `height` — the app injects them.');
    }
    bullets.push('- Keep answers concise and reply in the same language the user writes in.');
    return `## Rules\n${bullets.join('\n')}`;
}

/** Formats one table as `name(col type, col type, …)`, capping the column list. */
function formatTable(table: TableContext): string {
    const shown = table.columns.slice(0, MAX_COLUMNS_LISTED).map(c => `${c.name} ${c.type}`);
    const extra = table.columns.length - shown.length;
    const cols = extra > 0 ? `${shown.join(', ')}, …(+${extra} more)` : shown.join(', ');
    return `- ${table.name}(${cols})`;
}

/**
 * Builds the system prompt: role, environment, and tool-specific guidance for
 * whichever tools are enabled, plus current date and live schemas. A reduced
 * tier of tools never gets told about tools it doesn't have.
 */
export function buildSystemPrompt(context: PromptContext, enabled: readonly ToolName[] = ENABLED_TOOLS): string {
    const has = (t: ToolName) => enabled.includes(t);

    const sections = [
        ROLE_AND_ENV,
        howToWorkSection(has),
        builtinDatasetsSection(has),
        skillsSection(has),
        rulesSection(has),
    ].filter((s): s is string => s !== null);

    const date = context.now.toISOString().slice(0, 10);
    const tables =
        context.tables.length === 0
            ? has('duckdb_query')
                ? 'No tables yet. Load data first (e.g. read a Parquet/CSV/GeoJSON file with duckdb_query).'
                : 'No tables yet.'
            : context.tables.map(formatTable).join('\n');

    return `${sections.join('\n\n')}\n\n## Context\nCurrent date: ${date}\n\nTables in the database:\n${tables}`;
}
