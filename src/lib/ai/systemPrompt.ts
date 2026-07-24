import type { QueryColumn } from '@/lib/duckdb/db';

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

    // CHAPTER SEAM: data tools — DATA_GUIDANCE + BUILTIN_DATASETS. Added in ch1, together
    // with the data tools in tools/index.ts. Chat-only has no data sections at all.

    const date = context.now.toISOString().slice(0, 10);
    const tables =
        context.tables.length === 0
            ? 'No tables yet. The user can load data manually in the SQL tab.'
            : context.tables.map(formatTable).join('\n');
    sections.push(`## Context\nCurrent date: ${date}\n\nTables in the database:\n${tables}`);

    return sections.join('\n\n');
}
