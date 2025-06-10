import { describe, test, expect } from 'vitest';
import { getTileEnvelope, getZxyFromUrl } from './tileUtils';

describe('getTileEnvelope', () => {
    test('should calculate correct bounds for zoom level 0', () => {
        const result = getTileEnvelope(0, 0, 0);
        expect(result.minLng).toBeCloseTo(-180, 6);
        expect(result.minLat).toBeCloseTo(-85.05112877980659, 13);
        expect(result.maxLng).toBeCloseTo(180, 6);
        expect(result.maxLat).toBeCloseTo(85.05112877980659, 13);
    });

    test('should calculate correct bounds for zoom level 1', () => {
        const result = getTileEnvelope(1, 1, 1);
        expect(result.minLng).toBeCloseTo(0, 6);
        expect(result.minLat).toBeCloseTo(-85.05112877980659, 13);
        expect(result.maxLng).toBeCloseTo(180, 6);
        expect(result.maxLat).toBeCloseTo(0, 6);
    });

    test('should calculate correct bounds for zoom level 2', () => {
        const result = getTileEnvelope(2, 2, 2);
        expect(result.minLng).toBeCloseTo(0, 6);
        expect(result.minLat).toBeCloseTo(-66.51326044311186, 13);
        expect(result.maxLng).toBeCloseTo(90, 6);
        expect(result.maxLat).toBeCloseTo(0, 6);
    });

    test('should handle negative tile coordinates', () => {
        const result = getTileEnvelope(1, -1, -1);
        expect(result.minLng).toBeCloseTo(-360, 6);
        expect(result.minLat).toBeCloseTo(85.05112877980659, 13);
        expect(result.maxLng).toBeCloseTo(-180, 6);
        expect(result.maxLat).toBeCloseTo(89.7860070747368, 13);
    });

    test('should handle edge cases', () => {
        const result = getTileEnvelope(0, 0, 0);
        // 経度の範囲は常に-180から180
        expect(result.minLng).toBeCloseTo(-180, 6);
        // 緯度の範囲は常に-85.05112877980659から85.05112877980659
        expect(result.minLat).toBeCloseTo(-85.05112877980659, 13);
        expect(result.maxLng).toBeCloseTo(180, 6);
        expect(result.maxLat).toBeCloseTo(85.05112877980659, 13);
    });
});

describe('getZxyFromUrl', () => {
    test('should parse valid tile URL', () => {
        const url = 'duckdb-vector://12/3456/7890.pbf';
        const result = getZxyFromUrl(url);
        expect(result).toEqual({
            z: 12,
            x: 3456,
            y: 7890
        });
    });

    test('should handle URL with query parameters', () => {
        const url = 'duckdb-vector://12/3456/7890.pbf?param=value';
        const result = getZxyFromUrl(url);
        expect(result).toEqual({
            z: 12,
            x: 3456,
            y: 7890
        });
    });

    test('should return undefined for invalid URL format', () => {
        const url = 'invalid-url';
        const result = getZxyFromUrl(url);
        expect(result).toBeUndefined();
    });

    test('should return undefined for URL with insufficient parts', () => {
        const url = 'duckdb-vector://12/3456.pbf';
        const result = getZxyFromUrl(url);
        expect(result).toBeUndefined();
    });

    test('should handle URL with extra slashes', () => {
        const url = 'duckdb-vector:///12/3456/7890.pbf';
        const result = getZxyFromUrl(url);
        expect(result).toEqual({
            z: 12,
            x: 3456,
            y: 7890
        });
    });
});
