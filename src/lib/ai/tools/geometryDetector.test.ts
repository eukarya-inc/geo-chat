import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { detectGeometryColumns, getGeometryTypes, analyzeTableGeometry, formatGeometryInfo } from './geometryDetector';
import type { DBContext } from '../../duckdb/dbContext';

describe('geometryDetector', () => {
    let originalConsoleWarn: typeof console.warn;
    let originalConsoleError: typeof console.error;

    beforeEach(() => {
        // Suppress console output during tests
        originalConsoleWarn = console.warn;
        originalConsoleError = console.error;
        console.warn = vi.fn();
        console.error = vi.fn();
    });

    afterEach(() => {
        // Restore original console functions
        console.warn = originalConsoleWarn;
        console.error = originalConsoleError;
    });
    describe('detectGeometryColumns', () => {
        it('should detect GEOMETRY columns', () => {
            const schema = [
                { column_name: 'id', column_type: 'INTEGER' },
                { column_name: 'geom', column_type: 'GEOMETRY' },
                { column_name: 'name', column_type: 'VARCHAR' },
            ];

            const result = detectGeometryColumns(schema);
            expect(result).toEqual(['geom']);
        });

        it('should detect typed GEOMETRY columns', () => {
            const schema = [
                { column_name: 'point_geom', column_type: 'GEOMETRY(POINT)' },
                { column_name: 'line_geom', column_type: 'GEOMETRY(LINESTRING)' },
                { column_name: 'poly_geom', column_type: 'GEOMETRY(POLYGON)' },
                { column_name: 'value', column_type: 'DOUBLE' },
            ];

            const result = detectGeometryColumns(schema);
            expect(result).toEqual(['point_geom', 'line_geom', 'poly_geom']);
        });

        it('should handle case-insensitive column types', () => {
            const schema = [
                { column_name: 'geom1', column_type: 'geometry' },
                { column_name: 'geom2', column_type: 'Geometry(Point)' },
            ];

            const result = detectGeometryColumns(schema);
            expect(result).toEqual(['geom1', 'geom2']);
        });

        it('should return empty array when no geometry columns', () => {
            const schema = [
                { column_name: 'id', column_type: 'INTEGER' },
                { column_name: 'lat', column_type: 'DOUBLE' },
                { column_name: 'lon', column_type: 'DOUBLE' },
            ];

            const result = detectGeometryColumns(schema);
            expect(result).toEqual([]);
        });
    });

    describe('getGeometryTypes', () => {
        it('should get geometry types using ST_GeometryType', async () => {
            const mockDbContext = {
                executeQuery: vi.fn().mockResolvedValue([{ geom_type: 'POINT' }, { geom_type: 'LINESTRING' }]),
            };

            const result = await getGeometryTypes(mockDbContext as unknown as DBContext, 'test_table', 'geom', null);

            expect(result).toEqual(['POINT', 'LINESTRING']);
            expect(mockDbContext.executeQuery).toHaveBeenCalledWith(
                'SELECT DISTINCT ST_GeometryType(geom) as geom_type FROM test_table WHERE geom IS NOT NULL LIMIT 5',
                null
            );
        });

        it('should handle schema parameter', async () => {
            const mockDbContext = {
                executeQuery: vi.fn().mockResolvedValue([{ geom_type: 'POLYGON' }]),
            };

            const result = await getGeometryTypes(mockDbContext as unknown as DBContext, 'test_table', 'geom', 'my_schema');

            expect(result).toEqual(['POLYGON']);
            expect(mockDbContext.executeQuery).toHaveBeenCalledWith(
                'SELECT DISTINCT ST_GeometryType(geom) as geom_type FROM my_schema.test_table WHERE geom IS NOT NULL LIMIT 5',
                'my_schema'
            );
        });

        it('should return empty array when ST_GeometryType fails', async () => {
            const mockDbContext = {
                executeQuery: vi.fn().mockRejectedValue(new Error('ST_GeometryType failed')),
            };

            const result = await getGeometryTypes(mockDbContext as unknown as DBContext, 'test_table', 'geom', null);

            expect(result).toEqual([]);
        });
    });

    describe('analyzeTableGeometry', () => {
        it('should analyze table with geometry columns', async () => {
            const mockDbContext = {
                executeQuery: vi
                    .fn()
                    .mockResolvedValueOnce([
                        // DESCRIBE result
                        { column_name: 'id', column_type: 'INTEGER' },
                        { column_name: 'geom', column_type: 'GEOMETRY' },
                    ])
                    .mockResolvedValueOnce([
                        // ST_GeometryType result
                        { geom_type: 'POINT' },
                    ]),
            };

            const result = await analyzeTableGeometry(mockDbContext as unknown as DBContext, 'test_table', null);

            expect(result).toEqual({
                hasGeometry: true,
                geometryInfo: [{ columnName: 'geom', geometryType: 'POINT' }],
            });
        });

        it('should handle multiple geometry columns with different types', async () => {
            const mockDbContext = {
                executeQuery: vi
                    .fn()
                    .mockResolvedValueOnce([
                        // DESCRIBE result
                        { column_name: 'point_geom', column_type: 'GEOMETRY' },
                        { column_name: 'line_geom', column_type: 'GEOMETRY' },
                    ])
                    .mockResolvedValueOnce([{ geom_type: 'POINT' }]) // ST_GeometryType for point_geom
                    .mockResolvedValueOnce([{ geom_type: 'LINESTRING' }]), // ST_GeometryType for line_geom
            };

            const result = await analyzeTableGeometry(mockDbContext as unknown as DBContext, 'test_table', null);

            expect(result).toEqual({
                hasGeometry: true,
                geometryInfo: [
                    { columnName: 'point_geom', geometryType: 'POINT' },
                    { columnName: 'line_geom', geometryType: 'LINESTRING' },
                ],
            });
        });

        it('should fallback to column type when ST_GeometryType fails', async () => {
            const mockDbContext = {
                executeQuery: vi
                    .fn()
                    .mockResolvedValueOnce([
                        // DESCRIBE result
                        { column_name: 'geom', column_type: 'GEOMETRY(POLYGON)' },
                    ])
                    .mockRejectedValueOnce(new Error('ST_GeometryType failed')),
            };

            const result = await analyzeTableGeometry(mockDbContext as unknown as DBContext, 'test_table', null);

            expect(result).toEqual({
                hasGeometry: true,
                geometryInfo: [{ columnName: 'geom', geometryType: 'GEOMETRY(POLYGON)' }],
            });
        });

        it('should return hasGeometry false when no geometry columns', async () => {
            const mockDbContext = {
                executeQuery: vi.fn().mockResolvedValueOnce([
                    { column_name: 'id', column_type: 'INTEGER' },
                    { column_name: 'name', column_type: 'VARCHAR' },
                ]),
            };

            const result = await analyzeTableGeometry(mockDbContext as unknown as DBContext, 'test_table', null);

            expect(result).toEqual({ hasGeometry: false });
        });

        it('should handle DESCRIBE query failure', async () => {
            const mockDbContext = {
                executeQuery: vi.fn().mockRejectedValue(new Error('Table not found')),
            };

            const result = await analyzeTableGeometry(mockDbContext as unknown as DBContext, 'non_existent_table', null);

            expect(result).toEqual({ hasGeometry: false });
        });
    });

    describe('formatGeometryInfo', () => {
        it('should format single geometry info', () => {
            const geometryInfo = [{ columnName: 'geom', geometryType: 'POINT' }];

            const result = formatGeometryInfo(geometryInfo);
            expect(result).toBe('geom (POINT)');
        });

        it('should format multiple geometry info', () => {
            const geometryInfo = [
                { columnName: 'point_geom', geometryType: 'POINT' },
                { columnName: 'line_geom', geometryType: 'LINESTRING' },
                { columnName: 'poly_geom', geometryType: 'POLYGON' },
            ];

            const result = formatGeometryInfo(geometryInfo);
            expect(result).toBe('point_geom (POINT), line_geom (LINESTRING), poly_geom (POLYGON)');
        });

        it('should handle empty array', () => {
            const result = formatGeometryInfo([]);
            expect(result).toBe('');
        });
    });
});
