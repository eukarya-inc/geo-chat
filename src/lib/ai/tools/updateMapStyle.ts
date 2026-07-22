import { tool } from 'ai';
import { z } from 'zod';

import { getTableSchema } from '@/lib/duckdb/db';
import { layerTypeFor, type GeometryKind, type TableMapStyle } from '@/lib/map/mapSpec';
import type { ToolContext } from '../toolContext';
import { collectGetColumns, matchColumn, rewriteGetColumns } from './columnMatch';

/** The paint-property prefix each geometry kind's MapLibre layer accepts. */
const PAINT_PREFIX: Record<GeometryKind, string> = { point: 'circle-', line: 'line-', polygon: 'fill-' };

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

            // 1. Paint keys must belong to this geometry kind's layer type.
            const prefix = PAINT_PREFIX[geometryType];
            const layerType = layerTypeFor(geometryType);
            const badKeys = Object.keys(paint).filter(k => !k.startsWith(prefix));
            if (badKeys.length > 0) {
                return {
                    error: `Paint properties [${badKeys.join(', ')}] are not valid for a ${layerType} layer. Use ${prefix}* properties for ${geometryType} geometry.`,
                };
            }

            // 2. Every ["get", col] must reference a real column; auto-correct near-misses.
            const columnNames = schema.map(c => c.name);
            const referenced = collectGetColumns([...Object.values(paint), ...Object.values(layout ?? {})]);
            const rename = new Map<string, string>();
            const corrections: string[] = [];
            for (const ref of referenced) {
                const match = matchColumn(ref, columnNames);
                if (!match.ok) {
                    return {
                        error: `Column "${ref}" does not exist in "${table}". Valid columns: ${columnNames.join(', ')}.`,
                    };
                }
                if (match.corrected) {
                    rename.set(ref, match.name);
                    corrections.push(`"${ref}" → "${match.name}"`);
                }
            }

            const fixedPaint = rewriteGetColumns(paint, rename) as Record<string, unknown>;
            const fixedLayout = layout ? (rewriteGetColumns(layout, rename) as Record<string, unknown>) : undefined;

            const style: TableMapStyle = {
                geometryType,
                paint: fixedPaint,
                ...(fixedLayout ? { layout: fixedLayout } : {}),
            };
            ctx.setMapStyle(table, style);
            ctx.setSelectedTable(table);
            ctx.setActiveTab('map');

            return {
                success: true,
                table,
                ...(corrections.length > 0 ? { corrected: corrections } : {}),
            };
        },
    });
}
