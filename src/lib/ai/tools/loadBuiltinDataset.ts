import { tool } from 'ai';
import { z } from 'zod';

import { createTableFromUrl, getTableSchema } from '@/lib/duckdb/db';
import { BUILTIN_DATASETS, findBuiltinDataset } from '../builtinDatasets';
import type { ToolContext } from '../toolContext';

// DuckDB-WASM has no httpfs, so `read_parquet('<url>')` cannot fetch a URL itself.
// createTableFromUrl fetches the bytes and registers them as a virtual file, which
// is why loading a built-in dataset needs this dedicated tool rather than plain SQL.
const TABLE_NAMES = BUILTIN_DATASETS.map(d => d.table);

export function createLoadBuiltinDatasetTool(ctx: ToolContext) {
    return tool({
        description:
            'Load a bundled sample dataset into DuckDB by name (creates a table you can then query, map, or chart). ' +
            `Available datasets: ${TABLE_NAMES.join(', ')}. Returns the created table's column schema.`,
        inputSchema: z.object({
            table: z.enum(TABLE_NAMES as [string, ...string[]]).describe('Which built-in dataset to load.'),
        }),
        execute: async ({ table }) => {
            const dataset = findBuiltinDataset(table);
            if (!dataset) return { error: `Unknown built-in dataset "${table}".` };

            try {
                await createTableFromUrl(dataset.url, dataset.table);
            } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
            }

            await ctx.refreshTables();
            const columns = await getTableSchema(dataset.table).catch(() => []);
            const geomCol = columns.find(c => c.type.toUpperCase().includes('GEOMETRY'));
            if (geomCol) ctx.setSelectedTable(dataset.table);

            return {
                table: dataset.table,
                columns,
                hint: geomCol
                    ? `Table "${dataset.table}" has a geometry column ("${geomCol.name}"); you can style it with update_map_style.`
                    : undefined,
            };
        },
    });
}
