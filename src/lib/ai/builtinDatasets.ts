/**
 * Sample datasets bundled with the app (served from `public/data/`). The agent is
 * told about these in the system prompt and can load one on request with the
 * `load_builtin_dataset` tool — the user no longer has to paste a URL first.
 *
 * Workshop extension point: add an entry here and the agent instantly knows about
 * the dataset and can load it. No other code change is needed.
 */
export interface BuiltinDataset {
    /** Table name created in DuckDB when the dataset is loaded. */
    table: string;
    /** Same-origin URL of the Parquet file (under the app's BASE_URL). */
    url: string;
    /** Human/model-readable description: what it is and its columns. */
    description: string;
}

export const BUILTIN_DATASETS: BuiltinDataset[] = [
    {
        table: 'japan_cities',
        url: `${import.meta.env.BASE_URL}data/japan_cities.parquet`,
        description:
            'Japanese municipalities (市区町村) polygons, GeoParquet. Columns: city (VARCHAR, city/county name), ' +
            'ward (VARCHAR, ward or subdivision), code (VARCHAR, JIS municipality code), ' +
            'prefecture (VARCHAR, prefecture name), geom (GEOMETRY, WGS84).',
    },
    {
        table: 'japan_prefectures',
        url: `${import.meta.env.BASE_URL}data/japan_prefectures.parquet`,
        description:
            'Japanese prefectures (都道府県) polygons, GeoParquet. Columns: fid (INTEGER, feature id), ' +
            'N03_001 (VARCHAR, prefecture name), geom (GEOMETRY, WGS84).',
    },
];

/** Looks up a built-in dataset by its table name. */
export function findBuiltinDataset(table: string): BuiltinDataset | undefined {
    return BUILTIN_DATASETS.find(d => d.table === table);
}
