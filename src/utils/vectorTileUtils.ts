import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

export function geojsonToVectorTile(
    features: Feature<Geometry, GeoJsonProperties>[],
    z: number,
    x: number,
    y: number
): Uint8Array {
    // Debug: Check first few features
    if (features.length > 0) {
        console.log(`Vector tile generation for z=${z}, x=${x}, y=${y}`);
        console.log('First feature properties:', features[0].properties);
        console.log('Total features:', features.length);
    }

    // geojson-vtでGeoJSONをベクトルタイルに変換
    const tileIndex = geojsonvt({
        type: 'FeatureCollection',
        features: features
    }, {
        generateId: true,
        indexMaxZoom: z,
        maxZoom: z,
        buffer: 0,
        tolerance: 0,
        extent: 4096
    });

    // 指定されたタイルを取得
    const tile = tileIndex.getTile(z, x, y);
    if (!tile) {
        console.log('No tile found for coordinates:', { z, x, y });
        return new Uint8Array();
    }

    // Debug: Check tile features
    if (tile.features && tile.features.length > 0) {
        console.log('Tile features count:', tile.features.length);
        console.log('First tile feature:', tile.features[0]);
        if (tile.features[0].tags) {
            console.log('First tile feature tags:', tile.features[0].tags);
        }
    }

    // vt-pbfでベクトルタイルをバイナリに変換
    // source-layer名を"v"として設定
    return vtpbf.fromGeojsonVt({ "v": tile });
}
