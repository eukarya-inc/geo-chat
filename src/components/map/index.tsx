import { AsyncPreparedStatement } from '@duckdb/duckdb-wasm';
import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import maplibregl from 'maplibre-gl';
import type { 
    LayerSpecification,
    FillLayerSpecification,
    LineLayerSpecification,
    CircleLayerSpecification,
    SymbolLayerSpecification,
    FillExtrusionLayerSpecification,
    HeatmapLayerSpecification
} from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getTileEnvelope } from '../../utils/tileUtils';
import { MapStyleManager } from '../../utils/mapStyleManager';
import { geojsonToVectorTile } from '../../utils/vectorTileUtils';
import MapStyleEditor from './MapStyleEditor';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface DuckDBConnection {
    query: (sql: string) => Promise<{
        numRows: number;
        toArray: () => Array<{ geojson: string }>;
    }>;
    prepare: (sql: string) => Promise<AsyncPreparedStatement>;
    close: () => Promise<void>;
}

interface ViewState {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
}

// Layer definition for vector tile sources (excludes source and source-layer as they're added dynamically)
export type VectorTileLayer = Omit<
    | FillLayerSpecification
    | LineLayerSpecification
    | CircleLayerSpecification
    | SymbolLayerSpecification
    | FillExtrusionLayerSpecification
    | HeatmapLayerSpecification,
    'source' | 'source-layer'
>;

// Array of layer style definitions for a table
export type TableStyle = VectorTileLayer[];

// Extra style can include any layer types including raster/hillshade
export type ExtraStyle = {
    sources?: Record<string, maplibregl.SourceSpecification>;
    layers?: LayerSpecification[];
};

export interface MapProps {
    dbContext: DBContext;
    schema?: string | null;  // Current schema context
    selectedTable: string | null;  // For backward compatibility and primary table
    tables?: string[];  // New prop for multiple tables: ["schema.table1", "table2", ...]
    selectedColumns: string[];
    geojsonUrl?: string;
    onMapReady?: (styleManager: MapStyleManager) => void;
    onStyleChange?: (styleChanger: (style: maplibregl.StyleSpecification) => void) => void;
    mapStyleManager?: MapStyleManager;
    geometryColumnName?: string;
    onViewStateChange?: (viewState: ViewState) => void;
    initialViewState?: ViewState;
    initialStyle?: maplibregl.StyleSpecification;
    onStyleUpdate?: (style: maplibregl.StyleSpecification) => void;
    tableStyles?: Record<string /*table name*/, TableStyle>;
    extraStyle?: ExtraStyle;
    onTableStyleChanged?: (tableName: string, style: TableStyle) => void;
    onExtraStyleChange?: (style: ExtraStyle) => void;
}

interface QueryParams {
    zxy: {
        z: number;
        x: number;
        y: number;
    };
    selectedTable: string;
    selectedColumns: string[];
    geometryColumnName: string;
    schema?: string | null;
}

const calculateSimplifyTolerance = (zoomLevel: number): number => {
    // ズームレベル15以上は簡略化なし
    if (zoomLevel >= 15) return 0;

    // ズームレベル0から15までの範囲で、0.001から0まで線形に変化
    // ズームレベルが低いほど（広域表示）値が大きくなる
    const maxSimplify = 0.001;
    const minZoom = 0;
    const maxZoom = 15;

    // 線形補間: y = mx + b
    // m = (y2 - y1) / (x2 - x1)
    // ここでは x1=15, y1=0, x2=0, y2=0.001
    const m = (0 - maxSimplify) / (maxZoom - minZoom);
    const b = maxSimplify;

    const simplify = m * zoomLevel + b;

    return Number(simplify.toFixed(6));
};

const generateVectorTileQuery = (params: QueryParams): string => {
    const { zxy, selectedTable, selectedColumns, geometryColumnName } = params;
    const simplify = calculateSimplifyTolerance(zxy.z);
    const geomCol = geometryColumnName || 'geometry';
    
    // Don't use schema-qualified table name - connection already has schema context
    const qualifiedTableName = selectedTable;

    // Build column selection - always convert to JSON for consistent handling
    let finalColumnSelection = '';
    if (selectedColumns.length > 0) {
        finalColumnSelection = selectedColumns.map(col => {
            // Convert all columns to JSON to handle any data type uniformly
            // This ensures LIST<STRUCT>, STRUCT, and other complex types are properly serialized
            // Quote column names to handle special characters
            return `to_json("${col}")::VARCHAR as "${col}"`;
        }).join(', ');
    } else {
        finalColumnSelection = '1 as dummy';
    }

    // Build the column list for the WITH clause - quote column names
    const withColumns = selectedColumns.length > 0 
        ? `"${geomCol}" as geom, ${selectedColumns.map(col => `"${col}"`).join(', ')}`
        : `"${geomCol}" as geom, 1 as dummy`;

    return `
        WITH filtered AS (
            -- 空間フィルタリングを先に実行
            SELECT 
                ${withColumns}
            FROM ${qualifiedTableName}
            WHERE ST_Intersects(
                "${geomCol}",
                ST_MakeEnvelope(?, ?, ?, ?)
            )
        )
        SELECT 
            ST_AsGeoJSON(
                ST_Simplify(geom, ${simplify})
            ) AS geojson,
            ${finalColumnSelection}
        FROM filtered
    `;
};

const MapComponent: React.FC<MapProps> = ({ 
    dbContext,
    schema = null,
    selectedTable,
    tables, 
    selectedColumns, 
    geojsonUrl, 
    onMapReady, 
    onStyleChange, 
    mapStyleManager, 
    geometryColumnName = 'geometry',
    onViewStateChange,
    initialViewState,
    initialStyle,
    onStyleUpdate,
    tableStyles = {},
    extraStyle,
    onTableStyleChanged,
    onExtraStyleChange
}) => {
    const [mapError, setMapError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [showExportControls, setShowExportControls] = useState<boolean>(false);
    const [showStyleEditor, setShowStyleEditor] = useState<boolean>(false);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const styleManagerRef = useRef<MapStyleManager | null>(null);
    const connectionRef = useRef<DuckDBConnection | null>(null);
    const tileCache = useRef<Map<string, Uint8Array>>(new Map());
    const initializedRef = useRef<boolean>(false);
    const selectedTableRef = useRef<string | null>(selectedTable);
    const selectedColumnsRef = useRef<string[]>(selectedColumns);
    const isApplyingCustomStyleRef = useRef<boolean>(false);
    const hasCustomStyleRef = useRef<boolean>(false);
    const customStyleRef = useRef<maplibregl.StyleSpecification | null>(null);
    const initialStyleRef = useRef<maplibregl.StyleSpecification | undefined>(initialStyle);

    // Keep refs updated
    useEffect(() => {
        selectedTableRef.current = selectedTable;
        selectedColumnsRef.current = selectedColumns;
        initialStyleRef.current = initialStyle;
        
        // Clear tile cache when table, columns, or geometry column change to force refresh
        if (selectedTable) {
            tileCache.current.clear();
            
            // Force map to re-render tiles if map is initialized
            if (mapRef.current && initializedRef.current) {
                mapRef.current.triggerRepaint();
                
                // Also try to reload the source to force tile refresh
                const source = mapRef.current.getSource('duckdb-vector');
                if (source && 'reload' in source && typeof source.reload === 'function') {
                    source.reload();
                }
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTable, selectedColumns, geometryColumnName]);

    // Export functions
    const exportMapAsPNG = useCallback(async () => {
        if (!mapRef.current) return;
        
        try {
            // Wait for the map to be idle (all tiles loaded)
            await new Promise<void>((resolve) => {
                if (mapRef.current!.loaded()) {
                    mapRef.current!.once('idle', () => resolve());
                    mapRef.current!.triggerRepaint();
                } else {
                    mapRef.current!.once('load', () => {
                        mapRef.current!.once('idle', () => resolve());
                        mapRef.current!.triggerRepaint();
                    });
                }
            });

            // Get the canvas and create image
            const canvas = mapRef.current.getCanvas();
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
    }, []);

    const exportMapAsSVG = useCallback(() => {
        if (!mapRef.current) return;
        
        // Note: MapLibre doesn't have built-in SVG export
        // This is a simplified approach - for full SVG export, you'd need a more complex solution
        alert('SVG export is not currently supported for maps. Please use PNG export instead.');
    }, []);


    // Define popup inside the component
    const popup = useRef(new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 25,
    }));

    const handleFeatureClick = useCallback((e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features?.[0]) return;

        const feature = e.features[0];
        const geometry = feature.geometry as GeoJSON.Geometry;
        const properties = feature.properties;

        // クリック位置の座標を取得
        const coordinates = e.lngLat;

        // ジオメトリタイプに応じた情報を取得
        let geometryInfo = '';
        if (geometry.type === 'Point') {
            const point = geometry as GeoJSON.Point;
            geometryInfo = `
                <p>緯度: ${point.coordinates[1].toFixed(6)}</p>
                <p>経度: ${point.coordinates[0].toFixed(6)}</p>
            `;
        } else if (geometry.type === 'LineString') {
            const line = geometry as GeoJSON.LineString;
            geometryInfo = `
                <p>クリック位置:</p>
                <p>緯度: ${coordinates.lat.toFixed(6)}</p>
                <p>経度: ${coordinates.lng.toFixed(6)}</p>
                <p>頂点数: ${line.coordinates.length}</p>
            `;
        } else if (geometry.type === 'Polygon') {
            const polygon = geometry as GeoJSON.Polygon;
            const totalVertices = polygon.coordinates.reduce((sum, ring) => sum + ring.length, 0);
            geometryInfo = `
                <p>クリック位置:</p>
                <p>緯度: ${coordinates.lat.toFixed(6)}</p>
                <p>経度: ${coordinates.lng.toFixed(6)}</p>
                <p>リング数: ${polygon.coordinates.length}</p>
                <p>頂点数: ${totalVertices}</p>
            `;
        }

        // 選択されたカラムの情報を取得
        let columnInfo = '';
        if (selectedColumns.length > 0) {
            columnInfo = `
                <div style="margin-top: 10px;">
                    <h4>カラム情報</h4>
                    ${selectedColumns
                        .map(column => {
                            const value = properties?.[column];
                            return `<p>${column}: ${value !== undefined ? value : 'N/A'}</p>`;
                        })
                        .join('')}
                </div>
            `;
        }

        // ポップアップの内容を設定
        const content = `
            <div style="padding: 10px;">
                <h3>${geometry.type} 情報</h3>
                ${geometryInfo}
                ${columnInfo}
            </div>
        `;

        // ポップアップを表示
        popup.current.setLngLat(coordinates).setHTML(content).addTo(mapRef.current!);
    }, [selectedColumns]);

    // Function to zoom map to data bounds
    const fitMapToData = useCallback(async (tableName: string, geomColumn: string) => {
        if (!mapRef.current || !connectionRef.current) return;
        
        try {
            // Don't use schema-qualified table name - connection already has schema context
            const qualifiedTableName = tableName;
            
            // Query the bounds using a robust method that handles mixed geometry types
            const result = await connectionRef.current.query(`
                WITH bounds AS (
                    SELECT 
                        ST_Envelope("${geomColumn}") as envelope
                    FROM ${qualifiedTableName}
                    WHERE "${geomColumn}" IS NOT NULL
                ),
                all_bounds AS (
                    SELECT 
                        MIN(ST_XMin(envelope)) as min_lng,
                        MAX(ST_XMax(envelope)) as max_lng,
                        MIN(ST_YMin(envelope)) as min_lat,
                        MAX(ST_YMax(envelope)) as max_lat
                    FROM bounds
                )
                SELECT * FROM all_bounds
            `);
            
            const bounds = result.toArray()[0] as unknown as { min_lng: number; max_lng: number; min_lat: number; max_lat: number; };
            
            if (bounds && bounds.min_lng !== null && bounds.min_lng !== undefined) {
                mapRef.current.fitBounds([
                    [bounds.min_lng, bounds.min_lat],
                    [bounds.max_lng, bounds.max_lat]
                ], {
                    padding: 50,
                    duration: 1000,
                    maxZoom: 16 // Prevent excessive zoom
                });
            }
        } catch (error) {
            console.error('Error fitting map to data bounds:', error);
        }
    }, []);

    // Re-fit bounds when geometry column changes
    useEffect(() => {
        if (selectedTable && geometryColumnName && mapRef.current && connectionRef.current && initializedRef.current) {
            fitMapToData(selectedTable, geometryColumnName);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geometryColumnName, selectedTable, dbContext]);

    // Helper to generate distinct colors for different tables
    const getTableColor = (index: number) => {
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
    };

    // Get default style layers for a table
    const getDefaultTableStyle = (tableName: string, index: number): TableStyle => {
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
            } as FillLayerSpecification,
            // Polygon outline layer
            {
                id: `duckdb-polygon-outlines-${tableIdSuffix}`,
                type: 'line',
                filter: ['==', '$type', 'Polygon'],
                paint: {
                    'line-color': color,
                    'line-width': 1,
                    'line-opacity': 0.8,
                },
            } as LineLayerSpecification,
            // Line layer
            {
                id: `duckdb-lines-${tableIdSuffix}`,
                type: 'line',
                filter: ['==', '$type', 'LineString'],
                paint: {
                    'line-color': color,
                    'line-width': 3,
                    'line-opacity': 0.9,
                },
            } as LineLayerSpecification,
            // Point layer
            {
                id: `duckdb-points-${tableIdSuffix}`,
                type: 'circle',
                filter: ['==', '$type', 'Point'],
                paint: {
                    'circle-radius': 6,
                    'circle-color': color,
                    'circle-stroke-width': 1,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.8,
                },
            } as CircleLayerSpecification,
        ];
    };

    // Track which tables have been initialized with default styles
    const initializedTablesRef = useRef<Set<string>>(new Set());

    // Function to update map layers dynamically
    const updateMapLayers = useCallback((map: maplibregl.Map) => {
        
        // Always ensure StyleManager has the current map reference before any operations
        if (styleManagerRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (styleManagerRef.current as any).map = map;
        }

        // Remove all existing DuckDB layers and sources
        // First remove layers
        const allLayers = map.getStyle().layers || [];
        allLayers.forEach(layer => {
            if (layer.id.startsWith('duckdb-')) {
                map.removeLayer(layer.id);
            }
        });
        
        // Then remove sources
        const allSources = Object.keys(map.getStyle().sources || {});
        allSources.forEach(sourceId => {
            if (sourceId.startsWith('duckdb-')) {
                map.removeSource(sourceId);
            }
        });
        
        // Clear tile cache
        tileCache.current.clear();
        
        // Also remove old geojson source if it exists
        if (map.getSource('geojson-source')) {
            const geojsonLayers = ['geojson-polygons', 'geojson-lines', 'geojson-points'];
            geojsonLayers.forEach(layerId => {
                if (map.getLayer(layerId)) map.removeLayer(layerId);
            });
            map.removeSource('geojson-source');
        }

        // Determine which tables to add
        let tablesToAdd: string[] = [];
        
        // Use tables prop if provided, otherwise fall back to selectedTable
        if (tables && tables.length > 0) {
            tablesToAdd = tables;
        } else if (selectedTable) {
            // Don't include schema in tableSpec - use table name only
            const tableSpec = selectedTable;
            tablesToAdd = [tableSpec];
        }
        
        // Add layers for each table
        tablesToAdd.forEach((tableSpec, index) => {
            const sourceId = `duckdb-${tableSpec.replace(/\./g, '_')}`;
            
            // Check if this table is being added for the first time
            const isNewTable = !initializedTablesRef.current.has(tableSpec);
            
            // Get or create style for this table
            let tableStyle = tableStyles[tableSpec];
            if (!tableStyle || tableStyle.length === 0) {
                // Generate default style if not provided
                tableStyle = getDefaultTableStyle(tableSpec, index);
                
                // Notify parent about new default style if this is a new table
                if (isNewTable && onTableStyleChanged) {
                    onTableStyleChanged(tableSpec, tableStyle);
                    initializedTablesRef.current.add(tableSpec);
                }
            }
            
            try {
                map.addSource(sourceId, {
                    type: 'vector',
                    tiles: [`duckdb://${tableSpec}/{z}/{x}/{y}.pbf`],
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
                    const layer: LayerSpecification = {
                        ...layerStyle,
                        source: sourceId,
                        'source-layer': 'v',
                        minzoom: layerStyle.minzoom ?? 0,
                        maxzoom: layerStyle.maxzoom ?? 24,
                    } as LayerSpecification;
                    
                    // Ensure the layer has a unique ID
                    if (!layer.id) {
                        console.warn(`Layer for table ${tableSpec} is missing an id, skipping`);
                        return;
                    }
                    
                    map.addLayer(layer);
                } catch (e) {
                    console.error(`Failed to add layer for ${tableSpec}:`, e, layerStyle);
                }
            });
        });
        
        // Update StyleManager with current map instance to fix stale reference
        if (styleManagerRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (styleManagerRef.current as any).map = map;
        }

        // Add event handlers for all DuckDB layers
        tablesToAdd.forEach((tableSpec) => {
            // Get the table style to know which layers exist
            const tableStyle = tableStyles[tableSpec] || getDefaultTableStyle(tableSpec, tablesToAdd.indexOf(tableSpec));
            
            const handleMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
            const handleMouseLeave = () => map.getCanvas().style.cursor = '';
            
            // Add event handlers for each layer defined in the style
            tableStyle.forEach((layerStyle: VectorTileLayer) => {
                if (layerStyle.id) {
                    // Add click handler
                    map.on('click', layerStyle.id, handleFeatureClick);
                    
                    // Add hover handlers
                    map.on('mouseenter', layerStyle.id, handleMouseEnter);
                    map.on('mouseleave', layerStyle.id, handleMouseLeave);
                }
            });
        });

        // Add GeoJSON layers if URL is provided
        if (geojsonUrl) {
            map.addSource('geojson-source', {
                type: 'geojson',
                data: geojsonUrl,
            });

            map.addLayer({
                id: 'geojson-polygons',
                source: 'geojson-source',
                type: 'fill',
                paint: {
                    'fill-color': '#0066cc',
                    'fill-opacity': 0.6,
                    'fill-outline-color': '#0066cc',
                },
                filter: ['==', '$type', 'Polygon'] as ['==', '$type', 'Polygon'],
            });

            map.addLayer({
                id: 'geojson-lines',
                source: 'geojson-source',
                type: 'line',
                paint: {
                    'line-color': '#0066cc',
                    'line-width': 3,
                    'line-opacity': 0.8,
                },
                filter: ['==', '$type', 'LineString'] as ['==', '$type', 'LineString'],
            });

            map.addLayer({
                id: 'geojson-points',
                source: 'geojson-source',
                type: 'circle',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#0066cc',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                },
                filter: ['==', '$type', 'Point'] as ['==', '$type', 'Point'],
            });

            // Add event handlers for GeoJSON layers
            map.on('click', 'geojson-points', handleFeatureClick);
            map.on('click', 'geojson-lines', handleFeatureClick);
            map.on('click', 'geojson-polygons', handleFeatureClick);

            const handleMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
            const handleMouseLeave = () => map.getCanvas().style.cursor = '';

            map.on('mouseenter', 'geojson-points', handleMouseEnter);
            map.on('mouseenter', 'geojson-lines', handleMouseEnter);
            map.on('mouseenter', 'geojson-polygons', handleMouseEnter);

            map.on('mouseleave', 'geojson-points', handleMouseLeave);
            map.on('mouseleave', 'geojson-lines', handleMouseLeave);
            map.on('mouseleave', 'geojson-polygons', handleMouseLeave);
        }
        
        // Apply extra style if provided
        if (extraStyle && map.getStyle()) {
            const currentStyle = map.getStyle();
            mergeStyles(currentStyle, extraStyle);
            
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
            if (onExtraStyleChange && !isApplyingCustomStyleRef.current) {
                onExtraStyleChange(extraStyle);
            }
        }
        
        // Final StyleManager synchronization after all layer operations
        if (styleManagerRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (styleManagerRef.current as any).map = map;
            
            // Force repaint to ensure style is fully updated
            map.triggerRepaint();
            
            // Log final state for debugging
            setTimeout(() => {
                styleManagerRef.current?.getLayerIds();
                styleManagerRef.current?.getDataLayerInfo();
                
            }, 100);
        }
        
        
        // Zoom to data bounds when a new table is selected
        if (selectedTable && connectionRef.current) {
            setTimeout(() => {
                fitMapToData(selectedTable, geometryColumnName);
                
            }, 500); // Wait a bit for tiles to load
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTable, tables, geojsonUrl, handleFeatureClick, geometryColumnName, dbContext, tableStyles, onTableStyleChanged, extraStyle, onExtraStyleChange]);

    // Function to register DuckDB protocol (extracted for reuse)
    const registerDuckDBProtocol = useCallback(() => {
        // Note: MapLibre doesn't provide a way to check if protocol exists, so we'll try to add it
        // If it already exists, it will be overwritten which is fine for our use case
        try {
            maplibregl.addProtocol('duckdb', async params => {
                // Parse URL: duckdb://[schema.]table/{z}/{x}/{y}.pbf
                const url = params.url;
                const match = url.match(/^duckdb:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.pbf$/);
                if (!match) {
                    console.error('Invalid DuckDB URL format:', url);
                    return { data: new Uint8Array() };
                }

                const [, tableSpec, z, x, y] = match;
                const zxy = { z: parseInt(z), x: parseInt(x), y: parseInt(y) };
                
                // Parse schema.table or just table
                let tableName: string;
                const tableParts = tableSpec.split('.');
                if (tableParts.length === 2) {
                    [, tableName] = tableParts;
                } else {
                    tableName = tableSpec;
                }

                const cacheKey = `${tableSpec}/${z}/${x}/${y}`;

                // キャッシュをチェック
                if (tileCache.current.has(cacheKey)) {
                    const cachedData = tileCache.current.get(cacheKey);
                    // Create a fresh copy to avoid ArrayBuffer detachment
                    const freshCopy = cachedData ? new Uint8Array(cachedData.buffer.slice(0)) : new Uint8Array();
                    return { data: freshCopy };
                }

                try {
                    if (!connectionRef.current) {
                        throw new Error('Database connection is not available');
                    }

                    const { minLng, minLat, maxLng, maxLat } = getTileEnvelope(zxy.z, zxy.x, zxy.y);

                    const currentColumns = selectedColumnsRef.current;

                    if (!tableName) {
                        return { data: new Uint8Array() };
                    }


                    // 選択されたカラムを取得するSQLクエリを構築
                    // Don't pass schema - connection already has schema context
                    const query = generateVectorTileQuery({
                        zxy,
                        selectedTable: tableName,
                        selectedColumns: currentColumns,
                        geometryColumnName,
                        schema: null,  // Don't use URL-extracted schema
                    });
                    
                    let stmt;
                    let result;
                    try {
                        stmt = await connectionRef.current.prepare(query);
                        result = await stmt.query(minLng, minLat, maxLng, maxLat);
                    } catch (error) {
                        console.error('Vector tile query error:', error);
                        console.error('Query:', query);
                        console.error('Parameters:', { minLng, minLat, maxLng, maxLat });
                        return { data: new Uint8Array() };
                    }
                    

                    if (result.numRows === 0) {
                        tileCache.current.set(cacheKey, new Uint8Array());
                        return { data: new Uint8Array() };
                    }

                    const rows = result.toArray() as Array<{ geojson: string } & Record<string, string | number | null>>;

                    console.log(`Processing ${rows.length} rows for tile ${cacheKey}`);
                    if (rows.length > 0 && zxy.z > 10) {  // Only log for higher zoom levels
                        console.log('First row:', rows[0]);
                        console.log('Selected columns:', currentColumns);
                    }
                    const features = rows
                        .map((row) => {
                            try {
                                if (!row.geojson) {
                                    return null;
                                }
                                const geometry = JSON.parse(row.geojson) as Geometry;

                                // 選択されたカラムの値をプロパティとして追加
                                const properties: Record<string, unknown> = {};
                                
                                // Add all row properties with intelligent flattening
                                Object.keys(row).forEach(key => {
                                    if (key !== 'geojson') {
                                        const value = row[key];
                                        
                                        // Handle JSON strings
                                        if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
                                            try {
                                                const parsed = JSON.parse(value);
                                                
                                                // If it's the 'properties' column, merge its contents
                                                if (key === 'properties' && typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                                                    Object.assign(properties, parsed);
                                                } 
                                                // If it's an array with at least one element (LIST<STRUCT>)
                                                else if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object') {
                                                    // Store the full array
                                                    properties[key] = parsed;
                                                    
                                                    // Flatten properties, preferring first non-null values
                                                    const allKeys = new Set<string>();
                                                    parsed.forEach((elem: unknown) => {
                                                        if (typeof elem === 'object' && elem !== null) {
                                                            Object.keys(elem as Record<string, unknown>).forEach(k => allKeys.add(k));
                                                        }
                                                    });
                                                    
                                                    // For each unique key, find the first non-null value
                                                    allKeys.forEach(subKey => {
                                                        if (!(subKey in properties)) {
                                                            // Find first non-null value for this key
                                                            for (const elem of parsed) {
                                                                const elemObj = elem as Record<string, unknown>;
                                                                if (elemObj && elemObj[subKey] !== null && elemObj[subKey] !== undefined) {
                                                                    properties[subKey] = elemObj[subKey];
                                                                    break;
                                                                }
                                                            }
                                                            // If all values are null, use the first element's value (null)
                                                            if (!(subKey in properties) && parsed[0]) {
                                                                properties[subKey] = (parsed[0] as Record<string, unknown>)[subKey];
                                                            }
                                                        }
                                                    });
                                                } else {
                                                    // For other columns, store the parsed value
                                                    properties[key] = parsed;
                                                }
                                            } catch {
                                                // If parsing fails, store as is
                                                properties[key] = value;
                                            }
                                        } else if (typeof value === 'string' && value.startsWith('"') && value.endsWith('"')) {
                                            // Handle JSON-encoded strings (remove the quotes)
                                            try {
                                                properties[key] = JSON.parse(value);
                                            } catch {
                                                properties[key] = value;
                                            }
                                        } else if (value !== null && value !== undefined) {
                                            properties[key] = value;
                                        }
                                    }
                                });


                                return {
                                    type: 'Feature' as const,
                                    geometry: geometry,
                                    properties: properties,
                                } as Feature<Geometry, GeoJsonProperties>;
                            } catch (error) {
                                console.error('Failed to parse geometry:', error, 'Row:', row);
                                return null;
                            }
                        })
                        .filter((feature): feature is Feature<Geometry, GeoJsonProperties> => feature !== null);

                    console.log(`Created ${features.length} features for tile ${cacheKey}`);
                    
                    if (features.length === 0) {
                        tileCache.current.set(cacheKey, new Uint8Array());
                        return { data: new Uint8Array() };
                    }

                    const vectorTile = geojsonToVectorTile(features, zxy.z, zxy.x, zxy.y);

                    // Create a safe copy to avoid ArrayBuffer detachment issues
                    const safeVectorTile = new Uint8Array(vectorTile.buffer.slice(0));
                    
                    // Cache a separate copy
                    const cacheData = new Uint8Array(safeVectorTile.buffer.slice(0));
                    tileCache.current.set(cacheKey, cacheData);

                    // Return yet another separate copy to avoid detachment
                    const returnData = new Uint8Array(safeVectorTile.buffer.slice(0));
                    return { data: returnData };
                } catch {
                    return { data: new Uint8Array() };
                }
            });
        } catch {
            // Failed to register protocol
        }
    }, [geometryColumnName]);

    // Function to fix property references in style expressions
    const fixPropertyReferences = useCallback((expr: unknown): unknown => {
        if (!Array.isArray(expr)) return expr;
        
        // Fix nested property access pattern: ["get", "propName", ["get", "properties", ["get", "row"]]]
        // Should be: ["get", "propName"]
        if (expr[0] === 'get' && expr.length === 3 && Array.isArray(expr[2])) {
            const nestedExpr = expr[2];
            if (Array.isArray(nestedExpr) && nestedExpr[0] === 'get' && nestedExpr[1] === 'properties') {
                // This is the pattern we need to fix
                return ['get', expr[1]];
            }
        }
        
        // Fix another incorrect pattern: ["get", "properties", ["get", "propName"]]
        // Should be: ["get", "propName"]
        if (expr[0] === 'get' && expr[1] === 'properties' && expr.length === 3 && Array.isArray(expr[2])) {
            const nestedExpr = expr[2];
            if (Array.isArray(nestedExpr) && nestedExpr[0] === 'get' && typeof nestedExpr[1] === 'string') {
                // Return just the nested get expression
                return nestedExpr;
            }
        }
        
        // Recursively fix nested expressions
        return expr.map(item => fixPropertyReferences(item));
    }, []);

    // Function to fix property references in a style
    const fixStylePropertyReferences = useCallback((style: maplibregl.StyleSpecification): maplibregl.StyleSpecification => {
        const fixedStyle = JSON.parse(JSON.stringify(style)); // Deep clone
        
        // Fix property references in all layers
        if (fixedStyle.layers) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            fixedStyle.layers = fixedStyle.layers.map((layer: any) => {
                const fixedLayer = { ...layer };
                
                // Fix paint properties
                if (fixedLayer.paint) {
                    Object.keys(fixedLayer.paint).forEach(key => {
                        fixedLayer.paint[key] = fixPropertyReferences(fixedLayer.paint[key]);
                    });
                }
                
                // Fix layout properties
                if (fixedLayer.layout) {
                    Object.keys(fixedLayer.layout).forEach(key => {
                        fixedLayer.layout[key] = fixPropertyReferences(fixedLayer.layout[key]);
                    });
                }
                
                // Fix filter
                if (fixedLayer.filter) {
                    fixedLayer.filter = fixPropertyReferences(fixedLayer.filter);
                }
                
                return fixedLayer;
            });
        }
        
        return fixedStyle;
    }, [fixPropertyReferences]);

    // Function to merge styles
    const mergeStyles = useCallback((baseStyle: maplibregl.StyleSpecification, overlayStyle: ExtraStyle | null | undefined): maplibregl.StyleSpecification => {
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
    }, []);

    // Function to handle style changes
    const handleStyleChange = useCallback(async (newStyle: maplibregl.StyleSpecification) => {
        if (!mapRef.current || !initializedRef.current) {
            customStyleRef.current = newStyle;
            hasCustomStyleRef.current = true;
            return;
        }

        try {
            setIsLoading(true);
            isApplyingCustomStyleRef.current = true;
            
            // Check if this is the default style (has osm source and osm-layer)
            const isDefaultStyle = newStyle.sources?.osm && 
                                 newStyle.layers?.some(layer => layer.id === 'osm-layer');
            
            // Fix property references in the style
            const fixedStyle = fixStylePropertyReferences(newStyle);
            
            if (isDefaultStyle) {
                customStyleRef.current = null;
                hasCustomStyleRef.current = false;
            } else {
                customStyleRef.current = fixedStyle;
                hasCustomStyleRef.current = true;
            }
            
            // Apply the fixed style without diff to ensure proper layer reloading
            mapRef.current.setStyle(fixedStyle);
            
            // Notify parent of style update
            if (onStyleUpdate) {
                onStyleUpdate(fixedStyle);
            }
            
            // Wait for style to load, then re-add data layers
            const handleStyleLoad = () => {
                setIsLoading(false);
                isApplyingCustomStyleRef.current = false;
                
                // Update style manager reference
                if (styleManagerRef.current && mapRef.current) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (styleManagerRef.current as any).map = mapRef.current;
                }
                
                // Re-add data layers after style loads
                updateMapLayers(mapRef.current!);
                
                // Remove this event listener
                mapRef.current?.off('styledata', handleStyleLoad);
            };
            
            mapRef.current.on('styledata', handleStyleLoad);
            
        } catch (error) {
            setIsLoading(false);
            isApplyingCustomStyleRef.current = false;
            setMapError(`Failed to apply new style: ${error instanceof Error ? error.message : String(error)}`);
        }
    }, [fixStylePropertyReferences, updateMapLayers, onStyleUpdate]);

    // Expose style change handler
    useEffect(() => {
        if (onStyleChange && initializedRef.current) {
            onStyleChange(handleStyleChange);
        }
    }, [onStyleChange, handleStyleChange]);

    useEffect(() => {
        
        // If map already exists, just update layers and re-register protocol
        if (initializedRef.current && mapRef.current) {
            // Re-register DuckDB protocol to pick up new geometryColumnName
            registerDuckDBProtocol();
            
            updateMapLayers(mapRef.current);
            
            // Update StyleManager and force map to render
            if (styleManagerRef.current) {
                // Ensure StyleManager has the current map reference
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (styleManagerRef.current as any).map = mapRef.current;
                
                mapRef.current.triggerRepaint();
                
                // Check layer detection after a delay to allow tiles to load
                setTimeout(() => {
                }, 1000);
            }
            return;
        }

        // Don't initialize if we're currently applying a custom style
        if (isApplyingCustomStyleRef.current) {
            return;
        }


        // DuckDBの初期化状態を確認
        if (dbContext) {
            setMapError(null);
        } else {
            return;
        }

        // DuckDBの接続を確認
        const initMap = async () => {
            try {
                // 接続を保持
                // Use schema-aware connection
                connectionRef.current = await dbContext.createManagedConnection(schema);
                if (!connectionRef.current) {
                    setMapError('DuckDBへの接続に失敗しました');
                    return;
                }

                // Add vector protocol handler
                registerDuckDBProtocol();

                // マップの初期化 - Only OSM base layer, no DuckDB layers yet
                const defaultStyle = initialStyleRef.current || {
                    version: 8,
                    glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
                    sources: {
                        osm: {
                            type: 'raster',
                            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
                            maxzoom: 19,
                            tileSize: 256,
                            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                        },
                    },
                    layers: [
                        {
                            id: 'osm-layer',
                            source: 'osm',
                            type: 'raster',
                        },
                    ],
                } as maplibregl.StyleSpecification;
                
                // Fix property references in custom styles before using
                const styleToUse = customStyleRef.current 
                    ? fixStylePropertyReferences(customStyleRef.current)
                    : defaultStyle;
                
                const mapInstance = new maplibregl.Map({
                    container: 'map',
                    zoom: initialViewState?.zoom ?? 5, // 初期ズームレベル
                    center: initialViewState?.center ?? [139.7482, 35.6591], // 東京付近の座標
                    bearing: initialViewState?.bearing ?? 0,
                    pitch: initialViewState?.pitch ?? 0,
                    style: styleToUse,
                    antialias: true,
                    // Try to enable preserveDrawingBuffer for export
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    ...(window.location.hostname === 'localhost' && { preserveDrawingBuffer: true } as any)
                });

                mapRef.current = mapInstance; // マップインスタンスを保存


                // マップの読み込み完了時の処理
                mapInstance.on('load', () => {
                    setIsLoading(false);

                    // Initialize style manager and notify parent
                    if (!styleManagerRef.current) {
                        
                        styleManagerRef.current = new MapStyleManager(mapInstance);
                        onMapReady?.(styleManagerRef.current);
                    }

                    // Mark initialization as complete and update layers
                    initializedRef.current = true;
                    updateMapLayers(mapInstance);

                    
                    // Force map to render and potentially load tiles, then check layer detection after a delay
                    if (styleManagerRef.current) {
                        mapInstance.triggerRepaint();
                        
                        // Check layer detection after a delay to allow tiles to load
                        setTimeout(() => {
                        }, 1000);
                    }
                });

                // Track view state changes
                if (onViewStateChange) {
                    const updateViewState = () => {
                        const center = mapInstance.getCenter();
                        const zoom = mapInstance.getZoom();
                        const bearing = mapInstance.getBearing();
                        const pitch = mapInstance.getPitch();
                        
                        onViewStateChange({
                            center: [center.lng, center.lat],
                            zoom,
                            bearing,
                            pitch
                        });
                    };

                    mapInstance.on('moveend', updateViewState);
                    mapInstance.on('zoomend', updateViewState);
                    mapInstance.on('pitchend', updateViewState);
                    mapInstance.on('rotateend', updateViewState);
                }
                
                // Notify about initial extra style
                if (extraStyle && onExtraStyleChange) {
                    onExtraStyleChange(extraStyle);
                }

                // クリーンアップ関数
                return () => {
                    if (mapInstance) {
                        mapInstance.remove();
                    }
                    if (connectionRef.current) {
                        connectionRef.current.close();
                    }
                    styleManagerRef.current = null;
                };
            } catch (error) {
                setMapError(`マップ初期化エラー: ${error instanceof Error ? error.message : String(error)}`);
                setIsLoading(false);
            }
        };

        initMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbContext, geometryColumnName]);
    
    // Update layers when tables or selectedTable changes
    useEffect(() => {
        if (mapRef.current && initializedRef.current) {
            updateMapLayers(mapRef.current);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTable, tables, selectedColumns, geojsonUrl, tableStyles, extraStyle]);
    
    // Separate effect for onMapReady to avoid triggering re-initialization
    useEffect(() => {
        if (onMapReady && styleManagerRef.current && initializedRef.current) {
            onMapReady(styleManagerRef.current);
        }
    }, [onMapReady]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            <div
                id="map"
                style={{
                    width: '100%',
                    height: '100%',
                }}
            ></div>
            
            {/* Map Controls */}
            <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                display: 'flex',
                gap: '8px',
                zIndex: 1000
            }}>
                <button
                    onClick={() => setShowExportControls(!showExportControls)}
                    style={{
                        padding: '8px 12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                >
                    {showExportControls ? '✕ Hide Export' : '📤 Export'}
                </button>
                <button
                    onClick={() => setShowStyleEditor(!showStyleEditor)}
                    style={{
                        padding: '8px 12px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                    }}
                >
                    {showStyleEditor ? '✕ Hide Style Editor' : '🎨 Style Editor'}
                </button>
            </div>

            {/* Export Controls */}
            {showExportControls && (
                <div style={{
                    position: 'absolute',
                    top: '50px',
                    left: '10px',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    padding: '12px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    zIndex: 1000,
                    minWidth: '200px'
                }}>
                    <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', fontWeight: 'bold' }}>
                        Export Map
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <button
                            onClick={exportMapAsPNG}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#17a2b8',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            📄 Export as PNG
                        </button>
                        <button
                            onClick={exportMapAsSVG}
                            style={{
                                padding: '8px 16px',
                                backgroundColor: '#6c757d',
                                color: 'white',
                                border: 'none',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '13px'
                            }}
                        >
                            📄 Export as SVG
                        </button>
                    </div>
                </div>
            )}

            {/* Style Editor */}
            {showStyleEditor && (
                <MapStyleEditor 
                    styleManager={mapStyleManager || styleManagerRef.current} 
                    onStyleChange={handleStyleChange}
                    onClose={() => setShowStyleEditor(false)}
                />
            )}
            {isLoading && (
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        background: 'rgba(255, 255, 255, 0.8)',
                        padding: '10px',
                        borderRadius: '5px',
                    }}
                >
                    マップを読み込み中...
                </div>
            )}
            {mapError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '10px',
                        left: '10px',
                        background: 'rgba(255, 0, 0, 0.7)',
                        color: 'white',
                        padding: '10px',
                        borderRadius: '5px',
                        maxWidth: '80%',
                    }}
                >
                    エラー: {mapError}
                </div>
            )}

        </div>
    );
};

export default React.memo(MapComponent);
