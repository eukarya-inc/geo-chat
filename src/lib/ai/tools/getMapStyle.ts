import { tool } from 'ai';
import { z } from 'zod';

import { detectGeometryColumn, detectGeometryKind } from '@/lib/map/geometry';
import { defaultMapStyle } from '@/lib/map/mapSpec';
import type { ToolContext } from '../toolContext';

export function createGetMapStyleTool(ctx: ToolContext) {
    return tool({
        description:
            'Get the current map style for a table. If none has been set, returns the default style for the ' +
            "table's geometry kind, so you can read it and send back a modified version.",
        inputSchema: z.object({ table: z.string() }),
        execute: async ({ table }) => {
            const existing = ctx.getMapStyle(table);
            if (existing) return { table, style: existing, isDefault: false };

            const column = await detectGeometryColumn(table).catch(() => null);
            if (!column) return { error: `Table "${table}" has no geometry column.` };
            const kind = await detectGeometryKind(table, column);
            return { table, style: defaultMapStyle(kind), isDefault: true };
        },
    });
}
