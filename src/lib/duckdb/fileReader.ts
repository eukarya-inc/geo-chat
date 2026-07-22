/**
 * Pure helpers for choosing how DuckDB should read a file, based on its URL
 * extension. Kept side-effect free so it can be unit tested without a DB.
 */

export type ReaderKind = 'parquet' | 'csv' | 'json' | 'geojson';

/** Lowercased file extension of a URL, ignoring query string and fragment. */
export function extensionOf(url: string): string {
    const path = url.split('#')[0].split('?')[0];
    const base = path.split('/').pop() ?? '';
    const dot = base.lastIndexOf('.');
    return dot >= 0 ? base.slice(dot + 1).toLowerCase() : '';
}

/**
 * Picks a reader kind from the URL extension.
 * Unknown extensions fall back to `geojson` (ST_Read / GDAL) since it handles
 * the widest range of spatial formats.
 */
export function readerKindForUrl(url: string): ReaderKind {
    switch (extensionOf(url)) {
        case 'parquet':
            return 'parquet';
        case 'csv':
        case 'tsv':
            return 'csv';
        case 'json':
            return 'json';
        case 'geojson':
            return 'geojson';
        default:
            return 'geojson';
    }
}

/** Builds the SQL FROM-clause table function call for a reader kind and path. */
export function readerCall(kind: ReaderKind, path: string): string {
    const arg = `'${path}'`;
    switch (kind) {
        case 'parquet':
            return `read_parquet(${arg})`;
        case 'csv':
            return `read_csv_auto(${arg})`;
        case 'json':
            return `read_json_auto(${arg})`;
        case 'geojson':
            return `ST_Read(${arg})`;
    }
}

/** Canonical file extension used when registering a buffer for a reader kind. */
export function extensionForKind(kind: ReaderKind): string {
    switch (kind) {
        case 'parquet':
            return 'parquet';
        case 'csv':
            return 'csv';
        case 'json':
            return 'json';
        case 'geojson':
            return 'geojson';
    }
}
