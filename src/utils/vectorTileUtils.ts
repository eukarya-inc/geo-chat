import { Feature, GeoJsonProperties, Geometry } from 'geojson';
import geojsonvt from 'geojson-vt';
import vtpbf from 'vt-pbf';

export function geojsonToVectorTile(
    features: Feature<Geometry, GeoJsonProperties>[],
    z: number,
    x: number,
    y: number
): Uint8Array {
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
        return new Uint8Array();
    }

    // vt-pbfでベクトルタイルをバイナリに変換
    // source-layer名を"v"として設定
    return vtpbf.fromGeojsonVt({ "v": tile }, { version: 2 });
}
