/**
 * Utilities for generating and handling Mapbox Vector Tiles (MVT)
 */
export interface QueryParams {
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

/**
 * Generate SQL query for creating MVT using ST_AsMVT
 *
 * IMPORTANT: Uses the axis order trap fix - EPSG:4326 defaults to lat,lon order
 * but data is typically stored as lon,lat. The 4th parameter 'true' in ST_Transform
 * forces always_xy mode to ensure lon,lat order.
 */
export function generateVectorTileQuery(params: QueryParams): string {
    const { zxy, selectedTable, selectedColumns, geometryColumnName } = params;
    const simplify = calculateSimplifyTolerance(zxy.z);
    const geomCol = geometryColumnName || 'geometry';

    // Don't use schema-qualified table name - connection already has schema context
    const qualifiedTableName = selectedTable;

    // Build column selection for the struct
    // Use TRY_CAST to safely convert complex types to VARCHAR (JSON string) for ST_AsMVT compatibility
    const columnList = selectedColumns.map(col => `'${col}': TRY_CAST("${col}" AS VARCHAR)`).join(', ');

    const structColumns = `{
        'geometry': ST_AsMVTGeom(
            ST_Transform(ST_Simplify("${geomCol}", ${simplify}), 'EPSG:4326', 'EPSG:3857', true),
            ST_Extent(ST_TileEnvelope(${zxy.z}, ${zxy.x}, ${zxy.y})),
            4096,
            256,
            false
        )${columnList ? `, ${columnList}` : ''}
    }`;

    return `
        WITH tile_data AS (
            SELECT ${structColumns} AS feature
            FROM ${qualifiedTableName}
            WHERE "${geomCol}" IS NOT NULL
                AND ST_Intersects(
                    ST_Transform("${geomCol}", 'EPSG:4326', 'EPSG:3857', true),
                    ST_TileEnvelope(${zxy.z}, ${zxy.x}, ${zxy.y})
                )
            LIMIT 10000  -- Limit features per tile to prevent serialization issues
        )
        SELECT ST_AsMVT(
            feature,
            'default',
            4096,
            'geometry'
        ) AS mvt
        FROM tile_data
        WHERE feature.geometry IS NOT NULL
    `;
}

/**
 * Calculate simplification tolerance based on zoom level
 */
export function calculateSimplifyTolerance(zoomLevel: number): number {
    // Zoom level 15 and above have no simplification
    if (zoomLevel >= 15) return 0;

    // For zoom levels from 0 to 15, linearly changing from 0.001 to 0
    // The lower the zoom level (wider view), the larger the value
    const maxSimplify = 0.001;
    const minZoom = 0;
    const maxZoom = 15;

    // Linear interpolation: y = mx + b
    // m = (y2 - y1) / (x2 - x1)
    // Here, x1=15, y1=0, x2=0, y2=0.001
    const m = (0 - maxSimplify) / (maxZoom - minZoom);
    const b = maxSimplify;

    const simplify = m * zoomLevel + b;

    return Number(simplify.toFixed(6));
}

/**
 * Process MVT data from DuckDB result
 * Handles the Uint8Array conversion and creates safe copies for caching
 */
export function processMVTResult(mvtData: unknown): {
    vectorTile: Uint8Array | null;
    cacheData: Uint8Array;
    returnData: Uint8Array;
} {
    // DuckDB returns MVT data as Uint8Array directly
    const vectorTile = mvtData as Uint8Array;

    if (!vectorTile || vectorTile.length === 0) {
        const emptyData = new Uint8Array();
        return {
            vectorTile: null,
            cacheData: emptyData,
            returnData: emptyData,
        };
    }

    // Create a safe copy to avoid ArrayBuffer detachment issues
    // Handle case where Uint8Array might be a view on a larger buffer
    const safeVectorTile = new Uint8Array(vectorTile.buffer.slice(vectorTile.byteOffset, vectorTile.byteOffset + vectorTile.byteLength));

    // Return separate copies for cache and MapLibre to avoid shared buffer issues
    return {
        vectorTile: safeVectorTile,
        cacheData: safeVectorTile,
        returnData: new Uint8Array(safeVectorTile),
    };
}

/**
 * Parse DuckDB tile URL to extract table and tile coordinates
 * Format: duckdb://[schema.]table/{z}/{x}/{y}.mvt
 */
export function parseDuckDBTileUrl(url: string): { tableSpec: string; tableName: string; zxy: { z: number; x: number; y: number } } | null {
    const match = url.match(/^duckdb:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
    if (!match) {
        console.error('Invalid DuckDB URL format:', url);
        return null;
    }

    const [, tableSpec, z, x, y] = match;
    const zxy = { z: parseInt(z), x: parseInt(x), y: parseInt(y) };

    // Parse schema.table or just table
    const tableParts = tableSpec.split('.');
    const tableName = tableParts.length === 2 ? tableParts[1] : tableSpec;

    return { tableSpec, tableName, zxy };
}
