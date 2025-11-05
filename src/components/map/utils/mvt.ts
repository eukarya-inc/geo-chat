/**
 * Utilities for generating and handling Mapbox Vector Tiles (MVT)
 */
import { parseDuckDBUrl } from '../../../utils/schema';

export interface QueryParams {
    zxy: {
        z: number;
        x: number;
        y: number;
    };
    selectedTable: string;
    selectedColumns: string[];
    geometryColumnName?: string;
    chatId?: string | null;
    columnTypes?: Record<string, string>;
}

/**
 * Determine whether a column type should be stringified for MVT compatibility
 */
function shouldStringifyColumn(columnType?: string | null): boolean {
    if (!columnType) {
        return false;
    }

    const upperType = columnType.toUpperCase();

    // STRUCT, LIST (aka arrays), MAP, JSON and UNION types must be stringified
    if (
        upperType.includes('STRUCT') ||
        upperType.includes('LIST') ||
        upperType.includes('[]') ||
        upperType.includes('MAP') ||
        upperType.includes('JSON') ||
        upperType.includes('UNION')
    ) {
        return true;
    }

    return false;
}

/**
 * Generate SQL query for creating MVT using ST_AsMVT
 *
 * IMPORTANT: Uses the axis order trap fix - EPSG:4326 defaults to lat,lon order
 * but data is typically stored as lon,lat. The 4th parameter 'true' in ST_Transform
 * forces always_xy mode to ensure lon,lat order.
 */
export function generateVectorTileQuery(params: QueryParams): string {
    const { zxy, selectedTable, selectedColumns, geometryColumnName, columnTypes } = params;

    // geometryColumnName is required - throw error if not provided
    if (!geometryColumnName) {
        throw new Error('geometryColumnName is required for vector tile generation');
    }

    const simplify = calculateSimplifyTolerance(zxy.z);
    const geomCol = geometryColumnName;

    // Don't use schema-qualified table name - connection already has schema context
    const qualifiedTableName = selectedTable;

    // Build column selection for the struct
    // Use TRY_CAST to safely convert complex types to VARCHAR (JSON string) for ST_AsMVT compatibility
    const columnList = selectedColumns
        .map(col => {
            const columnType = columnTypes?.[col];
            const structKey = col.replace(/'/g, "''"); // Escape single quotes for SQL string literal keys
            const valueExpression = shouldStringifyColumn(columnType) ? `TRY_CAST("${col}" AS VARCHAR)` : `"${col}"`;

            return `'${structKey}': ${valueExpression}`;
        })
        .join(', ');

    const structColumns = `{
        'geometry': ST_AsMVTGeom(
            ST_Transform(ST_SimplifyPreserveTopology("${geomCol}", ${simplify}), 'EPSG:4326', 'EPSG:3857', true),
            ST_Extent(ST_TileEnvelope(${zxy.z}, ${zxy.x}, ${zxy.y})),
            4096,
            0,
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
            LIMIT 50000  -- Limit features per tile to prevent serialization issues
        )
        SELECT ST_AsMVT(
            feature,
            'default',
            4096,
            'geometry'
        ) AS mvt
        FROM tile_data
        WHERE feature.geometry IS NOT NULL
            AND NOT ST_IsEmpty(feature.geometry)
    `;
}

/**
 * Calculate simplification tolerance based on zoom level
 * Enhanced for better performance with complex geometries (e.g., municipality polygons)
 */
export function calculateSimplifyTolerance(zoomLevel: number): number {
    // Zoom level 15 and above have no simplification
    if (zoomLevel >= 15) return 0;

    // Enhanced simplification with exponential curve for better performance
    // Low zoom levels (wide view) get much more aggressive simplification
    // This significantly speeds up rendering of complex polygons like municipalities

    // Zoom 0-5: Very aggressive simplification (0.01 - 0.005)
    if (zoomLevel <= 5) {
        return 0.01 - zoomLevel * 0.001;
    }

    // Zoom 6-10: Moderate simplification (0.005 - 0.001)
    if (zoomLevel <= 10) {
        return 0.005 - (zoomLevel - 5) * 0.0008;
    }

    // Zoom 11-14: Light simplification (0.001 - 0)
    const maxSimplify = 0.001;
    const minZoom = 11;
    const maxZoom = 15;
    const m = (0 - maxSimplify) / (maxZoom - minZoom);
    const b = maxSimplify * ((maxZoom - minZoom) / (maxZoom - minZoom)) + (maxSimplify * minZoom) / (maxZoom - minZoom);
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
    const safeVectorTile = new Uint8Array(
        vectorTile.buffer.slice(vectorTile.byteOffset, vectorTile.byteOffset + vectorTile.byteLength)
    );

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
export function parseDuckDBTileUrl(
    url: string
): { tableSpec: string; tableName: string; zxy: { z: number; x: number; y: number } } | null {
    const match = url.match(/^duckdb:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
    if (!match) {
        console.error('Invalid DuckDB URL format:', url);
        return null;
    }

    const [, tableSpec, z, x, y] = match;
    const zxy = { z: parseInt(z), x: parseInt(x), y: parseInt(y) };

    // Parse schema.table using shared utility
    const baseUrl = `duckdb://${tableSpec}`;
    const parsed = parseDuckDBUrl(baseUrl);
    if (!parsed) {
        console.error('Failed to parse table spec:', tableSpec);
        return null;
    }

    const tableName = parsed.tableName;

    return { tableSpec, tableName, zxy };
}
