import maplibregl from 'maplibre-gl';
import type { TableStyle, VectorTileLayer, ExtraStyle } from '../types';

/**
 * Helper to generate distinct colors for different tables
 */
export function getTableColor(index: number): string {
    const colors = [
        '#ff6600', // orange
        '#0080ff', // blue
        '#00aa00', // green
        '#ff00ff', // magenta
        '#ffaa00', // yellow
        '#00ffff', // cyan
        '#ff0000', // red
        '#8800ff', // purple
    ];
    return colors[index % colors.length];
}

/**
 * Get default style layers for a table
 */
export function getDefaultTableStyle(tableName: string, index: number): TableStyle {
    const color = getTableColor(index);
    const tableIdSuffix = tableName.replace(/\./g, '_');

    return [
        // Polygon fill layer
        {
            id: `duckdb-polygons-${tableIdSuffix}`,
            type: 'fill',
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'fill-color': color,
                'fill-opacity': 0.3,
            },
        } as VectorTileLayer,
        // Polygon outline layer
        {
            id: `duckdb-outlines-${tableIdSuffix}`,
            type: 'line',
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'line-color': color,
                'line-width': 1,
            },
        } as VectorTileLayer,
        // LineString layer
        {
            id: `duckdb-lines-${tableIdSuffix}`,
            type: 'line',
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': color,
                'line-width': 2,
            },
        } as VectorTileLayer,
        // Point layer
        {
            id: `duckdb-points-${tableIdSuffix}`,
            type: 'circle',
            filter: ['==', '$type', 'Point'],
            paint: {
                'circle-radius': 5,
                'circle-color': color,
                'circle-stroke-color': '#ffffff',
                'circle-stroke-width': 1,
            },
        } as VectorTileLayer,
    ];
}

/**
 * Merge base style with overlay style
 */
export function mergeStyles(
    baseStyle: maplibregl.StyleSpecification,
    overlayStyle: ExtraStyle | null | undefined
): maplibregl.StyleSpecification {
    const merged = JSON.parse(JSON.stringify(baseStyle)); // Deep clone

    if (!overlayStyle) return merged;

    // Merge sources
    if (overlayStyle.sources) {
        merged.sources = { ...merged.sources, ...overlayStyle.sources };
    }

    // Merge layers
    if (overlayStyle.layers) {
        merged.layers = [...(merged.layers || []), ...overlayStyle.layers];
    }

    return merged;
}

/**
 * Export map as PNG
 */
export async function exportMapAsPNG(map: maplibregl.Map): Promise<void> {
    try {
        // Wait for the map to be idle (all tiles loaded)
        await new Promise<void>(resolve => {
            if (map.loaded()) {
                map.once('idle', () => resolve());
                map.triggerRepaint();
            } else {
                map.once('load', () => {
                    map.once('idle', () => resolve());
                    map.triggerRepaint();
                });
            }
        });

        // Get the canvas and create image
        const canvas = map.getCanvas();
        const dataURL = canvas.toDataURL('image/png', 1.0);

        // Check if we got a valid image (not just black)
        if (dataURL === 'data:,' || dataURL.length < 100) {
            throw new Error('Canvas appears to be empty');
        }

        // Create download link
        const link = document.createElement('a');
        link.download = `map-export-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
        link.href = dataURL;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch {
        alert('Export failed. This might be due to browser security restrictions with WebGL canvas export.');
    }
}

/**
 * Generate popup content for a map feature
 */
export function generatePopupContent(feature: maplibregl.MapGeoJSONFeature, coordinates: maplibregl.LngLat): string {
    const geometry = feature.geometry as GeoJSON.Geometry;
    const properties = feature.properties;

    // Get geometry type info
    let geometryInfo = '';
    if (geometry.type === 'Point') {
        const point = geometry as GeoJSON.Point;
        geometryInfo = `
            <div style="margin: 5px 0;">
                <strong>位置:</strong> [${point.coordinates[0].toFixed(6)}, ${point.coordinates[1].toFixed(6)}]
            </div>
        `;
    } else if (geometry.type === 'LineString') {
        const line = geometry as GeoJSON.LineString;
        geometryInfo = `
            <div style="margin: 5px 0;">
                <strong>頂点数:</strong> ${line.coordinates.length}
            </div>
        `;
    } else if (geometry.type === 'Polygon') {
        const polygon = geometry as GeoJSON.Polygon;
        const exteriorRing = polygon.coordinates[0];
        const holes = polygon.coordinates.slice(1);
        geometryInfo = `
            <div style="margin: 5px 0;">
                <strong>外周頂点数:</strong> ${exteriorRing.length - 1}
                ${holes.length > 0 ? `<br><strong>穴の数:</strong> ${holes.length}` : ''}
            </div>
        `;
    } else if (geometry.type === 'MultiPolygon') {
        const multiPolygon = geometry as GeoJSON.MultiPolygon;
        geometryInfo = `
            <div style="margin: 5px 0;">
                <strong>ポリゴン数:</strong> ${multiPolygon.coordinates.length}
            </div>
        `;
    }

    // Format properties
    const propsHtml =
        properties && Object.keys(properties).length > 0
            ? Object.entries(properties)
                  .map(([key, value]) => {
                      const displayValue = typeof value === 'object' ? JSON.stringify(value, null, 2) : value;
                      return `
                    <div style="margin: 5px 0; ${typeof value === 'object' ? 'max-height: 200px; overflow-y: auto;' : ''}">
                        <strong>${key}:</strong>
                        ${
                            typeof value === 'object'
                                ? `<pre style="margin: 2px 0; font-size: 11px; background: #f0f0f0; padding: 4px; border-radius: 2px;">${displayValue}</pre>`
                                : ` ${displayValue}`
                        }
                    </div>
                `;
                  })
                  .join('')
            : '<div style="margin: 5px 0; color: #666;">（プロパティなし）</div>';

    return `
        <div style="font-size: 14px; max-height: 400px; overflow-y: auto;">
            <div style="border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 5px;">
                <strong style="color: #0066cc;">ジオメトリタイプ:</strong> ${geometry.type}
            </div>
            ${geometryInfo}
            <div style="border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 5px;">
                <strong style="color: #0066cc;">クリック位置:</strong> [${coordinates.lng.toFixed(6)}, ${coordinates.lat.toFixed(6)}]
            </div>
            <div style="border-bottom: 1px solid #ddd; padding-bottom: 5px; margin-bottom: 5px;">
                <strong style="color: #0066cc;">プロパティ:</strong>
            </div>
            ${propsHtml}
        </div>
    `;
}

/**
 * Create default map style
 */
export function createDefaultStyle(): maplibregl.StyleSpecification {
    return {
        version: 8,
        sources: {
            osm: {
                type: 'raster',
                tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                tileSize: 256,
                attribution: '&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
            },
        },
        layers: [
            {
                id: 'osm-layer',
                source: 'osm',
                type: 'raster',
            },
        ],
    };
}
