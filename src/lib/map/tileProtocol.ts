import maplibregl from 'maplibre-gl';

import { getTileBytes } from '@/lib/duckdb/db';
import { attributeColumns, detectGeometryColumn } from './geometry';
import { generateVectorTileQuery, type TileColumn } from './mvtQuery';
import { TileCache } from './tileCache';

export const TILE_PROTOCOL = 'duckdb';

/** MapLibre vector-source tile URL template for a table. */
export function tileUrlTemplate(table: string): string {
    return `${TILE_PROTOCOL}://${encodeURIComponent(table)}/{z}/{x}/{y}.mvt`;
}

interface TableTileInfo {
    geometryColumn: string | null;
    columns: TileColumn[];
}

const infoCache = new Map<string, Promise<TableTileInfo>>();
const tileCaches = new Map<string, TileCache>();
let registered = false;

function cacheFor(table: string): TileCache {
    let cache = tileCaches.get(table);
    if (!cache) {
        cache = new TileCache();
        tileCaches.set(table, cache);
    }
    return cache;
}

async function tableInfo(table: string): Promise<TableTileInfo> {
    let pending = infoCache.get(table);
    if (!pending) {
        pending = (async () => ({
            geometryColumn: await detectGeometryColumn(table),
            columns: await attributeColumns(table),
        }))();
        infoCache.set(table, pending);
    }
    return pending;
}

/** Drops cached schema + rendered tiles for a table (call when its data changes). */
export function invalidateTable(table: string): void {
    infoCache.delete(table);
    tileCaches.get(table)?.clear();
}

function parseTileUrl(url: string): { table: string; z: number; x: number; y: number } | null {
    const match = url.match(/^duckdb:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.mvt$/);
    if (!match) return null;
    return {
        table: decodeURIComponent(match[1]),
        z: Number(match[2]),
        x: Number(match[3]),
        y: Number(match[4]),
    };
}

/** Registers the `duckdb://` MapLibre protocol once per session. */
export function registerTileProtocol(): void {
    if (registered) return;
    registered = true;

    maplibregl.addProtocol(TILE_PROTOCOL, async params => {
        const parsed = parseTileUrl(params.url);
        if (!parsed) return { data: new Uint8Array() };

        const { table, z, x, y } = parsed;
        const cache = cacheFor(table);
        const key = `${z}/${x}/${y}`;

        const cached = cache.get(key);
        if (cached) return { data: cached };

        try {
            const info = await tableInfo(table);
            if (!info.geometryColumn) return { data: new Uint8Array() };

            const sql = generateVectorTileQuery({
                table,
                geometryColumn: info.geometryColumn,
                columns: info.columns,
                zxy: { z, x, y },
            });
            const bytes = (await getTileBytes(sql)) ?? new Uint8Array();
            cache.set(key, bytes);
            return { data: new Uint8Array(bytes) };
        } catch (err) {
            console.error('[duckdb tile]', err);
            return { data: new Uint8Array() };
        }
    });
}
