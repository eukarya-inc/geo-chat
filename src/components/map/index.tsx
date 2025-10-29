import { type AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MapStyleManager } from './mapStyleManager';
import { detectDisplayColumns, type ColumnInfo } from '../../utils/duckdb';
import { parseDuckDBTileUrl, generateVectorTileQuery, processMVTResult } from './utils/mvt';
import { processMapStyle } from './utils/style';
import { updateMapLayers as updateMapLayersHelper } from './utils/layerOperations';
import type { MapProps } from './types';
import { generatePopupContent, createDefaultStyle } from './utils/mapHelpers';

// Re-export types for convenience
export type { ViewState, VectorTileLayer, TableStyle, ExtraStyle, MapProps } from './types';

const MapComponent: React.FC<MapProps> = ({
    dbContext,
    schema = null,
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
    const [mapError, setMapError] = useState<string | null>(null);
    const [mvtError, setMvtError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [isInitialized, setIsInitialized] = useState<boolean>(false);
    const mapRef = useRef<maplibregl.Map | null>(null);
    const styleManagerRef = useRef<MapStyleManager | null>(null);
    const connectionRef = useRef<AsyncDuckDBConnection>(null);
    const tileCache = useRef<Map<string, Uint8Array>>(new Map());
    const selectedTableRef = useRef<string | null>(selectedTable);
    const selectedColumnsRef = useRef<string[] | undefined>(selectedColumns);
    // Cache column types per table to avoid repeated DESCRIBE queries while tiles load
    const columnTypesRef = useRef<Record<string, Record<string, string>>>({});
    const [detectedColumns, setDetectedColumns] = useState<string[]>([]);
    // AbortController to cancel in-flight tile requests when table changes
    const tileAbortControllerRef = useRef<AbortController | null>(null);
    // Track MVT errors with a ref to allow protocol handler to report errors
    const mvtErrorRef = useRef<string | null>(null);

    // Store resolved column types under all identifier variants (schema.table, table)
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

            if (schema && baseName) {
                keys.add(`${schema}.${baseName}`);
            }

            keys.forEach(key => {
                columnTypesRef.current[key] = typeMap;
            });
        },
        [schema]
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

            if (schema && baseName) {
                keys.add(`${schema}.${baseName}`);
            }

            keys.forEach(key => {
                delete columnTypesRef.current[key];
            });
        },
        [schema]
    );

    // Use provided columns or detected columns
    const effectiveColumns = selectedColumns !== undefined ? selectedColumns : detectedColumns;
    const isApplyingCustomStyleRef = useRef<boolean>(false);
    const hasCustomStyleRef = useRef<boolean>(false);
    const customStyleRef = useRef<maplibregl.StyleSpecification | null>(null);
    const initialStyleRef = useRef<maplibregl.StyleSpecification | undefined>(initialStyle);

    // Keep refs updated
    useEffect(() => {
        selectedTableRef.current = selectedTable;
        selectedColumnsRef.current = effectiveColumns;
        initialStyleRef.current = initialStyle;
    }, [selectedTable, effectiveColumns, initialStyle]);

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

        // Abort any in-flight tile requests from the previous table/columns
        if (tileAbortControllerRef.current) {
            tileAbortControllerRef.current.abort();
        }
        // Create new AbortController for the new table/columns
        tileAbortControllerRef.current = new AbortController();

        // Clear tile cache to force refresh with new columns
        tileCache.current.clear();

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
            const errorMsg = `地図の表示範囲の調整中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`;
            console.error(errorMsg);
            setMvtError(errorMsg);
            mvtErrorRef.current = errorMsg;
        }
    }, []);

    // Auto-detect columns when table or selected columns change and maintain column type cache
    useEffect(() => {
        const updateSchemaInfo = async () => {
            if (!connectionRef.current || !selectedTable) {
                columnTypesRef.current = {};
                // Abort any in-flight tile requests when table is cleared
                if (tileAbortControllerRef.current) {
                    tileAbortControllerRef.current.abort();
                    tileAbortControllerRef.current = null;
                }
                return;
            }

            try {
                // Get table schema
                const schemaQuery = schema ? `DESCRIBE ${schema}.${selectedTable}` : `DESCRIBE ${selectedTable}`;
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
                    tileCache.current.clear();

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
                console.error('[Map] Failed to fetch schema info:', error);
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
        schema,
        geometryColumnName,
        isInitialized,
        cacheColumnTypes,
        removeCachedColumnTypes,
    ]);

    // Re-fit bounds when geometry column changes
    useEffect(() => {
        // Only fit to data if geometryColumnName is explicitly provided
        if (
            selectedTable &&
            geometryColumnName !== undefined &&
            mapRef.current &&
            connectionRef.current &&
            isInitialized
        ) {
            fitMapToData(selectedTable, geometryColumnName);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [geometryColumnName, selectedTable, dbContext]);

    // Track which tables have been initialized with default styles
    const initializedTablesRef = useRef<Set<string>>(new Set());

    // Function to update map layers dynamically
    const updateMapLayers = useCallback(
        (map: maplibregl.Map) => {
            updateMapLayersHelper({
                map,
                tables: tables || [],
                selectedTable,
                tableStyles,
                extraStyle,
                isApplyingCustomStyle: isApplyingCustomStyleRef.current,
                onTableStyleChanged,
                onExtraStyleChange,
                initializedTables: initializedTablesRef.current,
                styleManager: styleManagerRef.current,
                tileCache: tileCache.current,
            });

            // Zoom to data bounds when a new table is selected (only if geometryColumnName is provided)
            if (selectedTable && geometryColumnName !== undefined && connectionRef.current) {
                setTimeout(() => {
                    fitMapToData(selectedTable, geometryColumnName);
                }, 500); // Wait a bit for tiles to load
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [
            selectedTable,
            tables,
            geometryColumnName,
            dbContext,
            tableStyles,
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
            maplibregl.addProtocol('duckdb', async (params, abortController) => {
                // Parse URL: duckdb://[schema.]table/{z}/{x}/{y}.pbf
                const url = params.url.replace(/\.pbf$/, '.mvt'); // Convert extension for parsing
                const parseResult = parseDuckDBTileUrl(url);
                if (!parseResult) {
                    return { data: new Uint8Array() };
                }

                const { tableSpec, tableName, zxy } = parseResult;

                const cacheKey = `${tableSpec}/${zxy.z}/${zxy.x}/${zxy.y}`;

                // Capture the current abort controller at the start of this request
                // This ensures we check the correct controller even if tileAbortControllerRef.current changes
                const currentAbortController = tileAbortControllerRef.current;

                // Check if request should be aborted
                if (currentAbortController?.signal.aborted || abortController?.signal.aborted) {
                    return { data: new Uint8Array() };
                }

                // Check cache
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

                    const currentColumns = selectedColumnsRef.current || [];

                    if (!tableName) {
                        return { data: new Uint8Array() };
                    }

                    // Return empty tile if no geometry column is specified
                    if (!geometryColumnName) {
                        return { data: new Uint8Array() };
                    }

                    // Check abort signal again before expensive operations
                    if (currentAbortController?.signal.aborted || abortController?.signal.aborted) {
                        return { data: new Uint8Array() };
                    }

                    let columnTypeMap = columnTypesRef.current[tableName] || columnTypesRef.current[tableSpec];

                    if (!columnTypeMap) {
                        const describeTargets = new Set<string>();
                        if (schema) {
                            describeTargets.add(`${schema}.${tableName}`);
                        }
                        describeTargets.add(tableSpec);
                        describeTargets.add(tableName);

                        let fetchError: unknown = null;

                        for (const target of describeTargets) {
                            if (!target) {
                                continue;
                            }

                            try {
                                const describeResult = await connectionRef.current.query(`DESCRIBE ${target}`);
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
                    // Don't pass schema - connection already has schema context
                    const query = generateVectorTileQuery({
                        zxy,
                        selectedTable: tableName,
                        selectedColumns: currentColumns,
                        geometryColumnName,
                        schema: null, // Don't use URL-extracted schema
                        columnTypes: columnTypeMap,
                    });

                    // Final abort check before executing the query
                    if (currentAbortController?.signal.aborted || abortController?.signal.aborted) {
                        return { data: new Uint8Array() };
                    }

                    let result: Awaited<ReturnType<AsyncDuckDBConnection['query']>>;

                    try {
                        // Save connection reference for use in abort handler
                        const connection = connectionRef.current;

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

                        // Add abort listeners
                        if (currentAbortController?.signal) {
                            currentAbortController.signal.addEventListener('abort', abortHandler, {
                                once: true,
                            });
                        }
                        if (abortController?.signal) {
                            abortController.signal.addEventListener('abort', abortHandler, { once: true });
                        }

                        // Wait for query to complete
                        result = await queryPromise;

                        // Check if aborted after query completes
                        if (currentAbortController?.signal.aborted || abortController?.signal.aborted) {
                            return { data: new Uint8Array() };
                        }
                    } catch (error) {
                        // Silently ignore errors if we've been aborted
                        if (currentAbortController?.signal.aborted || abortController?.signal.aborted) {
                            return { data: new Uint8Array() };
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

                        return { data: new Uint8Array() };
                    }

                    if (result.numRows === 0) {
                        tileCache.current.set(cacheKey, new Uint8Array());
                        return { data: new Uint8Array() };
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
                            tileCache.current.set(cacheKey, new Uint8Array());
                            return { data: new Uint8Array() };
                        }
                    }

                    if (!rows || rows.length === 0 || !rows[0]) {
                        tileCache.current.set(cacheKey, new Uint8Array());
                        return { data: new Uint8Array() };
                    }

                    // The result should contain a single row with the MVT binary data
                    const mvtRow = rows[0] as { mvt: unknown };

                    // Process MVT data
                    const { cacheData, returnData } = processMVTResult(mvtRow.mvt);

                    // Cache the data
                    tileCache.current.set(cacheKey, cacheData);

                    return { data: returnData };
                } catch {
                    return { data: new Uint8Array() };
                }
            });
        } catch {
            // Failed to register protocol
        }
    }, [geometryColumnName, schema, cacheColumnTypes]);

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
                // Use schema-aware connection
                connectionRef.current = await dbContext.createManagedConnection(schema);
                if (!connectionRef.current) {
                    setMapError('Failed to connect to DuckDB');
                    return;
                }

                // Fetch schema information after connection is established
                if (selectedTable) {
                    try {
                        const schemaQuery = schema
                            ? `DESCRIBE ${schema}.${selectedTable}`
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
                            tileCache.current.clear();
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
                    // Abort any in-flight tile requests
                    if (tileAbortControllerRef.current) {
                        tileAbortControllerRef.current.abort();
                        tileAbortControllerRef.current = null;
                    }
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
            updateMapLayers(mapRef.current);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedTable, tables, effectiveColumns, tableStyles, extraStyle]);

    // Separate effect for onMapReady to avoid triggering re-initialization
    useEffect(() => {
        if (onMapReady && styleManagerRef.current && isInitialized) {
            onMapReady(styleManagerRef.current);
        }
    }, [onMapReady, isInitialized]);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
            <div
                id={mapId}
                style={{
                    width: '100%',
                    height: '100%',
                }}
            ></div>

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
                    Loading map...
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
                    Error: {mapError}
                </div>
            )}
            {mvtError && (
                <div
                    style={{
                        position: 'absolute',
                        top: '10px',
                        right: '10px',
                        background: 'rgba(255, 165, 0, 0.9)',
                        color: 'white',
                        padding: '12px 16px',
                        borderRadius: '8px',
                        maxWidth: '400px',
                        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
                        fontSize: '14px',
                        lineHeight: '1.5',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '8px',
                    }}
                >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                        <strong style={{ fontSize: '15px' }}>地図レンダリングエラー</strong>
                        <button
                            onClick={() => {
                                setMvtError(null);
                                mvtErrorRef.current = null;
                            }}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                cursor: 'pointer',
                                fontSize: '20px',
                                lineHeight: '1',
                                padding: '0',
                                marginLeft: '8px',
                            }}
                            title="Close"
                        >
                            ×
                        </button>
                    </div>
                    <div style={{ fontSize: '13px', opacity: 0.95 }}>{mvtError}</div>
                </div>
            )}
        </div>
    );
};

export default MapComponent;
