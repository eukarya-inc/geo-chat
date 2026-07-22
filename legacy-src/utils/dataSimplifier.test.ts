import { describe, it, expect } from 'vitest';
import { isGeometryType, simplifyValue, simplifyDataForAI } from './dataSimplifier';

describe('dataSimplifier', () => {
    describe('isGeometryType', () => {
        it('should return true for geometry types', () => {
            expect(isGeometryType('GEOMETRY')).toBe(true);
            expect(isGeometryType('POINT')).toBe(true);
            expect(isGeometryType('LINESTRING')).toBe(true);
            expect(isGeometryType('POLYGON')).toBe(true);
            expect(isGeometryType('MULTIPOINT')).toBe(true);
            expect(isGeometryType('MULTILINESTRING')).toBe(true);
            expect(isGeometryType('MULTIPOLYGON')).toBe(true);
            expect(isGeometryType('GEOMETRYCOLLECTION')).toBe(true);
        });

        it('should return true for geometry types with case variations', () => {
            expect(isGeometryType('geometry')).toBe(true);
            expect(isGeometryType('Point')).toBe(true);
            expect(isGeometryType('LINESTRING()')).toBe(true);
        });

        it('should return false for non-geometry types', () => {
            expect(isGeometryType('INTEGER')).toBe(false);
            expect(isGeometryType('VARCHAR')).toBe(false);
            expect(isGeometryType('DOUBLE')).toBe(false);
            expect(isGeometryType('BLOB')).toBe(false);
        });

        it('should return false for undefined or empty string', () => {
            expect(isGeometryType(undefined)).toBe(false);
            expect(isGeometryType('')).toBe(false);
        });
    });

    describe('simplifyValue', () => {
        it('should return null for null or undefined', () => {
            expect(simplifyValue(null)).toBe(null);
            expect(simplifyValue(undefined)).toBe(null);
        });

        it('should simplify geometry types to [Geometry]', () => {
            const binaryData = new Uint8Array([1, 2, 3, 4, 5]);
            expect(simplifyValue(binaryData, 'GEOMETRY')).toBe('[Geometry]');
            expect(simplifyValue(binaryData, 'POINT')).toBe('[Geometry]');
            expect(simplifyValue(binaryData, 'POLYGON')).toBe('[Geometry]');
        });

        it('should simplify Uint8Array blobs with size information', () => {
            const smallBlob = new Uint8Array(512);
            expect(simplifyValue(smallBlob, 'BLOB')).toBe('[Blob: 512B]');

            const mediumBlob = new Uint8Array(2048);
            expect(simplifyValue(mediumBlob, 'BLOB')).toBe('[Blob: 2.0KB]');

            const largeBlob = new Uint8Array(2 * 1024 * 1024);
            expect(simplifyValue(largeBlob, 'BLOB')).toBe('[Blob: 2.0MB]');
        });

        it('should simplify ArrayBuffer blobs', () => {
            const buffer = new ArrayBuffer(1024);
            expect(simplifyValue(buffer, 'BLOB')).toBe('[Blob: 1.0KB]');
        });

        it('should simplify objects with byteLength property', () => {
            const blobLike = { byteLength: 2048, other: 'data' };
            expect(simplifyValue(blobLike, 'BLOB')).toBe('[Blob: 2.0KB]');
        });

        it('should return empty blob placeholder for zero-length blobs', () => {
            const emptyBlob = new Uint8Array(0);
            expect(simplifyValue(emptyBlob, 'BLOB')).toBe('[Blob]');
        });

        it('should return non-binary values as-is', () => {
            expect(simplifyValue('test string', 'VARCHAR')).toBe('test string');
            expect(simplifyValue(42, 'INTEGER')).toBe(42);
            expect(simplifyValue(3.14, 'DOUBLE')).toBe(3.14);
            expect(simplifyValue(true, 'BOOLEAN')).toBe(true);
        });

        it('should handle objects without geometry or blob type', () => {
            const obj = { name: 'test', value: 123 };
            expect(simplifyValue(obj, 'JSON')).toEqual(obj);
        });
    });

    describe('simplifyDataForAI', () => {
        it('should simplify geometry columns in data rows', () => {
            const data = [
                { id: 1, name: 'Point A', geom: new Uint8Array([1, 2, 3]) },
                { id: 2, name: 'Point B', geom: new Uint8Array([4, 5, 6]) },
            ];

            const schema = [
                { column_name: 'id', column_type: 'INTEGER' },
                { column_name: 'name', column_type: 'VARCHAR' },
                { column_name: 'geom', column_type: 'GEOMETRY' },
            ];

            const result = simplifyDataForAI(data, schema);

            expect(result).toEqual([
                { id: 1, name: 'Point A', geom: '[Geometry]' },
                { id: 2, name: 'Point B', geom: '[Geometry]' },
            ]);
        });

        it('should simplify blob columns in data rows', () => {
            const data = [
                { id: 1, data: new Uint8Array(512) },
                { id: 2, data: new Uint8Array(2048) },
            ];

            const schema = [
                { column_name: 'id', column_type: 'INTEGER' },
                { column_name: 'data', column_type: 'BLOB' },
            ];

            const result = simplifyDataForAI(data, schema);

            expect(result).toEqual([
                { id: 1, data: '[Blob: 512B]' },
                { id: 2, data: '[Blob: 2.0KB]' },
            ]);
        });

        it('should preserve non-binary columns', () => {
            const data = [
                { id: 1, name: 'Test', value: 100, active: true },
                { id: 2, name: 'Another', value: 200, active: false },
            ];

            const schema = [
                { column_name: 'id', column_type: 'INTEGER' },
                { column_name: 'name', column_type: 'VARCHAR' },
                { column_name: 'value', column_type: 'DOUBLE' },
                { column_name: 'active', column_type: 'BOOLEAN' },
            ];

            const result = simplifyDataForAI(data, schema);

            expect(result).toEqual(data);
        });

        it('should handle mixed columns with geometry, blob, and regular data', () => {
            const data = [
                {
                    id: 1,
                    name: 'Prefecture',
                    geom: new Uint8Array([1, 2, 3, 4]),
                    image: new Uint8Array(1024),
                    population: 1000000,
                },
            ];

            const schema = [
                { column_name: 'id', column_type: 'INTEGER' },
                { column_name: 'name', column_type: 'VARCHAR' },
                { column_name: 'geom', column_type: 'MULTIPOLYGON' },
                { column_name: 'image', column_type: 'BLOB' },
                { column_name: 'population', column_type: 'BIGINT' },
            ];

            const result = simplifyDataForAI(data, schema);

            expect(result).toEqual([
                {
                    id: 1,
                    name: 'Prefecture',
                    geom: '[Geometry]',
                    image: '[Blob: 1.0KB]',
                    population: 1000000,
                },
            ]);
        });

        it('should handle empty data array', () => {
            const data: Record<string, unknown>[] = [];
            const schema: Array<{ column_name: string; column_type: string }> = [];

            const result = simplifyDataForAI(data, schema);

            expect(result).toEqual([]);
        });

        it('should handle columns not in schema', () => {
            const data = [{ id: 1, unknown_col: new Uint8Array([1, 2, 3]) }];

            const schema = [{ column_name: 'id', column_type: 'INTEGER' }];

            const result = simplifyDataForAI(data, schema);

            // unknown_col has no type info, so treated as regular binary data
            expect(result[0].id).toBe(1);
            expect(result[0].unknown_col).toMatch(/\[Blob:/);
        });
    });
});
