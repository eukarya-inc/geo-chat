import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToolContext } from '../toolContext';
import { markFetched, resetGate } from '../skills/gate';

// Keep the gated tools' execute from touching the real DuckDB-WASM db.
const getTableSchema = vi.fn().mockResolvedValue([{ name: 'geom', type: 'GEOMETRY' }]);
vi.mock('@/lib/duckdb/db', () => ({ getTableSchema: (t: string) => getTableSchema(t) }));

import { createTools } from './index';

function fakeContext(): ToolContext {
    return {
        refreshTables: vi.fn(),
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

describe('skill prerequisite gate wrapping', () => {
    afterEach(() => resetGate());

    it('blocks update_map_style until a map skill is fetched', async () => {
        const tools = createTools(fakeContext());
        const blocked = await call(tools.update_map_style, {
            table: 't',
            geometryType: 'polygon',
            paint: { 'fill-color': '#f00' },
        });
        expect(blocked.error).toContain('get_skill');
        expect(blocked.error).toContain('map.styling');
    });

    it('blocks update_chart_spec until a vega skill is fetched', async () => {
        const tools = createTools(fakeContext());
        const blocked = await call(tools.update_chart_spec, { table: 't', spec: { mark: 'bar' } });
        expect(blocked.error).toContain('get_skill');
        expect(blocked.error).toContain('vega.basics');
    });

    it('lets the tool run once its domain has been fetched', async () => {
        markFetched('map');
        const tools = createTools(fakeContext());
        const result = await call(tools.update_map_style, {
            table: 't',
            geometryType: 'polygon',
            paint: { 'fill-color': '#f00' },
        });
        // Past the gate: the real execute ran (touched the mocked schema) and succeeded.
        expect(result.success).toBe(true);
        expect(getTableSchema).toHaveBeenCalled();
    });
});
