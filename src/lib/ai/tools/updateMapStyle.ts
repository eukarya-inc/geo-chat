import { tool } from 'ai';
import { z } from 'zod';

import { getTableSchema } from '@/lib/duckdb/db';
import type { TableMapStyle } from '@/lib/map/mapSpec';
import type { ToolContext } from '../toolContext';

export function createUpdateMapStyleTool(ctx: ToolContext) {
    return tool({
        description:
            'Set the map style for a table with a geometry column. Provide the geometry kind and a MapLibre `paint` bag ' +
            '(and optional `layout`). Property names must match the geometry kind: circle-* for point, line-* for line, fill-* for polygon. ' +
            'Reference data columns with direct property access — ["get", "column_name"] — never nested "properties" wrappers. ' +
            'On success the map tab opens showing the styled table.',
        inputSchema: z.object({
            table: z.string(),
            geometryType: z.enum(['point', 'line', 'polygon']),
            paint: z.record(z.string(), z.any()).describe('MapLibre paint properties, e.g. {"fill-color": "#f00"}.'),
            layout: z.record(z.string(), z.any()).optional(),
        }),
        execute: async ({ table, geometryType, paint, layout }) => {
            const schema = await getTableSchema(table).catch(() => null);
            if (!schema) return { error: `Table "${table}" not found.` };
            if (!schema.some(c => c.type.toUpperCase().includes('GEOMETRY'))) {
                return { error: `Table "${table}" has no geometry column and cannot be shown on the map.` };
            }

            // CHAPTER SEAM: validation layer (removed) — the naive branch trusts the
            // model's paint/layout blindly: no paint-prefix check, no fuzzy column
            // correction. A bad paint key or a mistyped ["get", col] now sails through
            // and breaks in the map instead of being caught here. That fragility is
            // this chapter's lesson.
            const style: TableMapStyle = {
                geometryType,
                paint,
                ...(layout ? { layout } : {}),
            };
            ctx.setMapStyle(table, style);
            ctx.setSelectedTable(table);
            ctx.setActiveTab('map');

            return { success: true, table };
        },
    });
}
