import { AsyncDuckDB, AsyncPreparedStatement } from '@duckdb/duckdb-wasm';
import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useEffect, useRef, useState } from 'react';
import { getTileEnvelope, getZxyFromUrl } from '../utils/tileUtils';
import { MapStyleManager } from '../utils/mapStyleManager';
import { geojsonToVectorTile } from '../utils/vectorTileUtils';

interface DuckDBConnection {
    query: (sql: string) => Promise<{
        numRows: number;
        toArray: () => Array<{ geojson: string }>;
    }>;
    prepare: (sql: string) => Promise<AsyncPreparedStatement>;
    close: () => Promise<void>;
}

interface MapProps {
    db: AsyncDuckDB;
    selectedTable: string | null;
    selectedColumns: string[];
    geojsonUrl?: string;
    onMapReady?: (styleManager: MapStyleManager) => void;
}

interface QueryParams {
    zxy: {
        z: number;
        x: number;
        y: number;
    };
    selectedTable: string;
    selectedColumns: string[];
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
    const { zxy, selectedTable, selectedColumns } = params;
    const columns = selectedColumns.length > 0 ? selectedColumns.join(', ') : '1 as dummy';
    const simplify = calculateSimplifyTolerance(zxy.z);

    console.log(`z: ${zxy.z}, simplify level: ${simplify}`);

    return `
        WITH filtered AS (
            -- 空間フィルタリングを先に実行
            SELECT 
                geom,
                ${columns}
            FROM ${selectedTable}
            WHERE ST_Intersects(
                geom,
                -- bbox,
                ST_MakeEnvelope(?, ?, ?, ?)
            )
        )
        SELECT 
            ST_AsGeoJSON(
                ST_Simplify(geom, ${simplify})
            ) AS geojson,
            ${columns}
        FROM filtered
    `;
};

const MapComponent: React.FC<MapProps> = ({ db, selectedTable, selectedColumns, geojsonUrl, onMapReady }) => {
    const [mapError, setMapError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [selectedZoom, setSelectedZoom] = useState<number>(5); // デフォルトズームレベル
    const mapRef = useRef<maplibregl.Map | null>(null);
    const styleManagerRef = useRef<MapStyleManager | null>(null);
    const connectionRef = useRef<DuckDBConnection | null>(null);
    const tileCache = useRef<Map<string, Uint8Array>>(new Map());
    const initializedRef = useRef<boolean>(false);
    const selectedTableRef = useRef<string | null>(selectedTable);
    const selectedColumnsRef = useRef<string[]>(selectedColumns);

    // Keep refs updated
    useEffect(() => {
        selectedTableRef.current = selectedTable;
        selectedColumnsRef.current = selectedColumns;
    }, [selectedTable, selectedColumns]);

    // ズームレベル変更ハンドラー
    const handleZoomChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
        const newZoom = parseInt(event.target.value, 10);
        setSelectedZoom(newZoom);
    };

    // Define popup and handlers outside so they can be reused
    const popup = new maplibregl.Popup({
        closeButton: true,
        closeOnClick: true,
        offset: 25,
    });

    const handleFeatureClick = (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
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
        popup.setLngLat(coordinates).setHTML(content).addTo(mapRef.current!);
    };

    // Function to update map layers dynamically
    const updateMapLayers = (map: maplibregl.Map) => {
        console.log('Map: Updating layers - selectedTable:', selectedTable, 'geojsonUrl:', geojsonUrl);
        
        // Always ensure StyleManager has the current map reference before any operations
        if (styleManagerRef.current) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (styleManagerRef.current as any).map = map;
        }

        // Remove existing data layers
        const existingLayers = ['duckdb-polygons', 'duckdb-polygon-outlines', 'duckdb-lines', 'duckdb-points', 'geojson-polygons', 'geojson-lines', 'geojson-points'];
        existingLayers.forEach(layerId => {
            if (map.getLayer(layerId)) {
                map.removeLayer(layerId);
            }
        });

        // Remove existing data sources
        if (map.getSource('duckdb-vector')) {
            map.removeSource('duckdb-vector');
            // Clear tile cache when removing source to prevent ArrayBuffer issues
            tileCache.current.clear();
        }
        if (map.getSource('geojson-source')) {
            map.removeSource('geojson-source');
        }

        // Add DuckDB layers if table is selected
        if (selectedTable) {
            try {
                map.addSource('duckdb-vector', {
                    type: 'vector',
                    tiles: ['duckdb-vector://{z}/{x}/{y}.pbf'],
                    minzoom: 0,
                    maxzoom: 24,
                });
            } catch (error) {
                console.error('Map: Error adding DuckDB vector source:', error);
                return;
            }

            // Add polygon fill layer
            map.addLayer({
                id: 'duckdb-polygons',
                source: 'duckdb-vector',
                'source-layer': 'v',
                type: 'fill',
                paint: {
                    'fill-color': '#ff6600',
                    'fill-opacity': 0.3,
                },
                filter: ['==', '$type', 'Polygon'] as ['==', '$type', 'Polygon'],
                minzoom: 0,
                maxzoom: 24,
            });

            // Add polygon outline layer for better visibility
            map.addLayer({
                id: 'duckdb-polygon-outlines',
                source: 'duckdb-vector',
                'source-layer': 'v',
                type: 'line',
                paint: {
                    'line-color': '#ff6600',
                    'line-width': 1,
                    'line-opacity': 0.8,
                },
                filter: ['==', '$type', 'Polygon'] as ['==', '$type', 'Polygon'],
                minzoom: 0,
                maxzoom: 24,
            });

            // Add line layer with distinct color
            map.addLayer({
                id: 'duckdb-lines',
                source: 'duckdb-vector',
                'source-layer': 'v',
                type: 'line',
                paint: {
                    'line-color': '#00aa00',
                    'line-width': 3,
                    'line-opacity': 0.9,
                },
                filter: ['==', '$type', 'LineString'] as ['==', '$type', 'LineString'],
                minzoom: 0,
                maxzoom: 24,
            });

            // Add point layer with distinct color and larger size
            map.addLayer({
                id: 'duckdb-points',
                source: 'duckdb-vector',
                'source-layer': 'v',
                type: 'circle',
                paint: {
                    'circle-radius': 8,
                    'circle-color': '#0066ff',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff',
                    'circle-opacity': 0.9,
                },
                filter: ['==', '$type', 'Point'] as ['==', '$type', 'Point'],
                minzoom: 0,
                maxzoom: 24,
            });

            // Update global debug info
            const currentLayers = map.getStyle().layers?.map(l => l.id) || [];
            const duckdbLayers = currentLayers.filter(id => id.startsWith('duckdb-'));
            
            // Update StyleManager with current map instance to fix stale reference
            if (styleManagerRef.current) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (styleManagerRef.current as any).map = map;
            }
            
            // Store layer info globally for debugging
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).debugMapLayers = {
                allLayers: currentLayers,
                duckdbLayers: duckdbLayers,
                styleManager: styleManagerRef.current,
                mapInstance: map
            };
            console.log('Map: Debug info stored in window.debugMapLayers');
            
            // Add manual debug functions
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).testLayerDetection = () => {
                console.log('=== Manual Layer Detection Test ===');
                console.log('Map instance:', map);
                console.log('Map loaded:', map.loaded());
                console.log('Style loaded:', map.isStyleLoaded());
                console.log('Current selectedTable:', selectedTable);
                
                const style = map.getStyle();
                console.log('Style:', style);
                console.log('Style layers:', style?.layers);
                
                if (style?.layers) {
                    console.log('All layer IDs:', style.layers.map(l => l.id));
                    console.log('DuckDB layers:', style.layers.filter(l => l.id.startsWith('duckdb-')).map(l => l.id));
                }
                
                console.log('StyleManager instance:', styleManagerRef.current);
                if (styleManagerRef.current) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    console.log('StyleManager map:', (styleManagerRef.current as any).map);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    console.log('StyleManager === Map:', (styleManagerRef.current as any).map === map);
                    console.log('StyleManager getLayerIds():', styleManagerRef.current.getLayerIds());
                    console.log('StyleManager getDataLayerInfo():', styleManagerRef.current.getDataLayerInfo());
                }
                
                return {
                    selectedTable: selectedTable,
                    mapLayers: style?.layers?.map(l => l.id) || [],
                    styleManagerLayers: styleManagerRef.current?.getLayerIds() || [],
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    mapsAreSame: (styleManagerRef.current as any).map === map
                };
            };

            // Add event handlers for DuckDB layers
            map.on('click', 'duckdb-points', handleFeatureClick);
            map.on('click', 'duckdb-lines', handleFeatureClick);
            map.on('click', 'duckdb-polygons', handleFeatureClick);
            map.on('click', 'duckdb-polygon-outlines', handleFeatureClick);

            const handleMouseEnter = () => map.getCanvas().style.cursor = 'pointer';
            const handleMouseLeave = () => map.getCanvas().style.cursor = '';

            map.on('mouseenter', 'duckdb-points', handleMouseEnter);
            map.on('mouseenter', 'duckdb-lines', handleMouseEnter);
            map.on('mouseenter', 'duckdb-polygons', handleMouseEnter);
            map.on('mouseenter', 'duckdb-polygon-outlines', handleMouseEnter);

            map.on('mouseleave', 'duckdb-points', handleMouseLeave);
            map.on('mouseleave', 'duckdb-lines', handleMouseLeave);
            map.on('mouseleave', 'duckdb-polygons', handleMouseLeave);
            map.on('mouseleave', 'duckdb-polygon-outlines', handleMouseLeave);
        }

        // Add GeoJSON layers if URL is provided
        if (geojsonUrl) {
            console.log('Map: Adding GeoJSON source and layers');
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
        
        // Final StyleManager synchronization after all layer operations
        if (styleManagerRef.current) {
            console.log('Map: Final StyleManager sync - updating map reference');
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (styleManagerRef.current as any).map = map;
            
            // Force repaint to ensure style is fully updated
            map.triggerRepaint();
            
            // Log final state for debugging
            setTimeout(() => {
                const finalLayers = styleManagerRef.current?.getLayerIds() || [];
                const finalDataLayers = styleManagerRef.current?.getDataLayerInfo() || { duckdb: [], geojson: [] };
                console.log('Map: Final layer state - all layers:', finalLayers);
                console.log('Map: Final layer state - data layers:', finalDataLayers);
                
                // Update global debug info
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (window as any).debugMapLayers = {
                    allLayers: finalLayers,
                    duckdbLayers: finalDataLayers.duckdb,
                    styleManager: styleManagerRef.current,
                    mapInstance: map
                };
            }, 100);
        }
    };

    useEffect(() => {
        // If map already exists, just update layers
        if (initializedRef.current && mapRef.current) {
            console.log('Map: Map already exists, updating layers only');
            console.log('Map: selectedTable changed to:', selectedTable);
            console.log('Map: selectedColumns changed to:', selectedColumns);
            updateMapLayers(mapRef.current);
            
            // Update StyleManager and force map to render
            if (styleManagerRef.current) {
                // Ensure StyleManager has the current map reference
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (styleManagerRef.current as any).map = mapRef.current;
                console.log('Map: Updated StyleManager map reference');
                
                mapRef.current.triggerRepaint();
                
                // Check layer detection after a delay to allow tiles to load
                setTimeout(() => {
                    console.log('Map: Style manager layer detection after update (delayed):', styleManagerRef.current?.getLayerIds());
                    console.log('Map: Style manager data layers after update (delayed):', styleManagerRef.current?.getDataLayerInfo());
                }, 1000);
            }
            return;
        }

        const startTime = new Date();
        console.log(`計測 0 ${startTime.toISOString()} start マップ初期化`);
        console.log('マップ初期化開始');

        // DuckDBの初期化状態を確認
        if (db) {
            setMapError(null);
        } else {
            console.error('DuckDB is not initialized');
            return;
        }

        // DuckDBの接続を確認
        const initMap = async () => {
            try {
                // 接続を保持
                connectionRef.current = await db.connect();
                if (!connectionRef.current) {
                    console.error('Failed to connect to DuckDB');
                    setMapError('DuckDBへの接続に失敗しました');
                    return;
                }

                // Add vector protocol handler
                maplibregl.addProtocol('duckdb-vector', async params => {
                    console.log('Protocol handler called with URL:', params.url);

                    const zxy = getZxyFromUrl(params.url);
                    if (!zxy) throw new Error('invalid tile url: ' + params.url);
                    const cacheKey = `${zxy.z}/${zxy.x}/${zxy.y}`;

                    const addProtocolTime = new Date();
                    console.log(`計測 ${cacheKey} 1 ${addProtocolTime.toISOString()} start addProtocol`);

                    // キャッシュをチェック
                    // console.log('Cache get key:', cacheKey);
                    if (tileCache.current.has(cacheKey)) {
                        console.log(`計測 ${cacheKey} 2 using cached tile`);
                        const cachedData = tileCache.current.get(cacheKey);
                        // Create a fresh copy to avoid ArrayBuffer detachment
                        const freshCopy = cachedData ? new Uint8Array(cachedData.buffer.slice(0)) : new Uint8Array();
                        return { data: freshCopy };
                    }

                    console.log(`Processing tile: z: ${zxy.z}, x: ${zxy.x}, y: ${zxy.y}`);

                    try {
                        if (!connectionRef.current) {
                            throw new Error('Database connection is not available');
                        }

                        const { minLng, minLat, maxLng, maxLat } = getTileEnvelope(zxy.z, zxy.x, zxy.y);

                        console.log(`Tile bounds: minLng=${minLng}, maxLng=${maxLng}, minLat=${minLat}, maxLat=${maxLat}`);

                        const currentTable = selectedTableRef.current;
                        const currentColumns = selectedColumnsRef.current;

                        if (!currentTable) {
                            console.log('No table selected');
                            return { data: new Uint8Array() };
                        }

                        // 選択されたカラムを取得するSQLクエリを構築
                        const query = generateVectorTileQuery({
                            zxy,
                            selectedTable: currentTable,
                            selectedColumns: currentColumns,
                        });
                        console.log('query: ' + query);
                        const queryStartTime = new Date();
                        console.log('Executing query:', query);
                        console.log(`計測 ${cacheKey} 2 ${queryStartTime.toISOString()} start duckdb query`);
                        // const conn = await db.connect();
                        const stmt = await connectionRef.current.prepare(query);
                        const result = await stmt.query(minLng, minLat, maxLng, maxLat);
                        const queryEndTime = new Date();
                        const queryElapsedMs = queryEndTime.getTime() - queryStartTime.getTime();
                        console.log(`Query returned ${result.numRows} rows`);
                        console.log(`計測 ${cacheKey} 3 ${queryEndTime.toISOString()} end duckdb query, elapsed: ${queryElapsedMs}ms ${result.numRows} rows`);

                        if (result.numRows === 0) {
                            console.log(`計測 ${cacheKey} 3 No data found for this tile`);
                            console.log('cache io set key:', cacheKey);
                            tileCache.current.set(cacheKey, new Uint8Array());
                            return { data: new Uint8Array() };
                        }

                        const rows = result.toArray() as Array<{ geojson: string } & Record<string, string | number | null>>;
                        // console.log('Raw data:', rows);

                        const featureStartTime = new Date();
                        console.log(`計測 ${cacheKey} 4 ${featureStartTime.toISOString()} start feature`);
                        const features = rows
                            .map(row => {
                                try {
                                    if (!row.geojson) {
                                        console.warn('Empty geojson for row:', row);
                                        return null;
                                    }
                                    const geometry = JSON.parse(row.geojson) as Geometry;
                                    // console.log(`Parsed geometry ${index}:`, geometry);

                                    // 選択されたカラムの値をプロパティとして追加
                                    const properties: Record<string, string | number | null> = {};
                                    currentColumns.forEach(column => {
                                        if (column in row) {
                                            properties[column] = row[column];
                                        }
                                    });

                                    return {
                                        type: 'Feature' as const,
                                        geometry: geometry,
                                        properties: properties,
                                    } as Feature<Geometry, GeoJsonProperties>;
                                } catch (error) {
                                    console.error('Error parsing GeoJSON:', error);
                                    return null;
                                }
                            })
                            .filter((feature): feature is Feature<Geometry, GeoJsonProperties> => feature !== null);
                        const featureEndTime = new Date();
                        const featureElapsedMs = featureEndTime.getTime() - featureStartTime.getTime();
                        console.log(`計測 ${cacheKey} 5 ${featureEndTime.toISOString()} end feature, elapsed: ${featureElapsedMs}ms`);

                        // console.log('Processed features:', features);

                        if (features.length === 0) {
                            console.log(`計測 ${cacheKey} 6 No valid features found`);
                            console.log('cache io set key:', cacheKey);
                            tileCache.current.set(cacheKey, new Uint8Array());
                            return { data: new Uint8Array() };
                        }

                        // console.log('Generating vector tile...');
                        const vectorStartTime = new Date();
                        console.log(`計測 ${cacheKey} 6 ${vectorStartTime.toISOString()} start vector`);
                        const vectorTile = geojsonToVectorTile(features, zxy.z, zxy.x, zxy.y);
                        const vectorEndTime = new Date();
                        const vectorElapsedMs = vectorEndTime.getTime() - vectorStartTime.getTime();
                        console.log(`計測 ${cacheKey} 7 ${vectorEndTime.toISOString()} end  vector, elapsed: ${vectorElapsedMs}ms`);
                        console.log('Vector tile generated, size:', vectorTile.length);

                        // Create a safe copy to avoid ArrayBuffer detachment issues
                        const safeVectorTile = new Uint8Array(vectorTile.buffer.slice(0));
                        
                        // Cache a separate copy
                        console.log('cache io set key:', cacheKey);
                        const cacheData = new Uint8Array(safeVectorTile.buffer.slice(0));
                        tileCache.current.set(cacheKey, cacheData);

                        // Return yet another separate copy to avoid detachment
                        const returnData = new Uint8Array(safeVectorTile.buffer.slice(0));
                        const endTime = new Date();
                        const totalElapsedMs = endTime.getTime() - addProtocolTime.getTime();
                        console.log(`計測 ${cacheKey} 8 ${endTime.toISOString()} end addProtocol, total elapsed: ${totalElapsedMs}ms`);
                        return { data: returnData };
                    } catch (error) {
                        // console.log('cache io set key:', cacheKey);
                        // tileCache.current.set(cacheKey, new Uint8Array());
                        console.error('Error processing tile:', error);
                        return { data: new Uint8Array() };
                    }
                });

                // マップの初期化
                const mapInstance = new maplibregl.Map({
                    container: 'map',
                    zoom: selectedZoom, // 初期ズームレベルを状態から設定
                    center: [139.7482, 35.6591], // 東京付近の座標
                    style: {
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
                    },
                });

                mapRef.current = mapInstance; // マップインスタンスを保存

                // マップの読み込み完了時の処理
                mapInstance.on('load', () => {
                    const endTime = new Date();
                    const totalElapsedMs = endTime.getTime() - startTime.getTime();
                    console.log(`計測 9 ${endTime.toISOString()} end マップ初期化, total elapsed: ${totalElapsedMs}ms`);
                    console.log('マップ読み込み完了');
                    setIsLoading(false);

                    // Initialize style manager and notify parent
                    if (!styleManagerRef.current) {
                        console.log('Map: Initializing MapStyleManager');
                        console.log('Map: MapLibre instance loaded:', mapInstance.loaded());
                        
                        styleManagerRef.current = new MapStyleManager(mapInstance);
                        console.log('Map: MapStyleManager created, notifying parent');
                        onMapReady?.(styleManagerRef.current);
                    }

                    // Mark initialization as complete and update layers
                    initializedRef.current = true;
                    updateMapLayers(mapInstance);

                    console.log('Map: Available layers after init:', mapInstance.getStyle().layers?.map(l => l.id));
                    
                    // Force map to render and potentially load tiles, then check layer detection after a delay
                    if (styleManagerRef.current) {
                        mapInstance.triggerRepaint();
                        
                        // Check layer detection after a delay to allow tiles to load
                        setTimeout(() => {
                            console.log('Map: Style manager layer detection after init (delayed):', styleManagerRef.current?.getLayerIds());
                            console.log('Map: Style manager data layers after init (delayed):', styleManagerRef.current?.getDataLayerInfo());
                        }, 1000);
                    }
                });

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
                console.error('Error initializing map:', error);
                setMapError(`マップ初期化エラー: ${error instanceof Error ? error.message : String(error)}`);
                setIsLoading(false);
            }
        };

        initMap();
    }, [db, selectedTable, selectedColumns, selectedZoom, geojsonUrl]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            <div
                id="map"
                style={{
                    height: '90%',
                    aspectRatio: '1/1',
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                }}
            ></div>
            {/* ズームレベル選択 */}
            <div
                style={{
                    position: 'absolute',
                    top: '10px',
                    right: '10px',
                    zIndex: 1,
                    background: 'white',
                    padding: '5px',
                    borderRadius: '5px',
                    boxShadow: '0 0 10px rgba(0,0,0,0.1)',
                }}
            >
                <select
                    value={selectedZoom}
                    onChange={handleZoomChange}
                    style={{
                        padding: '5px',
                        borderRadius: '4px',
                        border: '1px solid #ccc',
                    }}
                >
                    {Array.from({ length: 31 }, (_, i) => (
                        <option key={i} value={i}>
                            ズームレベル {i}
                        </option>
                    ))}
                </select>
            </div>
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

export default MapComponent;
