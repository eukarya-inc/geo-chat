import type { CircleLayerSpecification, FillLayerSpecification, LineLayerSpecification } from 'maplibre-gl';

/** The three geometry families we style. */
export type GeometryKind = 'point' | 'line' | 'polygon';

/**
 * Minimal declarative map style for one table. This is the spec AI tools write
 * in Phase 4: a geometry kind plus MapLibre `paint`/`layout` property bags. The
 * source and layer wiring are added at render time.
 */
export interface TableMapStyle {
    geometryType: GeometryKind;
    paint: Record<string, unknown>;
    layout?: Record<string, unknown>;
}

/** A sensible fallback style per geometry kind. */
export function defaultMapStyle(kind: GeometryKind): TableMapStyle {
    switch (kind) {
        case 'polygon':
            return {
                geometryType: 'polygon',
                paint: {
                    'fill-color': '#3b82f6',
                    'fill-opacity': 0.35,
                    'fill-outline-color': '#1d4ed8',
                },
            };
        case 'line':
            return {
                geometryType: 'line',
                paint: { 'line-color': '#2563eb', 'line-width': 2 },
            };
        case 'point':
        default:
            return {
                geometryType: 'point',
                paint: {
                    'circle-radius': 4,
                    'circle-color': '#2563eb',
                    'circle-stroke-color': '#ffffff',
                    'circle-stroke-width': 1,
                },
            };
    }
}

/** MapLibre layer `type` for a geometry kind. */
export function layerTypeFor(kind: GeometryKind): 'fill' | 'line' | 'circle' {
    if (kind === 'polygon') return 'fill';
    if (kind === 'line') return 'line';
    return 'circle';
}

/** Builds a complete MapLibre vector layer spec from a declarative table style. */
export function buildLayer(
    layerId: string,
    sourceId: string,
    style: TableMapStyle
): FillLayerSpecification | LineLayerSpecification | CircleLayerSpecification {
    const base = {
        id: layerId,
        source: sourceId,
        'source-layer': 'default',
        ...(style.layout ? { layout: style.layout } : {}),
        paint: style.paint,
    };
    return { ...base, type: layerTypeFor(style.geometryType) } as
        | FillLayerSpecification
        | LineLayerSpecification
        | CircleLayerSpecification;
}
