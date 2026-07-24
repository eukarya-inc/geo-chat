import { tool } from 'ai';
import { z } from 'zod';

import { executeQuery, getTableSchema } from '@/lib/duckdb/db';
import type { ToolContext } from '../toolContext';
import { hasMultipleStatements } from './sqlGuard';

const MAX_SAMPLE_ROWS = 5;
const MAX_STRING_LEN = 200;

/** Stringifies a cell value and truncates long strings so the model isn't flooded. */
function sampleValue(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (typeof value === 'object') value = JSON.stringify(value);
    const str = String(value);
    return str.length > MAX_STRING_LEN ? str.slice(0, MAX_STRING_LEN) + '…' : str;
}

/** Extracts the table name from a `CREATE TABLE [IF NOT EXISTS] <name>` statement. */
function createdTableName(sql: string): string | null {
    const m = sql.match(/create\s+(?:or\s+replace\s+)?table\s+(?:if\s+not\s+exists\s+)?("?)([^\s"(]+)\1/i);
    return m ? m[2] : null;
}

export function createDuckdbQueryTool(ctx: ToolContext) {
    return tool({
        description:
            'Run a single SQL statement against the DuckDB-WASM database (main schema, spatial extension loaded). ' +
            'Use it to explore data before answering (always LIMIT exploratory SELECTs) and to CREATE TABLE for results worth visualizing. ' +
            'Returns column types, up to 5 sample rows, the row count, and whether the result has a geometry column.',
        inputSchema: z.object({
            sql: z.string().describe('One SQL statement (no trailing extra statements).'),
            purpose: z
                .enum(['explore', 'result'])
                .optional()
                .describe('"explore" for inspecting data, "result" when creating a table to visualize.'),
        }),
        execute: async ({ sql }) => {
            if (hasMultipleStatements(sql)) {
                return { error: 'Multiple SQL statements detected. Run one statement at a time.' };
            }

            let result;
            try {
                result = await executeQuery(sql);
            } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
            }

            const columns = result.columns.map(c => ({ name: c.name, type: c.type }));
            const hasGeometry = columns.some(c => c.type.toUpperCase().includes('GEOMETRY'));
            const sampleRows = result.rows.slice(0, MAX_SAMPLE_ROWS).map(row => {
                const out: Record<string, unknown> = {};
                for (const col of result.columns) out[col.name] = sampleValue(row[col.name]);
                return out;
            });

            // A CREATE TABLE (or other DDL) changed the table list: refresh it, and if
            // the new table is mappable, select it and tell the model it can be styled.
            const created = createdTableName(sql);
            let hint: string | undefined;
            if (created) {
                await ctx.refreshTables();
                const schema = await getTableSchema(created).catch(() => []);
                const geomCol = schema.find(c => c.type.toUpperCase().includes('GEOMETRY'));
                if (geomCol) {
                    ctx.setSelectedTable(created);
                    // Deliberately tool-agnostic: visualization tools belong to a later
                    // chapter layer, so this hint must not name them (CHAPTER SEAM contract).
                    hint = `Table "${created}" has a geometry column ("${geomCol.name}"); it is ready to be visualized on the map.`;
                }
            }

            return { columns, rowCount: result.rowCount, sampleRows, hasGeometry, createdTable: created, hint };
        },
    });
}
