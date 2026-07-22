import { describe, expect, it } from 'vitest';

import { extensionForKind, extensionOf, readerCall, readerKindForUrl } from './fileReader';

describe('extensionOf', () => {
    it('reads the extension ignoring query and fragment', () => {
        expect(extensionOf('https://x/data.parquet')).toBe('parquet');
        expect(extensionOf('https://x/data.CSV?token=1')).toBe('csv');
        expect(extensionOf('https://x/a.geojson#frag')).toBe('geojson');
    });

    it('returns empty string when there is no extension', () => {
        expect(extensionOf('https://x/data')).toBe('');
    });
});

describe('readerKindForUrl', () => {
    it('maps known extensions', () => {
        expect(readerKindForUrl('a.parquet')).toBe('parquet');
        expect(readerKindForUrl('a.csv')).toBe('csv');
        expect(readerKindForUrl('a.tsv')).toBe('csv');
        expect(readerKindForUrl('a.json')).toBe('json');
        expect(readerKindForUrl('a.geojson')).toBe('geojson');
    });

    it('falls back to geojson (ST_Read) for unknown extensions', () => {
        expect(readerKindForUrl('a.shp')).toBe('geojson');
        expect(readerKindForUrl('a')).toBe('geojson');
    });
});

describe('readerCall', () => {
    it('builds the correct table function per kind', () => {
        expect(readerCall('parquet', 'f.parquet')).toBe("read_parquet('f.parquet')");
        expect(readerCall('csv', 'f.csv')).toBe("read_csv_auto('f.csv')");
        expect(readerCall('json', 'f.json')).toBe("read_json_auto('f.json')");
        expect(readerCall('geojson', 'f.geojson')).toBe("ST_Read('f.geojson')");
    });
});

describe('extensionForKind', () => {
    it('returns the canonical extension per kind', () => {
        expect(extensionForKind('parquet')).toBe('parquet');
        expect(extensionForKind('csv')).toBe('csv');
        expect(extensionForKind('json')).toBe('json');
        expect(extensionForKind('geojson')).toBe('geojson');
    });
});
