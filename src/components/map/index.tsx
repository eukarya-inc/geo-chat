import { type AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapStyleManager } from './mapStyleManager';
import { detectDisplayColumns, type ColumnInfo } from '../../utils/duckdb';
import { parseDuckDBTileUrl, generateVectorTileQuery, processMVTResult } from './utils/mvt';
import { processMapStyle } from './utils/style';
import { updateMapLayers as updateMapLayersHelper } from './utils/layerOperations';
import type { MapProps } from './types';
import { generatePopupContent, createDefaultStyle } from './utils/mapHelpers';
import { TileCacheManager } from './utils/tileCache';
import { useMapDuckDB } from '../../lib/duckdb/useDuckDB';

// Re-export types for convenience
export type { ViewState, VectorTileLayer, TableStyle, ExtraStyle, MapProps } from './types';

const MapComponent: React.FC<MapProps> = ({
    dbContext,
    chatId = null,
    selectedTable,
    tables,
    selectedColumns,
    onMapReady,
    onStyleChange,
    geometryColumnName,
    onViewStateChange,
    initialViewState,
    initialStyle,
    onStyleUpdate,
    tableStyles = {},
    extraStyle,
    onTableStyleChanged,
    onExtraStyleChange,
}) => {
    // Generate unique map ID for each instance
    const mapId = useRef(`map-${Math.random().toString(36).slice(2, 11)}`).current;
    // Use dedicated DBContext for Map with 20 connections for parallel tile rendering
    const { mapDbContext } = useMapDuckDB(20);
    // Use mapDbContext for tile rendering, dbContext for other operations
    const tileDbContext = mapDbContext || dbContext;

    const [mapError, setMapError] = useState<string | null>(null);
    const [mvtError, setMvtError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isLoadingTiles, setIsLoadingTiles] = useState<boolean>(false);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const styleManagerRef = useRef<MapStyleManager | null>(null);
    const connectionRef = useRef<AsyncDuckDBConnection>(null);
    const tileCacheManager = useRef(new TileCacheManager()).current;
    const selectedTableRef = useRef<string | null>(selectedTable);
    const selectedColumnsRef = useRef<string[] | undefined>(selectedColumns);
    const geometryColumnNameRef = useRef<string | undefined>(geometryColumnName);
    // Cache column types per table to avoid repeated DESCRIBE queries while tiles load
    const columnTypesRef = useRef<Record<string, Record<string, string>>>({});
    const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
    // Track MVT errors with a ref to allow protocol handler to report errors
    const mvtErrorRef = useRef<string | null>(null);
    // Track number of in-flight tile requests (DuckDB tile generation)
    const pendingTileRequestsRef = useRef<number>(0);
    // Track tile queue visibility
    const [showTileQueue, setShowTileQueue] = useState<boolean>(false);
    const tileQueueRef = useRef<HTMLDivElement>(null);
    // Force re-render to update elapsed times
    const [, forceUpdate] = useState({});

    // Memoize tableStyles to prevent unnecessary cache clearing on every re-render
    // Only create new reference when tableStyles content actually changes
    const memoizedTableStyles = useMemo(() => {
        // Return empty object if tableStyles is undefined or null
        if (!tableStyles) return {};
        // Return the same reference if content is unchanged (deep comparison via JSON)
        return tableStyles;
    }, [JSON.stringify(tableStyles)]);

    // Close tile queue when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (tileQueueRef.current && !tileQueueRef.current.contains(event.target as Node)) {
                setShowTileQueue(false);
            }
        };

        if (showTileQueue) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showTileQueue]);

    // Update elapsed times every second when tile queue is visible
    useEffect(() => {
        if (showTileQueue) {
            const interval = setInterval(() => {
                forceUpdate({});
            }, 1000);

            return () => {
                clearInterval(interval);
            };
        }
    }, [showTileQueue]);

    // Store resolved column types under all identifier variants (chatId.table, table)
    const cacheColumnTypes = useCallback(
        (tableIdentifier: string, typeMap: Record<string, string>) => {
            if (!tableIdentifier) {
                return;
            }

            const keys = new Set<string>();
            keys.add(tableIdentifier);

            const baseName = tableIdentifier.split('.').pop();
            if (baseName) {
                keys.add(baseName);
            }

            if (chatId && baseName) {
                keys.add(`${chatId}.${baseName}`);
            }

            keys.forEach(key => {
                columnTypesRef.current[key] = typeMap;
            });
        },
        [chatId]
    );

    const removeCachedColumnTypes = useCallback(
        (tableIdentifier: string) => {
            if (!tableIdentifier) {
                return;
            }

            const keys = new Set<string>();
            keys.add(tableIdentifier);

            const baseName = tableIdentifier.split('.').pop();
            if (baseName) {
                keys.add(baseName);
            }

            if (chatId && baseName) {
                keys.add(`${chatId}.${baseName}`);
            }

            keys.forEach(key => {
                delete columnTypesRef.current[key];
            });
        },
        [chatId]
    );

    // Use provided columns or detected columns
    const effectiveColumns = selectedColumns !== undefined ? selectedColumns : detectedColumns;
    const isApplyingCustomStyleRef = useRef<boolean>(false);
    const hasCustomStyleRef = useRef<boolean>(false);
    const customStyleRef = useRef<maplibregl.StyleSpecification | null>(null);
    const initialStyleRef = useRef<maplibregl.StyleSpecification | undefined>(initialStyle);

    // Keep refs updated during render (not in useEffect) to ensure they're always current
    selectedTableRef.current = selectedTable;
    selectedColumnsRef.current = effectiveColumns;
    geometryColumnNameRef.current = geometryColumnName;
    initialStyleRef.current = initialStyle;

    // Update layers when effectiveColumns change AND map is initialized
    useEffect(() => {
        // Only proceed if we have a table and map is initialized
        if (!selectedTable || !mapRef.current || !isInitialized) {
            return;
        }

        // Close popup when table changes
        if (popupRef.current) {
            popupRef.current.remove();
            popupRef.current = null;
        }

        // Clear MVT errors when table/columns change
        setMvtError(null);
        mvtErrorRef.current = null;

        // Reset tile loading state
        pendingTileRequestsRef.current = 0;
        setIsLoadingTiles(false);

        // Clear tile cache to force refresh with new columns
        tileCacheManager.clear();

        // Re-register the protocol to ensure it uses the latest columns
        registerDuckDBProtocol();

        // Remove all DuckDB sources and their layers to force complete refresh
        const currentStyle = mapRef.current.getStyle();
        if (!currentStyle) {
            // Style not loaded yet, skip cleanup
            setTimeout(() => {
                if (mapRef.current && isInitialized) {
                    updateMapLayers(mapRef.current);
                }
            }, 100);
            return;
        }
        const allLayers = currentStyle.layers || [];
        const allSources = currentStyle.sources || {};

        // Clear handler tracking when removing layers
        // No need to clear handlers as they're now global

        // Remove all layers that use duckdb sources
        allLayers.forEach(layer => {
            if ('source' in layer && layer.source && layer.source.startsWith('duckdb-')) {
                if (mapRef.current?.getLayer(layer.id)) {
                    mapRef.current.removeLayer(layer.id);
                }
            }
        });

        // Remove all duckdb sources
        Object.keys(allSources).forEach(sourceId => {
            if (sourceId.startsWith('duckdb-')) {
                if (mapRef.current?.getSource(sourceId)) {
                    mapRef.current.removeSource(sourceId);
                }
            }
        });

        // Clear tile cache to force refresh
        tileCacheManager.clear();

        // Re-add source and layers after a brief delay
        setTimeout(() => {
            if (mapRef.current && isInitialized) {
                updateMapLayers(mapRef.current);
            }
        }, 100);

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [effectiveColumns, selectedTable, isInitialized, geometryColumnName]);

    // Define popup ref inside the component
    const popupRef = useRef<maplibregl.Popup | null>(null);

    const handleFeatureClick = useCallback(
        (e: maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
            if (!e.features?.[0] || !mapRef.current) return;

            const feature = e.features[0];
            const coordinates = e.lngLat;

            // Generate popup content using helper function
            const content = generatePopupContent(feature, coordinates);

            // Close existing popup if any
            if (popupRef.current) {
                popupRef.current.remove();
                popupRef.current = null;
            }

            // Create new popup and display
            popupRef.current = new maplibregl.Popup({
                closeButton: true,
                closeOnClick: true,
                offset: 25,
                maxWidth: '400px',
                className: 'max-h-96 overflow-y-auto',
            });

            popupRef.current.setLngLat(coordinates).setHTML(content).addTo(mapRef.current);
        },
        []
    );

    // Function to zoom map to data bounds
    const fitMapToData = useCallback(async (tableName: string, geomColumn: string) => {
        if (!mapRef.current || !connectionRef.current) return;

        try {
            // Don't use chatId-qualified table name - connection already has chatId context
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

            const bounds = result.toArray()[0] as unknown as {
                min_lng: number;
                max_lng: number;
                min_lat: number;
                max_lat: number;
            };

            if (bounds && bounds.min_lng !== null && bounds.min_lng !== undefined) {
                // Validate coordinate ranges before fitting bounds
                const isValidLat = (lat: number) => lat >= -90 && lat <= 90;
                const isValidLng = (lng: number) => lng >= -180 && lng <= 180;

                if (
                    !isValidLng(bounds.min_lng) ||
                    !isValidLng(bounds.max_lng) ||
                    !isValidLat(bounds.min_lat) ||
                    !isValidLat(bounds.max_lat)
                ) {
                    const errorMsg = `無効な座標範囲が検出されました。緯度は-90～90、経度は-180～180の範囲である必要があります。検出された座標: 経度 [${bounds.min_lng.toFixed(2)}, ${bounds.max_lng.toFixed(2)}]、緯度 [${bounds.min_lat.toFixed(2)}, ${bounds.max_lat.toFixed(2)}]。このデータは投影座標系（例: Web Mercator）のようです。データ提供元に正しい座標系のデータを依頼するか、AIチャットで「このテーブルの座標を地理座標系（EPSG:4326）に変換してください」と依頼してみてください。`;
                    console.error('Error fitting map to data bounds:', errorMsg);
                    setMvtError(errorMsg);
                    mvtErrorRef.current = errorMsg;
                    return;
                }

                mapRef.current.fitBounds(
                    [
                        [bounds.min_lng, bounds.min_lat],
                        [bounds.max_lng, bounds.max_lat],
                    ],
                    {
                        padding: 50,
                        duration: 1000,
                        maxZoom: 16, // Prevent excessive zoom
                    }
                );
            }
        } catch (error) {
            // Silently ignore errors from fitMapToData
            // These can occur during table transitions when geometry column names haven't synced yet
            // The map will still work fine without auto-fitting bounds
            console.warn(
                'Failed to fit map to data bounds (non-critical):',
                error instanceof Error ? error.message : String(error)
            );
        }
    }, []);

    // Auto-detect columns when table or selected columns change and maintain column type cache
    useEffect(() => {
        const updateSchemaInfo = async () => {
            if (!connectionRef.current || !selectedTable) {
                columnTypesRef.current = {};
                return;
            }

            try {
                // Get table chatId
                const schemaQuery = chatId ? `DESCRIBE ${chatId}.${selectedTable}` : `DESCRIBE ${selectedTable}`;
                const result = await connectionRef.current.query(schemaQuery);
                const schemaData = result.toArray() as unknown as ColumnInfo[];

                // Cache column types for vector tile generation
                const typeMap = schemaData.reduce<Record<string, string>>((acc, column) => {
                    if (column?.column_name) {
                        acc[column.column_name] = column.column_type;
                    }
                    return acc;
                }, {});
                cacheColumnTypes(selectedTable, typeMap);

                if (selectedColumns === undefined) {
                    // Use helper function to detect display columns
                    const filteredColumns = detectDisplayColumns(schemaData, geometryColumnName);

                    setDetectedColumns(filteredColumns);

                    // Update the ref immediately for the protocol handler
                    selectedColumnsRef.current = filteredColumns;

                    // Clear tile cache to force refresh with new columns
                    tileCacheManager.clear();

                    // Force map to re-render tiles if map is ready
                    if (mapRef.current && isInitialized) {
                        // Remove and re-add the source to force tile refresh
                        const sourceId = `duckdb-${selectedTable}`;
                        if (mapRef.current.getSource(sourceId)) {
                            // Get existing layers that use this source
                            const currentStyle = mapRef.current.getStyle();
                            const layers =
                                currentStyle?.layers?.filter(layer => 'source' in layer && layer.source === sourceId) ||
                                [];

                            // Remove layers
                            layers.forEach(layer => {
                                if (mapRef.current?.getLayer(layer.id)) {
                                    mapRef.current.removeLayer(layer.id);
                                }
                            });

                            // Remove source
                            if (mapRef.current.getSource(sourceId)) {
                                mapRef.current.removeSource(sourceId);
                            }

                            // Re-add source and layers
                            setTimeout(() => {
                                if (mapRef.current) {
                                    // Trigger re-render by changing a style property
                                    mapRef.current.triggerRepaint();
                                }
                            }, 100);
                        }
                    }
                }
            } catch (error) {
                console.error('[Map] Failed to fetch chatId info:', error);
                removeCachedColumnTypes(selectedTable);
                if (selectedColumns === undefined) {
                    setDetectedColumns([]);
                    selectedColumnsRef.current = [];
                }
            }
        };

        updateSchemaInfo();
    }, [
        selectedTable,
        selectedColumns,
        chatId,
        geometryColumnName,
        isInitialized,
        cacheColumnTypes,
        removeCachedColumnTypes,
    ]);

    // Re-fit bounds when geometry column changes
    useEffect(() => {
        // Only fit to data if geometryColumnName is explicitly provided
        const currentGeometryColumn = geometryColumnNameRef.current;
        const currentTable = selectedTableRef.current;

        // Skip if table or geometry column is not set
        if (!currentTable || !currentGeometryColumn || !mapRef.current || !connectionRef.current || !isInitialized) {
            return;
        }

        // IMPORTANT: Verify that the geometry column actually belongs to the current table
        // by checking if both values have been updated in sync
        // If selectedTable changed but geometryColumnName hasn't updated yet, skip
        if (currentTable !== selectedTable || currentGeometryColumn !== geometryColumnName) {
            return;
        }

        // Schedule fit bounds to happen on next idle event (after tiles are loaded)
        needsFitBoundsRef.current = { table: currentTable, geomColumn: currentGeometryColumn };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geometryColumnName, selectedTable, dbContext]);

    // Track which tables have been initialized with default styles
    const initializedTablesRef = useRef<Set<string>>(new Set());
    // Track if we need to fit bounds on next idle event
    const needsFitBoundsRef = useRef<{ table: string; geomColumn: string } | null>(null);

    // Get connection from map-specific pool (DatabaseContext handles round-robin internally)
    const getMapConnection = useCallback(async (): Promise<AsyncDuckDBConnection> => {
        return await tileDbContext.createManagedConnection(chatId);
    }, [tileDbContext, chatId]);

    // Function to update map layers dynamically
    const updateMapLayers = useCallback(
        (map: maplibregl.Map) => {
            updateMapLayersHelper({
                map,
                tables: tables || [],
                selectedTable,
                tableStyles: memoizedTableStyles,
                extraStyle,
                isApplyingCustomStyle: isApplyingCustomStyleRef.current,
                onTableStyleChanged,
                onExtraStyleChange,
                initializedTables: initializedTablesRef.current,
                styleManager: styleManagerRef.current,
                chatId,
            });

            // Schedule fit bounds for when tiles are loaded
            const currentGeometryColumn = geometryColumnNameRef.current;
            const currentTable = selectedTableRef.current;

            // Skip if table or geometry column is not set
            if (!currentTable || !currentGeometryColumn || !connectionRef.current) {
                return;
            }

            // IMPORTANT: Verify that the geometry column actually belongs to the current table
            if (currentTable === selectedTable && currentGeometryColumn === geometryColumnName) {
                needsFitBoundsRef.current = { table: currentTable, geomColumn: currentGeometryColumn };
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            selectedTable,
            tables,
            geometryColumnName,
            dbContext,
            memoizedTableStyles,
            onTableStyleChanged,
            extraStyle,
            onExtraStyleChange,
        ]
    );

    // Function to register DuckDB protocol (extracted for reuse)
    const registerDuckDBProtocol = useCallback(() => {
        // Note: MapLibre doesn't provide a way to check if protocol exists, so we'll try to add it
        // If it already exists, it will be overwritten which is fine for our use case
        try {
            maplibregl.addProtocol('duckdb', async params => {
                // Parse URL: duckdb://[chatId.]table/{z}/{x}/{y}.pbf
                const url = params.url.replace(/\.pbf$/, '.mvt'); // Convert extension for parsing

                const parseResult = parseDuckDBTileUrl(url);
                if (!parseResult) {
                    console.warn(`[Protocol Handler] Failed to parse URL: ${url}`);
                    return { data: new Uint8Array() };
                }

                const { tableSpec, tableName, zxy } = parseResult;

                const cacheKey = `${tableSpec}/${zxy.z}/${zxy.x}/${zxy.y}`;

                // Render function for tile generation
                const renderTile = async (signal: AbortSignal): Promise<Uint8Array> => {
                    // Track tile loading start only when actually rendering (not from cache)
                    pendingTileRequestsRef.current += 1;
                    updateLoadingState();

                    // Check for abort (from TileCacheManager)
                    if (signal.aborted) {
                        throw new Error('Aborted');
                    }

                    // Get connection from map-specific pool
                    const connection = await getMapConnection();

                    try {
                        return await renderTileWithConnection(connection, signal);
                    } finally {
                        // Always release connection back to pool
                        await connection.close();
                        // Track tile rendering end
                        pendingTileRequestsRef.current -= 1;
                        if (pendingTileRequestsRef.current <= 0) {
                            pendingTileRequestsRef.current = 0;
                        }
                        updateLoadingState();
                    }
                };

                const renderTileWithConnection = async (
                    connection: AsyncDuckDBConnection,
                    signal: AbortSignal
                ): Promise<Uint8Array> => {
                    const currentColumns = selectedColumnsRef.current || [];
                    const currentGeometryColumn = geometryColumnNameRef.current;

                    if (!tableName) {
                        return new Uint8Array();
                    }

                    // Return empty tile if no geometry column is specified
                    if (!currentGeometryColumn) {
                        return new Uint8Array();
                    }

                    // Check abort signal again before expensive operations
                    if (signal.aborted) {
                        throw new Error('Aborted');
                    }

                    let columnTypeMap = columnTypesRef.current[tableName] || columnTypesRef.current[tableSpec];

                    if (!columnTypeMap) {
                        const describeTargets = new Set<string>();
                        if (chatId) {
                            describeTargets.add(`${chatId}.${tableName}`);
                        }
                        describeTargets.add(tableSpec);
                        describeTargets.add(tableName);

                        let fetchError: unknown = null;

                        for (const target of describeTargets) {
                            if (!target) {
                                continue;
                            }

                            try {
                                const describeResult = await connection.query(`DESCRIBE ${target}`);
                                const schemaRows = describeResult.toArray() as unknown as ColumnInfo[];
                                const typeMap = schemaRows.reduce<Record<string, string>>((acc, column) => {
                                    if (column?.column_name) {
                                        acc[column.column_name] = column.column_type;
                                    }
                                    return acc;
                                }, {});

                                cacheColumnTypes(target, typeMap);

                                columnTypeMap =
                                    columnTypesRef.current[tableName] || columnTypesRef.current[tableSpec] || typeMap;
                                break;
                            } catch (error) {
                                fetchError = error;
                            }
                        }

                        if (!columnTypeMap && fetchError) {
                            console.warn('[Map] Unable to fetch column types for vector tile generation:', fetchError);
                        }
                    }

                    // Build SQL query to get selected columns
                    // Don't pass chatId - connection already has chatId context
                    const query = generateVectorTileQuery({
                        zxy,
                        selectedTable: tableName,
                        selectedColumns: currentColumns,
                        geometryColumnName: currentGeometryColumn,
                        chatId: null, // Don't use URL-extracted chatId
                        columnTypes: columnTypeMap,
                    });

                    // Final abort check before executing the query
                    if (signal.aborted) {
                        throw new Error('Aborted');
                    }

                    // Track rendering performance for debugging
                    const renderStartTime = performance.now();
                    let result: Awaited<ReturnType<AsyncDuckDBConnection['query']>>;

                    try {
                        // Execute query and set up cancellation
                        const queryPromise = connection.query(query);

                        // Set up abort listener to cancel the query if abort is triggered
                        const abortHandler = async () => {
                            try {
                                // Try to cancel the running query
                                await connection.cancelSent();
                            } catch {
                                // Ignore cancellation errors - query may have already completed
                            }
                        };

                        // Add abort listener from TileCacheManager
                        signal.addEventListener('abort', abortHandler, { once: true });

                        // Wait for query to complete
                        result = await queryPromise;

                        // Check if aborted after query completes
                        if (signal.aborted) {
                            throw new Error('Aborted');
                        }
                    } catch (error) {
                        // Silently ignore errors if we've been aborted
                        if (signal.aborted) {
                            throw new Error('Aborted');
                        }
                        console.error('Vector tile query error:', error);
                        console.error('Query:', query);
                        console.error('Tile coordinates:', { z: zxy.z, x: zxy.x, y: zxy.y });

                        // Report error to state for UI display
                        const errorMessage = error instanceof Error ? error.message : String(error);
                        mvtErrorRef.current = `MVTレンダリングエラー (タイル ${zxy.z}/${zxy.x}/${zxy.y}): ${errorMessage}`;
                        // Trigger state update on next tick
                        setTimeout(() => {
                            if (mvtErrorRef.current) {
                                setMvtError(mvtErrorRef.current);
                            }
                        }, 0);

                        return new Uint8Array();
                    }

                    if (result.numRows === 0) {
                        return new Uint8Array();
                    }

                    // Get the MVT data directly from the query result
                    let rows;
                    try {
                        rows = result.toArray();
                    } catch (serializationError) {
                        // If serialization fails, try to get just the first row
                        console.warn('MVT serialization error, attempting single row access:', serializationError);
                        try {
                            // Try to access the data more directly
                            const firstRow = result.get(0);
                            rows = [firstRow];
                        } catch (fallbackError) {
                            console.error('Failed to retrieve MVT data:', fallbackError);
                            return new Uint8Array();
                        }
                    }

                    if (!rows || rows.length === 0 || !rows[0]) {
                        return new Uint8Array();
                    }

                    // The result should contain a single row with the MVT binary data
                    const mvtRow = rows[0] as { mvt: unknown };

                    // Process MVT data
                    const { returnData } = processMVTResult(mvtRow.mvt);

                    // Log rendering performance metrics
                    const renderTime = performance.now() - renderStartTime;
                    const tileSize = returnData.length;
                    console.log(
                        `[MVT Render] Tile ${zxy.z}/${zxy.x}/${zxy.y}: ` +
                            `${renderTime.toFixed(1)}ms, ` +
                            `${(tileSize / 1024).toFixed(1)}KB, ` +
                            `${currentColumns.length} columns`
                    );

                    // Warn if rendering is slow (>1 second)
                    if (renderTime > 1000) {
                        console.warn(
                            `[MVT Performance] Slow tile render detected: ${renderTime.toFixed(0)}ms for tile ${zxy.z}/${zxy.x}/${zxy.y}`
                        );
                    }

                    return returnData;
                };

                // Use TileCacheManager for caching and mutex control
                try {
                    const tileData = await tileCacheManager.getOrRender(cacheKey, renderTile);
                    // Return a fresh copy to prevent ArrayBuffer detachment issues
                    // MapLibre transfers the buffer to workers, which detaches it
                    return { data: new Uint8Array(tileData) };
                } catch {
                    // Handle abort or other errors
                    return { data: new Uint8Array() };
                }
            });
        } catch {
            // Failed to register protocol
        }
    }, [geometryColumnName, chatId, cacheColumnTypes]);

    // Update loading state based on tile generation only (protocol-based control)
    // Use a ref to track if we're already in a loading state to prevent unnecessary updates
    const isLoadingTilesRef = useRef(false);
    const updateLoadingState = useCallback(() => {
        const isLoading = pendingTileRequestsRef.current > 0;
        // Only update state if loading status actually changed
        if (isLoadingTilesRef.current !== isLoading) {
            isLoadingTilesRef.current = isLoading;
            setIsLoadingTiles(isLoading);
        }
    }, []);

    // Function to handle style changes
    const handleStyleChange = useCallback(
        async (newStyle: maplibregl.StyleSpecification) => {
            if (!mapRef.current || !isInitialized) {
                customStyleRef.current = newStyle;
                hasCustomStyleRef.current = true;
                return;
            }

            try {
                setIsLoading(true);
                isApplyingCustomStyleRef.current = true;

                // Check if this is the default style (has osm source and osm-layer)
                const isDefaultStyle =
                    newStyle.sources?.osm && newStyle.layers?.some(layer => layer.id === 'osm-layer');

                // Fix property references in the style
                const fixedStyle = processMapStyle(newStyle);

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

                    // Clear tile cache to force refresh
                    tileCacheManager.clear();

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
        },
        [updateMapLayers, onStyleUpdate, isInitialized]
    );

    // Expose style change handler
    useEffect(() => {
        if (onStyleChange && isInitialized) {
            onStyleChange(handleStyleChange);
        }
    }, [onStyleChange, handleStyleChange, isInitialized]);

    useEffect(() => {
        // If map already exists, just update layers and re-register protocol
        if (isInitialized && mapRef.current) {
            // Re-register DuckDB protocol to pick up new geometryColumnName
            registerDuckDBProtocol();

            // Clear tile cache to force refresh
            tileCacheManager.clear();

            updateMapLayers(mapRef.current);

            // Update StyleManager and force map to render
            if (styleManagerRef.current) {
                // Ensure StyleManager has the current map reference
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (styleManagerRef.current as any).map = mapRef.current;

                mapRef.current.triggerRepaint();

                // Check layer detection after a delay to allow tiles to load
                setTimeout(() => {}, 1000);
            }
            return;
        }

        // Don't initialize if we're currently applying a custom style
        if (isApplyingCustomStyleRef.current) {
            return;
        }

        // Check DuckDB initialization status
        if (dbContext) {
            setMapError(null);
        } else {
            return;
        }

        // Check DuckDB connection
        const initMap = async () => {
            try {
                // Keep connection
                // Use chatId-aware connection
                connectionRef.current = await dbContext.createManagedConnection(chatId);
                if (!connectionRef.current) {
                    setMapError('Failed to connect to DuckDB');
                    return;
                }

                // Fetch chatId information after connection is established
                if (selectedTable) {
                    try {
                        const schemaQuery = chatId
                            ? `DESCRIBE ${chatId}.${selectedTable}`
                            : `DESCRIBE ${selectedTable}`;
                        const result = await connectionRef.current.query(schemaQuery);
                        const schemaData = result.toArray() as unknown as ColumnInfo[];

                        const typeMap = schemaData.reduce<Record<string, string>>((acc, column) => {
                            if (column?.column_name) {
                                acc[column.column_name] = column.column_type;
                            }
                            return acc;
                        }, {});
                        cacheColumnTypes(selectedTable, typeMap);

                        if (selectedColumns === undefined) {
                            const filteredColumns = detectDisplayColumns(schemaData, geometryColumnName);
                            setDetectedColumns(filteredColumns);

                            // Update the ref immediately for the protocol handler
                            selectedColumnsRef.current = filteredColumns;

                            // Clear tile cache to force refresh with new columns
                            tileCacheManager.clear();
                        }
                    } catch (error) {
                        console.error('[Map] Failed to auto-detect columns:', error);
                        removeCachedColumnTypes(selectedTable);
                        if (selectedColumns === undefined) {
                            setDetectedColumns([]);
                            selectedColumnsRef.current = [];
                        }
                    }
                }

                // Add vector protocol handler
                registerDuckDBProtocol();

                // Initialize map - Only OSM base layer, no DuckDB layers yet
                const defaultStyle = initialStyleRef.current || createDefaultStyle();

                // Fix property references in custom styles before using
                const styleToUse = customStyleRef.current ? processMapStyle(customStyleRef.current) : defaultStyle;

                const mapInstance = new maplibregl.Map({
                    container: mapId,
                    zoom: initialViewState?.zoom ?? 5, // Initial zoom level
                    center: initialViewState?.center ?? [139.7482, 35.6591], // Coordinates near Tokyo
                    bearing: initialViewState?.bearing ?? 0,
                    pitch: initialViewState?.pitch ?? 0,
                    style: styleToUse,
                    // Enable preserveDrawingBuffer for image export
                    canvasContextAttributes: {
                        preserveDrawingBuffer: true,
                    },
                });

                mapRef.current = mapInstance; // Save map instance

                // Process when map loading is complete
                mapInstance.on('load', () => {
                    setIsLoading(false);

                    // Initialize style manager and notify parent
                    if (!styleManagerRef.current) {
                        styleManagerRef.current = new MapStyleManager(mapInstance);
                        onMapReady?.(styleManagerRef.current);
                    }

                    // Mark initialization as complete and update layers
                    setIsInitialized(true);
                    updateMapLayers(mapInstance);

                    // Register single global click handler for all features
                    mapInstance.on('click', (e: maplibregl.MapMouseEvent) => {
                        // Query all rendered features at the click point
                        const features = mapInstance.queryRenderedFeatures(e.point);

                        // Filter for DuckDB layers (layer IDs starting with 'duckdb-')
                        const duckdbFeatures = features.filter(f => f.layer?.id?.startsWith('duckdb-'));

                        if (duckdbFeatures.length > 0) {
                            // Use the first DuckDB feature found
                            const event = {
                                ...e,
                                features: duckdbFeatures,
                            };
                            handleFeatureClick(
                                event as maplibregl.MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }
                            );
                        }
                    });

                    // Register hover handlers for cursor change
                    mapInstance.on('mousemove', (e: maplibregl.MapMouseEvent) => {
                        const features = mapInstance.queryRenderedFeatures(e.point);
                        const hasDuckdbFeature = features.some(f => f.layer?.id?.startsWith('duckdb-'));
                        mapInstance.getCanvas().style.cursor = hasDuckdbFeature ? 'pointer' : '';
                    });

                    // Force map to render and potentially load tiles, then check layer detection after a delay
                    if (styleManagerRef.current) {
                        mapInstance.triggerRepaint();

                        // Check layer detection after a delay to allow tiles to load
                        setTimeout(() => {}, 1000);
                    }
                });

                // Fit bounds on idle event (after tiles are loaded)
                mapInstance.on('idle', () => {
                    if (needsFitBoundsRef.current) {
                        const { table, geomColumn } = needsFitBoundsRef.current;
                        needsFitBoundsRef.current = null; // Clear the flag
                        fitMapToData(table, geomColumn);
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
                            pitch,
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

                // Cleanup function
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
                setMapError(`Map initialization error: ${error instanceof Error ? error.message : String(error)}`);
                setIsLoading(false);
            }
        };

        initMap();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbContext, geometryColumnName]);

    // Update layers when tables or selectedTable changes
    useEffect(() => {
        if (mapRef.current && isInitialized) {
            // Clear tile cache to force refresh
            tileCacheManager.clear();
            updateMapLayers(mapRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTable, tables, effectiveColumns, memoizedTableStyles, extraStyle]);

    // Separate effect for onMapReady to avoid triggering re-initialization
    useEffect(() => {
        if (onMapReady && styleManagerRef.current && isInitialized) {
            onMapReady(styleManagerRef.current);
        }
    }, [onMapReady, isInitialized]);

    return (
        <div className="relative w-full h-full">
            <div id={mapId} className="w-full h-full"></div>

            {isLoading && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white/80 px-2.5 py-2 rounded">
                    読み込み中...
                </div>
            )}
            {mapError && (
                <div className="absolute top-2.5 left-2.5 bg-red-600/70 text-white px-2.5 py-2 rounded max-w-[80%]">
                    Error: {mapError}
                </div>
            )}
            {mvtError && (
                <div className="absolute top-2.5 right-2.5 bg-orange-500/90 text-white px-4 py-3 rounded-lg max-w-md shadow-md text-sm leading-normal flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                        <strong className="text-base">地図レンダリングエラー</strong>
                        <button
                            onClick={() => {
                                setMvtError(null);
                                mvtErrorRef.current = null;
                            }}
                            className="bg-transparent border-none text-white cursor-pointer text-xl leading-none p-0 ml-2 hover:opacity-70 transition-opacity"
                            title="Close"
                        >
                            ×
                        </button>
                    </div>
                    <div className="text-[13px] opacity-95">{mvtError}</div>
                </div>
            )}
            {isLoadingTiles && !mvtError && (
                <div ref={tileQueueRef} className="absolute top-2.5 right-2.5 z-10">
                    <button
                        onClick={() => setShowTileQueue(!showTileQueue)}
                        className="bg-white/95 px-3 py-2 rounded-md shadow-sm flex items-center gap-2 text-sm text-gray-600 hover:bg-white transition-colors cursor-pointer"
                    >
                        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                        <span>読み込み中...</span>
                    </button>
                    {showTileQueue && (
                        <div className="absolute top-full right-0 mt-2 bg-white rounded-md shadow-lg border border-gray-200 p-3 min-w-[300px] max-h-[400px] overflow-y-auto">
                            <div className="text-xs font-semibold text-gray-700 mb-2">
                                レンダリング中のタイル ({tileCacheManager.getRenderingTiles().length}件)
                            </div>
                            <div className="space-y-1">
                                {tileCacheManager.getRenderingTiles().map(({ key, elapsedTime }) => {
                                    // Parse tile key to extract z/x/y
                                    const match = key.match(/\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
                                    const coords = match ? `${match[1]}/${match[2]}/${match[3]}` : key;
                                    return (
                                        <div
                                            key={key}
                                            className="text-xs text-gray-600 font-mono flex justify-between items-center py-1 px-2 bg-gray-50 rounded"
                                        >
                                            <span className="truncate flex-1">{coords}</span>
                                            <span className="text-gray-400 ml-2">
                                                {(elapsedTime / 1000).toFixed(1)}s
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default MapComponent;
