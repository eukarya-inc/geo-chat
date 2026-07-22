import maplibregl, { type StyleSpecification } from 'maplibre-gl';

import { buildLayer, type TableMapStyle } from '@/lib/map/mapSpec';
import { tileUrlTemplate } from '@/lib/map/tileProtocol';

export const SOURCE_ID = 'duckdb-table';
export const LAYER_ID = 'duckdb-layer';

/** OSM raster basemap style. */
export const BASE_STYLE: StyleSpecification = {
    version: 8,
    sources: {
        osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '© OpenStreetMap contributors',
        },
    },
    layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

/** Adds (or replaces) the vector tile source for the given table. */
export function setTableSource(map: maplibregl.Map, table: string): void {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
    map.addSource(SOURCE_ID, {
        type: 'vector',
        tiles: [tileUrlTemplate(table)],
        minzoom: 0,
        maxzoom: 22,
    });
}

/** Removes the table layer and source (used when a table has no geometry). */
export function clearTableSource(map: maplibregl.Map): void {
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID);
}

/** Adds (or replaces) the styled layer on top of the current source. */
export function setTableLayer(map: maplibregl.Map, style: TableMapStyle): void {
    if (!map.getSource(SOURCE_ID)) return;
    if (map.getLayer(LAYER_ID)) map.removeLayer(LAYER_ID);
    map.addLayer(buildLayer(LAYER_ID, SOURCE_ID, style));
}
