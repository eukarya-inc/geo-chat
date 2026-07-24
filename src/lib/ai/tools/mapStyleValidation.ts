import { layerTypeFor, type GeometryKind } from '@/lib/map/mapSpec';
import { collectGetColumns, matchColumn, rewriteGetColumns } from './columnMatch';

/**
 * The self-correction / validation layer for update_map_style, pulled out of the
 * tool so it sits behind a single seam (see `// CHAPTER SEAM: validation layer` in
 * updateMapStyle.ts). A "naive" chapter branch swaps this whole module for a
 * passthrough:
 *
 *   export function validateMapStyleInput(input: MapStyleValidationInput): MapStyleValidationResult {
 *       return { ok: true, paint: input.paint, layout: input.layout, corrections: [] };
 *   }
 *
 * (the passthrough ignores `columns`/`table`; the seam shape stays the same)
 *
 * What lives here: the paint-prefix check (property names must match the geometry
 * kind's layer type) and fuzzy column correction (every ["get", col] must resolve
 * to a real column, auto-fixing case / Unicode near-misses).
 */

/** The paint-property prefix each geometry kind's MapLibre layer accepts. */
const PAINT_PREFIX: Record<GeometryKind, string> = { point: 'circle-', line: 'line-', polygon: 'fill-' };

export interface MapStyleValidationInput {
    /** Table name, used only for clearer error messages. */
    table: string;
    geometryType: GeometryKind;
    paint: Record<string, unknown>;
    layout?: Record<string, unknown>;
    /** The table's real column names, used to validate/correct ["get", col] refs. */
    columns: string[];
}

export type MapStyleValidationResult =
    | { ok: false; error: string }
    | {
          ok: true;
          /** Paint bag with any near-miss column references rewritten to real names. */
          paint: Record<string, unknown>;
          layout?: Record<string, unknown>;
          /** Human-readable "from → to" notes for every auto-correction made. */
          corrections: string[];
      };

export function validateMapStyleInput(input: MapStyleValidationInput): MapStyleValidationResult {
    const { table, geometryType, paint, layout, columns } = input;

    // 1. Paint keys must belong to this geometry kind's layer type.
    const prefix = PAINT_PREFIX[geometryType];
    const layerType = layerTypeFor(geometryType);
    const badKeys = Object.keys(paint).filter(k => !k.startsWith(prefix));
    if (badKeys.length > 0) {
        return {
            ok: false,
            error: `Paint properties [${badKeys.join(', ')}] are not valid for a ${layerType} layer. Use ${prefix}* properties for ${geometryType} geometry.`,
        };
    }

    // 2. Every ["get", col] must reference a real column; auto-correct near-misses.
    const referenced = collectGetColumns([...Object.values(paint), ...Object.values(layout ?? {})]);
    const rename = new Map<string, string>();
    const corrections: string[] = [];
    for (const ref of referenced) {
        const match = matchColumn(ref, columns);
        if (!match.ok) {
            return {
                ok: false,
                error: `Column "${ref}" does not exist in "${table}". Valid columns: ${columns.join(', ')}.`,
            };
        }
        if (match.corrected) {
            rename.set(ref, match.name);
            corrections.push(`"${ref}" → "${match.name}"`);
        }
    }

    const fixedPaint = rewriteGetColumns(paint, rename) as Record<string, unknown>;
    const fixedLayout = layout ? (rewriteGetColumns(layout, rename) as Record<string, unknown>) : undefined;
    return { ok: true, paint: fixedPaint, layout: fixedLayout, corrections };
}
