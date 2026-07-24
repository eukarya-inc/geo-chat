import type { QueryColumn } from '@/lib/duckdb/db';
import { BUILTIN_DATASETS } from './builtinDatasets';

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

// ─────────────────────────────────────────────────────────────────────────────
// The system prompt is assembled from named sections so a chapter branch can drop
// a whole capability by deleting its section from `buildSystemPrompt` below. Each
// `// CHAPTER SEAM` there marks a section that a chapter subtracts along with the
// matching tools. The section text itself is unchanged from the original prompt —
// only split into constants.
// ─────────────────────────────────────────────────────────────────────────────

/** CORE: role, environment, and the always-on answer rules. Present in every chapter. */
const CORE = `You are a geospatial data assistant running entirely in the user's web browser.

## Environment
- Data lives in a DuckDB-WASM database (schema \`main\`) with the spatial extension loaded, so PostGIS-style functions (ST_Read, ST_Point, ST_GeometryType, ST_Area, ST_Distance, …) are available.
- You have no filesystem or network access except through your tools. The user sees three visual tabs — Table, Map, and Chart — that render whatever table is selected.
- Tables with a GEOMETRY column can be drawn on the map; any table can be charted.

## Answering
- Keep answers concise and reply in the same language the user writes in.`;

/** DATA_GUIDANCE: how to explore/build tables and geocode. Goes with the data-tools seam. */
const DATA_GUIDANCE = `## Working with data
1. Explore before you answer. Use \`duckdb_query\` to inspect schemas and sample rows. Always add a LIMIT to exploratory SELECTs.
2. When a result is worth visualizing, CREATE TABLE it (a stable, named table the visual tabs can read) rather than returning a huge SELECT.
3. Use \`geocode_address\` to turn a place name or address into coordinates when the user gives you one instead of data.`;

/** BUILTIN_DATASETS: catalog of bundled datasets. Goes with the data-tools seam. */
const BUILTIN_DATASETS_SECTION = `## Built-in datasets
These bundled sample datasets can be loaded on demand. When the user asks about data matching one of these and its table is not yet listed in the Context below, load it yourself by calling \`load_builtin_dataset\` with the table name, then continue with the task.
${BUILTIN_DATASETS.map(d => `- ${d.table} (${d.url}): ${d.description}`).join('\n')}`;

/** Formats one table as `name(col type, col type, …)`, capping the column list. */
function formatTable(table: TableContext): string {
    const shown = table.columns.slice(0, MAX_COLUMNS_LISTED).map(c => `${c.name} ${c.type}`);
    const extra = table.columns.length - shown.length;
    const cols = extra > 0 ? `${shown.join(', ')}, …(+${extra} more)` : shown.join(', ');
    return `- ${table.name}(${cols})`;
}

/**
 * Builds the full system prompt by composing the named sections above plus the live
 * date and schemas. The `// CHAPTER SEAM` comments mark sections a chapter branch
 * deletes together with the matching tools (see `createTools` in tools/index.ts).
 */
export function buildSystemPrompt(context: PromptContext): string {
    const sections: string[] = [CORE];

    // CHAPTER SEAM: data tools — duckdb_query + load_builtin_dataset. Present from ch1;
    // dropped only in ch0 (chat-only). Datasets live with the data tools, not a later layer.
    sections.push(DATA_GUIDANCE, BUILTIN_DATASETS_SECTION);

    const date = context.now.toISOString().slice(0, 10);
    const tables =
        context.tables.length === 0
            ? 'No tables yet. Load data first (e.g. read a Parquet/CSV/GeoJSON file with duckdb_query).'
            : context.tables.map(formatTable).join('\n');
    sections.push(`## Context\nCurrent date: ${date}\n\nTables in the database:\n${tables}`);

    return sections.join('\n\n');
}
