import { tool } from 'ai';
import { z } from 'zod';

import type { ToolContext } from '../toolContext';

export function createGetChartSpecTool(ctx: ToolContext) {
    return tool({
        description:
            'Get the current Vega-Lite chart spec for a table (without data/width/height). Returns null if none has been set yet.',
        inputSchema: z.object({ table: z.string() }),
        execute: async ({ table }) => {
            const spec = ctx.getChartSpec(table);
            return { table, spec: spec ?? null };
        },
    });
}
