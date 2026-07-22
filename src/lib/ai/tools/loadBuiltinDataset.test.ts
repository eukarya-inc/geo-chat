import { describe, expect, it, vi } from 'vitest';
import type { z } from 'zod';

import type { ToolContext } from '../toolContext';

// Mock the DuckDB layer so the tool's logic can be tested without a real database.
const createTableFromUrl = vi.fn().mockResolvedValue(undefined);
const getTableSchema = vi.fn().mockResolvedValue([
    { name: 'city', type: 'VARCHAR' },
    { name: 'geom', type: 'GEOMETRY' },
]);
vi.mock('@/lib/duckdb/db', () => ({
    createTableFromUrl: (url: string, table: string) => createTableFromUrl(url, table),
    getTableSchema: (table: string) => getTableSchema(table),
}));

import { createLoadBuiltinDatasetTool } from './loadBuiltinDataset';

function fakeContext(): ToolContext {
    return {
        refreshTables: vi.fn().mockResolvedValue(undefined),
        setSelectedTable: vi.fn(),
        setActiveTab: vi.fn(),
        getChartSpec: vi.fn(),
        setChartSpec: vi.fn(),
        getMapStyle: vi.fn(),
        setMapStyle: vi.fn(),
    } as unknown as ToolContext;
}

const call = async (tool: { execute?: (i: never, o: never) => unknown }, input: unknown) =>
    (await tool.execute!(input as never, { toolCallId: 't', messages: [] } as never)) as Record<string, unknown>;

describe('load_builtin_dataset tool', () => {
    it('only accepts the known dataset names', () => {
        const tool = createLoadBuiltinDatasetTool(fakeContext());
        const schema = tool.inputSchema as unknown as z.ZodType<{ table: string }>;
        expect(schema.safeParse({ table: 'japan_cities' }).success).toBe(true);
        expect(schema.safeParse({ table: 'japan_prefectures' }).success).toBe(true);
        expect(schema.safeParse({ table: 'not_a_dataset' }).success).toBe(false);
    });

    it('loads the dataset, refreshes tables, selects it, and returns its schema', async () => {
        const ctx = fakeContext();
        const tool = createLoadBuiltinDatasetTool(ctx);
        const result = await call(tool, { table: 'japan_cities' });

        expect(createTableFromUrl).toHaveBeenCalledWith(
            expect.stringContaining('japan_cities.parquet'),
            'japan_cities'
        );
        expect(ctx.refreshTables).toHaveBeenCalled();
        // Has a geometry column, so it becomes the selected (mappable) table.
        expect(ctx.setSelectedTable).toHaveBeenCalledWith('japan_cities');
        expect(result.table).toBe('japan_cities');
        expect(result.columns).toEqual([
            { name: 'city', type: 'VARCHAR' },
            { name: 'geom', type: 'GEOMETRY' },
        ]);
        expect(String(result.hint)).toContain('update_map_style');
    });

    it('returns an error object when the load fails', async () => {
        createTableFromUrl.mockRejectedValueOnce(new Error('fetch failed'));
        const tool = createLoadBuiltinDatasetTool(fakeContext());
        const result = await call(tool, { table: 'japan_prefectures' });
        expect(result.error).toContain('fetch failed');
    });
});
