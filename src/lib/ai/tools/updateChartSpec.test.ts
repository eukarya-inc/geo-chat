import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ToolContext } from '../toolContext';

const getTableSchema = vi.fn();
vi.mock('@/lib/duckdb/db', () => ({ getTableSchema: (t: string) => getTableSchema(t) }));

// vitest hoists vi.mock above imports, so this import receives the mocked db module.
import { createUpdateChartSpecTool } from './updateChartSpec';

function fakeContext(): ToolContext & { lastSpec?: object; lastTab?: string } {
    const ctx = {
        refreshTables: vi.fn(),
        setSelectedTable: vi.fn(),
        setActiveTab: vi.fn((t: string) => (ctx.lastTab = t)),
        getChartSpec: vi.fn(),
        setChartSpec: vi.fn((_t: string, s: object) => (ctx.lastSpec = s)),
        getMapStyle: vi.fn(),
        setMapStyle: vi.fn(),
    } as unknown as ToolContext & { lastSpec?: object; lastTab?: string };
    return ctx;
}

const run = async (tool: ReturnType<typeof createUpdateChartSpecTool>, input: unknown) =>
    (await tool.execute!(input as never, { toolCallId: 't', messages: [] } as never)) as Record<string, unknown>;

describe('update_chart_spec', () => {
    beforeEach(() => {
        getTableSchema.mockReset();
        getTableSchema.mockResolvedValue([
            { name: 'prefecture', type: 'VARCHAR' },
            { name: 'cities', type: 'INTEGER' },
        ]);
    });

    it('rejects a spec that sets injected keys', async () => {
        const ctx = fakeContext();
        for (const key of ['data', 'width', 'height']) {
            const result = await run(createUpdateChartSpecTool(ctx), {
                table: 'stats',
                spec: { mark: 'bar', [key]: 123, encoding: {} },
            });
            expect(result.error).toContain(key);
        }
    });

    it('applies a valid spec and opens the chart tab', async () => {
        const ctx = fakeContext();
        const result = await run(createUpdateChartSpecTool(ctx), {
            table: 'stats',
            spec: {
                mark: 'bar',
                encoding: {
                    x: { field: 'prefecture', type: 'nominal' },
                    y: { field: 'cities', type: 'quantitative' },
                },
            },
        });
        expect(result.success).toBe(true);
        expect(ctx.lastTab).toBe('chart');
        expect(ctx.lastSpec).toBeDefined();
    });

    it('accepts a JSON string spec', async () => {
        const ctx = fakeContext();
        const result = await run(createUpdateChartSpecTool(ctx), {
            table: 'stats',
            spec: JSON.stringify({ mark: 'bar', encoding: { x: { field: 'prefecture', type: 'nominal' } } }),
        });
        expect(result.success).toBe(true);
    });
});
