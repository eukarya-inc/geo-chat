import maplibregl from 'maplibre-gl';
import type { TableStyle, VectorTileLayer, ExtraStyle } from '../types';
import { getDefaultTableStyle } from './mapHelpers';
import type { MapStyleManager } from '../mapStyleManager';
import { createDuckDBUrl } from '../../../utils/schema';

/**
 * Remove all DuckDB sources and their layers from the map
 */
export function removeAllDuckDBLayers(map: maplibregl.Map): void {
    const currentStyle = map.getStyle();
    if (!currentStyle) {
        // Style not loaded yet, skip cleanup
        return;
    }
    const allLayers = currentStyle.layers || [];
    const allSources = currentStyle.sources || {};

    // Remove all layers that use duckdb sources
    allLayers.forEach(layer => {
        if ('source' in layer && layer.source && layer.source.startsWith('duckdb-')) {
            if (map.getLayer(layer.id)) {
                map.removeLayer(layer.id);
            }
        }
    });

    // Remove all duckdb sources
    Object.keys(allSources).forEach(sourceId => {
        if (sourceId.startsWith('duckdb-')) {
            if (map.getSource(sourceId)) {
                map.removeSource(sourceId);
            }
        }
    });
}

/**
 * Remove old GeoJSON source if it exists
 */
export function removeGeoJSONSource(map: maplibregl.Map): void {
    if (map.getSource('geojson-source')) {
        const geojsonLayers = ['geojson-polygons', 'geojson-lines', 'geojson-points'];
        geojsonLayers.forEach(layerId => {
            if (map.getLayer(layerId)) map.removeLayer(layerId);
        });
        map.removeSource('geojson-source');
    }
}

/**
 * Add source and layers for a table
 */
export function addTableLayers(
    map: maplibregl.Map,
    tableSpec: string,
    tableStyle: TableStyle,
    sourceId: string,
    chatId: string | null = null
): void {
    // Check if source already exists, if so remove it first
    if (map.getSource(sourceId)) {
        // Remove all layers using this source
        const currentStyle = map.getStyle();
        if (!currentStyle) {
            // Style not loaded yet, skip cleanup
            return;
        }
        const allLayers = currentStyle.layers || [];
        allLayers.forEach(layer => {
            if ('source' in layer && layer.source === sourceId) {
                if (map.getLayer(layer.id)) {
                    map.removeLayer(layer.id);
                }
            }
        });
        // Remove the source
        map.removeSource(sourceId);
    }

    // Add the source
    try {
        // Include chatId in tile URL if provided
        const baseUrl = createDuckDBUrl(tableSpec, chatId);
        const tileUrl = `${baseUrl}/{z}/{x}/{y}.pbf`;
        map.addSource(sourceId, {
            type: 'vector',
            tiles: [tileUrl],
            minzoom: 0,
            maxzoom: 24,
        });
    } catch (e) {
        console.error(`Failed to add source for ${tableSpec}:`, e);
        return;
    }

    // Add all layers defined in the tableStyle array
    tableStyle.forEach((layerStyle: VectorTileLayer) => {
        try {
            // Create a complete layer definition
            const layer: maplibregl.LayerSpecification = {
                ...layerStyle,
                source: sourceId,
                'source-layer': 'default',
                minzoom: layerStyle.minzoom ?? 0,
                maxzoom: layerStyle.maxzoom ?? 24,
            } as maplibregl.LayerSpecification;

            // Ensure the layer has a unique ID
            if (!layer.id) {
                console.warn(`Layer for table ${tableSpec} is missing an id, skipping`);
                return;
            }

            // Remove existing layer with the same ID if it exists
            if (map.getLayer(layer.id)) {
                map.removeLayer(layer.id);
            }

            map.addLayer(layer);
        } catch (e) {
            console.error(`Failed to add layer for ${tableSpec}:`, e, layerStyle);
        }
    });
}

/**
 * Apply extra style to the map
 */
export function applyExtraStyle(
    map: maplibregl.Map,
    extraStyle: ExtraStyle,
    isApplyingCustomStyle: boolean,
    onExtraStyleChange?: (style: ExtraStyle) => void
): void {
    if (!extraStyle || !map.getStyle()) return;

    // Add extra sources if provided
    if (extraStyle.sources) {
        Object.entries(extraStyle.sources).forEach(([sourceId, sourceSpec]) => {
            if (!map.getSource(sourceId)) {
                try {
                    map.addSource(sourceId, sourceSpec);
                } catch (e) {
                    console.warn(`Failed to add extra source ${sourceId}:`, e);
                }
            }
        });
    }

    // Add extra layers if provided
    if (extraStyle.layers) {
        extraStyle.layers.forEach(layer => {
            // Check if layer already exists
            if (!map.getLayer(layer.id)) {
                try {
                    map.addLayer(layer);
                } catch (e) {
                    console.warn(`Failed to add extra layer ${layer.id}:`, e);
                }
            }
        });
    }

    // Notify parent if extra style was applied
    if (onExtraStyleChange && !isApplyingCustomStyle) {
        onExtraStyleChange(extraStyle);
    }
}

/**
 * Update all map layers based on tables and styles
 */
export function updateMapLayers(params: {
    map: maplibregl.Map;
    tables: string[];
    selectedTable: string | null;
    tableStyles: Record<string, TableStyle>;
    extraStyle?: ExtraStyle;
    isApplyingCustomStyle: boolean;
    onTableStyleChanged?: (tableName: string, style: TableStyle) => void;
    onExtraStyleChange?: (style: ExtraStyle) => void;
    initializedTables: Set<string>;
    styleManager?: MapStyleManager | null;
    chatId?: string | null;
}): void {
    const {
        map,
        tables,
        selectedTable,
        tableStyles,
        extraStyle,
        isApplyingCustomStyle,
        onTableStyleChanged,
        onExtraStyleChange,
        initializedTables,
        styleManager,
        chatId,
    } = params;

    // Always ensure StyleManager has the current map reference before any operations
    if (styleManager) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (styleManager as any).map = map;
    }

    // Remove all existing DuckDB layers and sources
    removeAllDuckDBLayers(map);

    // Remove old GeoJSON source if it exists
    removeGeoJSONSource(map);

    // Determine which tables to add
    let tablesToAdd: string[] = [];

    // Use tables prop if provided, otherwise fall back to selectedTable
    if (tables && tables.length > 0) {
        tablesToAdd = tables;
    } else if (selectedTable) {
        tablesToAdd = [selectedTable];
    }

    // Add layers for each table
    tablesToAdd.forEach((tableSpec, index) => {
        const sourceId = `duckdb-${tableSpec.replace(/\./g, '_')}`;

        // Check if this table is being added for the first time
        const isNewTable = !initializedTables.has(tableSpec);

        // Get or create style for this table
        let tableStyle = tableStyles[tableSpec];
        if (!tableStyle || tableStyle.length === 0) {
            // Generate default style if not provided
            tableStyle = getDefaultTableStyle(tableSpec, index);

            // Notify parent about new default style if this is a new table
            if (isNewTable && onTableStyleChanged) {
                onTableStyleChanged(tableSpec, tableStyle);
                initializedTables.add(tableSpec);
            }
        }

        addTableLayers(map, tableSpec, tableStyle, sourceId, chatId);
    });

    // Apply extra style if provided
    if (extraStyle) {
        applyExtraStyle(map, extraStyle, isApplyingCustomStyle, onExtraStyleChange);
    }

    // Final StyleManager synchronization after all layer operations
    if (styleManager) {
        styleManager.map = map;
        map.triggerRepaint();
    }
}
