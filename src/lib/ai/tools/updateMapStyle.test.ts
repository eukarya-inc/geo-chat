import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { TableMapStyle } from '@/lib/map/mapSpec';
import type { ToolContext } from '../toolContext';

// Mock the DB layer: the tool only needs a table's schema.
const getTableSchema = vi.fn();
vi.mock('@/lib/duckdb/db', () => ({ getTableSchema: (t: string) => getTableSchema(t) }));

// vitest hoists vi.mock above imports, so this import receives the mocked db module.
import { createUpdateMapStyleTool } from './updateMapStyle';

/** Minimal ToolContext that records the last style written. */
function fakeContext(): ToolContext & { lastStyle?: TableMapStyle; lastTab?: string } {
    const ctx = {
        refreshTables: vi.fn(),
        setSelectedTable: vi.fn(),
        setActiveTab: vi.fn((t: string) => (ctx.lastTab = t)),
        getChartSpec: vi.fn(),
        setChartSpec: vi.fn(),
        getMapStyle: vi.fn(),
        setMapStyle: vi.fn((_t: string, s: TableMapStyle) => (ctx.lastStyle = s)),
    } as unknown as ToolContext & { lastStyle?: TableMapStyle; lastTab?: string };
    return ctx;
}

const run = async (tool: ReturnType<typeof createUpdateMapStyleTool>, input: unknown) =>
    (await tool.execute!(input as never, { toolCallId: 't', messages: [] } as never)) as Record<string, unknown>;

describe('update_map_style', () => {
    beforeEach(() => {
        getTableSchema.mockReset();
        getTableSchema.mockResolvedValue([
            { name: 'geom', type: 'GEOMETRY' },
            { name: 'CityName', type: 'VARCHAR' },
            { name: 'population', type: 'INTEGER' },
        ]);
    });

    it('applies the paint verbatim and opens the map tab', async () => {
        // The naive branch trusts the model: whatever paint it sends is applied as-is.
        const ctx = fakeContext();
        const result = await run(createUpdateMapStyleTool(ctx), {
            table: 'cities',
            geometryType: 'polygon',
            paint: { 'fill-color': ['get', 'population'] },
        });
        expect(result.success).toBe(true);
        expect(ctx.lastTab).toBe('map');
        expect(ctx.lastStyle).toEqual({ geometryType: 'polygon', paint: { 'fill-color': ['get', 'population'] } });
    });

    it('errors when the table has no geometry column', async () => {
        getTableSchema.mockResolvedValue([{ name: 'population', type: 'INTEGER' }]);
        const ctx = fakeContext();
        const result = await run(createUpdateMapStyleTool(ctx), {
            table: 'stats',
            geometryType: 'polygon',
            paint: { 'fill-color': '#f00' },
        });
        expect(result.error).toMatch(/no geometry column/);
    });
});
