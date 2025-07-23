import maplibregl from 'maplibre-gl';
import { validateAndFixStyleExpression, logStyleExpressionIssues } from './styleExpressionValidator';

export interface MapStyleUpdate {
    type: 'layer-paint' | 'layer-layout' | 'layer-filter' | 'add-layer' | 'remove-layer' | 'add-source' | 'remove-source';
    layerId?: string;
    sourceId?: string;
    properties?: Record<string, unknown>;
    layer?: maplibregl.LayerSpecification;
    source?: maplibregl.SourceSpecification;
    filter?: unknown[];
}

export class MapStyleManager {
    private map: maplibregl.Map;

    constructor(map: maplibregl.Map) {
        this.map = map;
    }

    getMapInstance(): maplibregl.Map {
        return this.map;
    }

    applyStyleUpdate(update: MapStyleUpdate): boolean {
        if (!this.map?.loaded() || !this.map?.isStyleLoaded()) {
            // Map or style not fully loaded, attempting anyway
        }
        
        try {
            switch (update.type) {
                case 'layer-paint':
                    if (update.layerId && update.properties) {
                        // Check if layer exists
                        const layer = this.map.getLayer(update.layerId);
                        
                        if (!layer) {
                            throw new Error(`Cannot style non-existing layer "${update.layerId}".`);
                        }
                        
                        Object.entries(update.properties).forEach(([key, value]) => {
                            // Validate and fix style expressions before applying
                            let finalValue = value;
                            if (Array.isArray(value)) {
                                logStyleExpressionIssues(value, `${update.layerId}.paint.${key}`);
                                finalValue = validateAndFixStyleExpression(value);
                            }
                            this.map.setPaintProperty(update.layerId!, key, finalValue);
                        });
                    }
                    break;

                case 'layer-layout':
                    if (update.layerId && update.properties) {
                        // Check if layer exists
                        const layer = this.map.getLayer(update.layerId);
                        
                        if (!layer) {
                            throw new Error(`Cannot style non-existing layer "${update.layerId}".`);
                        }
                        Object.entries(update.properties).forEach(([key, value]) => {
                            // Validate and fix style expressions before applying
                            let finalValue = value;
                            if (Array.isArray(value)) {
                                logStyleExpressionIssues(value, `${update.layerId}.layout.${key}`);
                                finalValue = validateAndFixStyleExpression(value);
                            }
                            this.map.setLayoutProperty(update.layerId!, key, finalValue);
                        });
                    }
                    break;

                case 'layer-filter':
                    if (update.layerId && update.filter) {
                        // Check if layer exists
                        const layer = this.map.getLayer(update.layerId);
                        
                        if (!layer) {
                            throw new Error(`Cannot style non-existing layer "${update.layerId}".`);
                        }
                        this.map.setFilter(update.layerId, update.filter as maplibregl.FilterSpecification);
                    }
                    break;

                case 'add-layer':
                    if (update.layer) {
                        this.map.addLayer(update.layer);
                    }
                    break;

                case 'remove-layer':
                    if (update.layerId && this.map.getLayer(update.layerId)) {
                        this.map.removeLayer(update.layerId);
                    }
                    break;

                case 'add-source':
                    if (update.sourceId && update.source) {
                        this.map.addSource(update.sourceId, update.source);
                    }
                    break;

                case 'remove-source':
                    if (update.sourceId && this.map.getSource(update.sourceId)) {
                        this.map.removeSource(update.sourceId);
                    }
                    break;

                default:
                    return false;
            }
            return true;
        } catch {
            return false;
        }
    }

    getCurrentStyle(): maplibregl.StyleSpecification {
        return this.map.getStyle();
    }

    getLayerIds(): string[] {
        try {
            const style = this.map.getStyle();
            
            if (!style?.layers) {
                return [];
            }
            
            const layerIds = style.layers.map(layer => layer.id);
            return layerIds;
        } catch {
            return [];
        }
    }

    getSourceIds(): string[] {
        return Object.keys(this.map.getStyle().sources || {});
    }

    getLayerPaint(layerId: string): Record<string, unknown> | null {
        const layer = this.map.getLayer(layerId);
        return layer ? (layer as { paint?: Record<string, unknown> }).paint || {} : null;
    }

    getLayerLayout(layerId: string): Record<string, unknown> | null {
        const layer = this.map.getLayer(layerId);
        return layer ? (layer as { layout?: Record<string, unknown> }).layout || {} : null;
    }

    findLayersByType(geometryType: 'polygon' | 'line' | 'point'): string[] {
        const layers = this.getLayerIds();
        const patterns = {
            polygon: ['polygon', 'fill'],
            line: ['line'],
            point: ['point', 'circle']
        };
        
        return layers.filter(layerId => {
            const layer = this.map.getLayer(layerId);
            if (!layer) return false;
            
            const layerType = (layer as { type: string }).type;
            return patterns[geometryType].includes(layerType) || 
                   patterns[geometryType].some(pattern => layerId.includes(pattern));
        });
    }

    getDataLayerInfo(): { duckdb: string[], geojson: string[] } {
        const layers = this.getLayerIds();
        const result = {
            duckdb: layers.filter(id => id.startsWith('duckdb-')),
            geojson: layers.filter(id => id.startsWith('geojson-'))
        };
        return result;
    }

    async getDataLayerInfoWithRetry(maxRetries: number = 10, delayMs: number = 200): Promise<{ duckdb: string[], geojson: string[] }> {
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            // Force a fresh check of the map style
            if (this.map?.triggerRepaint) {
                this.map.triggerRepaint();
            }
            
            const layerInfo = this.getDataLayerInfo();
            const totalDataLayers = layerInfo.duckdb.length + layerInfo.geojson.length;
            
            if (totalDataLayers > 0) {
                return layerInfo;
            }
            
            if (attempt < maxRetries - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
                // Increase delay for next attempt
                delayMs = Math.min(delayMs * 1.5, 1000);
            }
        }
        
        return this.getDataLayerInfo();
    }

    findBestLayerMatch(intent: string): string | null {
        const lowerIntent = intent.toLowerCase();
        
        // Check for direct geometry type mentions
        if (lowerIntent.includes('polygon') || lowerIntent.includes('fill')) {
            const polygonLayers = this.findLayersByType('polygon');
            return polygonLayers[0] || null;
        }
        
        if (lowerIntent.includes('line')) {
            const lineLayers = this.findLayersByType('line');
            return lineLayers[0] || null;
        }
        
        if (lowerIntent.includes('point') || lowerIntent.includes('circle')) {
            const pointLayers = this.findLayersByType('point');
            return pointLayers[0] || null;
        }
        
        // Return the first data layer if no specific type mentioned
        const dataLayers = [...this.getDataLayerInfo().duckdb, ...this.getDataLayerInfo().geojson];
        return dataLayers[0] || null;
    }
}

export const parseStyleCommand = (command: string): MapStyleUpdate | null => {
    const cmd = command.toLowerCase().trim();

    // Change color commands
    if (cmd.includes('change') && cmd.includes('color')) {
        const colorMatch = cmd.match(/#[0-9a-f]{6}|#[0-9a-f]{3}|rgb\([^)]+\)|rgba\([^)]+\)|[a-z]+/i);
        const color = colorMatch ? colorMatch[0] : null;

        if (cmd.includes('polygon') || cmd.includes('fill')) {
            return {
                type: 'layer-paint',
                layerId: cmd.includes('geojson') ? 'geojson-polygons' : 'duckdb-polygons',
                properties: {
                    'fill-color': color || '#ff6600'
                }
            };
        }

        if (cmd.includes('line')) {
            return {
                type: 'layer-paint',
                layerId: cmd.includes('geojson') ? 'geojson-lines' : 'duckdb-lines',
                properties: {
                    'line-color': color || '#ff6600'
                }
            };
        }

        if (cmd.includes('point') || cmd.includes('circle')) {
            return {
                type: 'layer-paint',
                layerId: cmd.includes('geojson') ? 'geojson-points' : 'duckdb-points',
                properties: {
                    'circle-color': color || '#ff0000'
                }
            };
        }
    }

    // Change opacity commands
    if (cmd.includes('opacity')) {
        const opacityMatch = cmd.match(/\b(0?\.\d+|1\.0|1|0)\b/);
        const opacity = opacityMatch ? parseFloat(opacityMatch[0]) : null;

        if (cmd.includes('polygon') || cmd.includes('fill')) {
            return {
                type: 'layer-paint',
                layerId: cmd.includes('geojson') ? 'geojson-polygons' : 'duckdb-polygons',
                properties: {
                    'fill-opacity': opacity !== null ? opacity : 0.5
                }
            };
        }

        if (cmd.includes('line')) {
            return {
                type: 'layer-paint',
                layerId: cmd.includes('geojson') ? 'geojson-lines' : 'duckdb-lines',
                properties: {
                    'line-opacity': opacity !== null ? opacity : 0.8
                }
            };
        }
    }

    // Hide/show layer commands
    if (cmd.includes('hide') || cmd.includes('show')) {
        const visibility = cmd.includes('hide') ? 'none' : 'visible';
        
        if (cmd.includes('polygon')) {
            return {
                type: 'layer-layout',
                layerId: cmd.includes('geojson') ? 'geojson-polygons' : 'duckdb-polygons',
                properties: {
                    'visibility': visibility
                }
            };
        }

        if (cmd.includes('line')) {
            return {
                type: 'layer-layout',
                layerId: cmd.includes('geojson') ? 'geojson-lines' : 'duckdb-lines',
                properties: {
                    'visibility': visibility
                }
            };
        }

        if (cmd.includes('point')) {
            return {
                type: 'layer-layout',
                layerId: cmd.includes('geojson') ? 'geojson-points' : 'duckdb-points',
                properties: {
                    'visibility': visibility
                }
            };
        }
    }

    return null;
};
