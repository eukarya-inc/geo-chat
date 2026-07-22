import { executeQuery, getTableSchema } from '@/lib/duckdb/db';
import type { GeometryKind } from './mapSpec';

export type LngLatBounds = [[number, number], [number, number]];

/** Maps a DuckDB `ST_GeometryType` string to one of our three style families. */
export function geometryKindFromType(stGeometryType: string): GeometryKind {
    const t = stGeometryType.toUpperCase();
    if (t.includes('POLYGON')) return 'polygon';
    if (t.includes('LINESTRING') || t.includes('LINE')) return 'line';
    return 'point';
}

/** Returns the name of the first GEOMETRY column, or null if the table has none. */
export async function detectGeometryColumn(table: string): Promise<string | null> {
    const schema = await getTableSchema(table);
    const geom = schema.find(c => c.type.toUpperCase().includes('GEOMETRY'));
    return geom ? geom.name : null;
}

/** Attribute (non-geometry) columns of a table. */
export async function attributeColumns(table: string): Promise<{ name: string; type: string }[]> {
    const schema = await getTableSchema(table);
    return schema.filter(c => !c.type.toUpperCase().includes('GEOMETRY'));
}

/** Samples geometries to decide whether to draw points, lines, or polygons. */
export async function detectGeometryKind(table: string, geometryColumn: string): Promise<GeometryKind> {
    const res = await executeQuery(
        `SELECT ST_GeometryType("${geometryColumn}") AS gtype FROM "${table}"
         WHERE "${geometryColumn}" IS NOT NULL LIMIT 1`
    );
    const gtype = res.rows[0]?.gtype;
    return typeof gtype === 'string' ? geometryKindFromType(gtype) : 'point';
}

/**
 * Computes lon/lat bounds for a table's geometry. Returns null when there is no
 * valid geometry or when coordinates fall outside geographic ranges (a strong
 * hint the data is in a projected CRS rather than EPSG:4326).
 */
export async function getTableBounds(table: string, geometryColumn: string): Promise<LngLatBounds | null> {
    const res = await executeQuery(
        `WITH b AS (
            SELECT ST_Envelope("${geometryColumn}") AS env
            FROM "${table}" WHERE "${geometryColumn}" IS NOT NULL
        )
        SELECT MIN(ST_XMin(env)) AS min_lng, MAX(ST_XMax(env)) AS max_lng,
               MIN(ST_YMin(env)) AS min_lat, MAX(ST_YMax(env)) AS max_lat
        FROM b`
    );
    const row = res.rows[0] as { min_lng: number; max_lng: number; min_lat: number; max_lat: number } | undefined;
    if (!row || row.min_lng == null) return null;

    const validLng = (v: number) => v >= -180 && v <= 180;
    const validLat = (v: number) => v >= -90 && v <= 90;
    if (!validLng(row.min_lng) || !validLng(row.max_lng) || !validLat(row.min_lat) || !validLat(row.max_lat)) {
        return null;
    }
    return [
        [row.min_lng, row.min_lat],
        [row.max_lng, row.max_lat],
    ];
}
