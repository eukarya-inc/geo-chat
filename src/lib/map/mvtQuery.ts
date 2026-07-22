/**
 * Builds the DuckDB SQL that turns a geometry table into a Mapbox Vector Tile
 * (MVT) blob, entirely in the browser via the spatial extension's `ST_AsMVT`.
 *
 * Simplified from the legacy implementation: single `main` schema, all
 * non-geometry columns are included automatically (capped), and there is no
 * manual column-selection step (which used to render nothing when empty).
 */

export interface TileCoord {
    z: number;
    x: number;
    y: number;
}

export interface TileColumn {
    name: string;
    type: string;
}

export interface VectorTileQueryParams {
    table: string;
    geometryColumn: string;
    /** All non-geometry columns of the table (with DuckDB types). */
    columns: TileColumn[];
    zxy: TileCoord;
    /** Per-tile feature cap to keep serialization bounded. */
    featureLimit?: number;
    /** Wide tables are capped to the first N attribute columns. */
    maxColumns?: number;
}

const DEFAULT_FEATURE_LIMIT = 50000;
const DEFAULT_MAX_COLUMNS = 30;

/** ST_AsMVT only accepts VARCHAR/FLOAT/DOUBLE/INTEGER/BIGINT/BOOLEAN values. */
function shouldStringifyColumn(columnType: string): boolean {
    const t = columnType.toUpperCase();
    return (
        t.includes('STRUCT') ||
        t.includes('LIST') ||
        t.includes('[]') ||
        t.includes('MAP') ||
        t.includes('JSON') ||
        t.includes('UNION')
    );
}

/** Integer types ST_AsMVT can't serialize are cast up to INTEGER/BIGINT. */
function integerCastTarget(columnType: string): 'INTEGER' | 'BIGINT' | null {
    const t = columnType.toUpperCase();
    if (t === 'TINYINT' || t === 'SMALLINT' || t === 'UTINYINT' || t === 'USMALLINT') return 'INTEGER';
    if (t === 'HUGEINT' || t === 'UHUGEINT' || t === 'UINTEGER' || t === 'UBIGINT') return 'BIGINT';
    return null;
}

/** Zoom-dependent simplification tolerance (larger when zoomed out). */
export function calculateSimplifyTolerance(zoom: number): number {
    if (zoom >= 15) return 0;
    const maxSimplify = 0.001;
    const tolerance = (-maxSimplify / 15) * zoom + maxSimplify;
    return Number(tolerance.toFixed(6));
}

function columnValueExpression(col: TileColumn): string {
    if (shouldStringifyColumn(col.type)) return `TRY_CAST("${col.name}" AS VARCHAR)`;
    const cast = integerCastTarget(col.type);
    return cast ? `TRY_CAST("${col.name}" AS ${cast})` : `"${col.name}"`;
}

/**
 * Generates the MVT SQL for one tile. Uses the axis-order trap fix: EPSG:4326
 * defaults to lat,lon, so ST_Transform's 4th `always_xy` argument forces lon,lat.
 */
export function generateVectorTileQuery(params: VectorTileQueryParams): string {
    const {
        table,
        geometryColumn,
        columns,
        zxy,
        featureLimit = DEFAULT_FEATURE_LIMIT,
        maxColumns = DEFAULT_MAX_COLUMNS,
    } = params;

    if (!geometryColumn) throw new Error('geometryColumn is required for vector tile generation');

    const simplify = calculateSimplifyTolerance(zxy.z);
    const geom = geometryColumn;

    const columnList = columns
        .slice(0, maxColumns)
        .map(col => `'${col.name.replace(/'/g, "''")}': ${columnValueExpression(col)}`)
        .join(', ');

    const structColumns = `{
        'geometry': ST_AsMVTGeom(
            ST_Transform(ST_SimplifyPreserveTopology("${geom}", ${simplify}), 'EPSG:4326', 'EPSG:3857', true),
            ST_Extent(ST_TileEnvelope(${zxy.z}, ${zxy.x}, ${zxy.y})),
            4096,
            0,
            false
        )${columnList ? `, ${columnList}` : ''}
    }`;

    return `
        WITH tile_data AS (
            SELECT ${structColumns} AS feature
            FROM "${table}"
            WHERE "${geom}" IS NOT NULL
                AND ST_Intersects(
                    ST_Transform("${geom}", 'EPSG:4326', 'EPSG:3857', true),
                    ST_TileEnvelope(${zxy.z}, ${zxy.x}, ${zxy.y})
                )
            LIMIT ${featureLimit}
        )
        SELECT ST_AsMVT(feature, 'default', 4096, 'geometry') AS mvt
        FROM tile_data
        WHERE feature.geometry IS NOT NULL
            AND NOT ST_IsEmpty(feature.geometry)
    `;
}
