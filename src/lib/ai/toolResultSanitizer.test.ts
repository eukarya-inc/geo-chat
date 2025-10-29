import { describe, it, expect } from 'vitest';
import { sanitizeToolResult, estimateObjectSize } from './toolResultSanitizer';

describe('sanitizeToolResult', () => {
    it('should remove large arrays from top-level fields', () => {
        const input = {
            success: true,
            data: Array(100).fill({ id: 1, name: 'test' }),
            rowCount: 100,
            sql: 'SELECT * FROM test',
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual({
            success: true,
            rowCount: 100,
            sql: 'SELECT * FROM test',
            // data is removed
        });
    });

    it('should keep small arrays intact', () => {
        const input = {
            success: true,
            data: [{ id: 1 }, { id: 2 }, { id: 3 }],
            suggestions: ['tip1', 'tip2', 'tip3', 'tip4', 'tip5'],
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual({
            success: true,
            data: [{ id: 1 }, { id: 2 }, { id: 3 }],
            suggestions: ['tip1', 'tip2', 'tip3', 'tip4', 'tip5'],
        });
    });

    it('should handle nested objects with large arrays', () => {
        const input = {
            metadata: {
                count: 500,
                results: Array(200).fill({ value: 1 }),
            },
            summary: {
                total: 500,
            },
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual({
            metadata: {
                count: 500,
                // results is removed
            },
            summary: {
                total: 500,
            },
        });
    });

    it('should preserve primitives and non-array values', () => {
        const input = {
            success: true,
            count: 42,
            message: 'Hello',
            enabled: false,
            value: null,
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual(input);
    });

    it('should handle arrays of primitives', () => {
        const input = {
            smallList: [1, 2, 3],
            largeList: Array(100).fill(1),
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual({
            smallList: [1, 2, 3],
            // largeList is removed
        });
    });

    it('should respect custom maxArraySize', () => {
        const input = {
            data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        };

        // With maxArraySize 10, array of 10 elements is kept
        const result = sanitizeToolResult(input, { maxArraySize: 10 });
        expect(result).toEqual({
            data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        });

        // With maxArraySize 5, array of 10 elements is removed
        const result2 = sanitizeToolResult(input, { maxArraySize: 5 });
        expect(result2).toEqual({
            // data is removed
        });

        // With maxArraySize 15, array of 10 elements is kept
        const result3 = sanitizeToolResult(input, { maxArraySize: 15 });
        expect(result3).toEqual({
            data: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
        });
    });

    it('should handle empty objects and arrays', () => {
        const input = {
            emptyArray: [],
            emptyObject: {},
            nested: {
                items: [],
            },
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual(input);
    });

    it('should handle null and undefined values', () => {
        const input = {
            value1: null,
            value2: undefined,
            nested: {
                value3: null,
            },
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual({
            value1: null,
            nested: {
                value3: null,
            },
        });
    });

    it('should prevent infinite recursion with maxDepth', () => {
        const deep = {
            level1: {
                level2: {
                    level3: {
                        level4: {
                            level5: {
                                level6: {
                                    value: 'too deep',
                                },
                            },
                        },
                    },
                },
            },
        };

        // With maxDepth 5, level6 and beyond should be preserved as-is (not traversed)
        const result = sanitizeToolResult(deep, { maxDepth: 5 });
        expect(result).toBeDefined();

        // With maxDepth 3, deeper levels should be preserved as-is
        const result2 = sanitizeToolResult(deep, { maxDepth: 3 });
        expect(result2).toBeDefined();
    });

    it('should handle real DuckDB tool result', () => {
        const input = {
            success: true,
            data: Array(100).fill({
                id: 1,
                prefecture: '東京都',
                value: 12345,
            }),
            rowCount: 100,
            totalRowCount: 500,
            sql: 'SELECT * FROM prefectures LIMIT 100',
            sqlExplanation: 'Queries prefecture data',
            suggestions: ['Use LIMIT', 'Add WHERE clause'],
            createdTable: 'analysis_results',
            dataTruncated: true,
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual({
            success: true,
            // data is removed (100 elements > 5)
            rowCount: 100,
            totalRowCount: 500,
            sql: 'SELECT * FROM prefectures LIMIT 100',
            sqlExplanation: 'Queries prefecture data',
            suggestions: ['Use LIMIT', 'Add WHERE clause'],
            createdTable: 'analysis_results',
            dataTruncated: true,
        });
    });

    it('should handle chart tool result', () => {
        const input = {
            success: true,
            spec: {
                mark: 'bar',
                encoding: {
                    x: { field: 'category' },
                    y: { field: 'value' },
                },
            },
            tableName: 'chart_data',
        };

        const result = sanitizeToolResult(input);

        // Chart specs should be preserved (no large arrays)
        expect(result).toEqual(input);
    });

    it('should handle error results without data', () => {
        const input = {
            success: false,
            error: 'Query failed: table not found',
            sql: 'SELECT * FROM missing_table',
        };

        const result = sanitizeToolResult(input);

        expect(result).toEqual(input);
    });
});

describe('estimateObjectSize', () => {
    it('should estimate size for primitives', () => {
        expect(estimateObjectSize('hello')).toBeGreaterThan(0);
        expect(estimateObjectSize(123)).toBe(8);
        expect(estimateObjectSize(true)).toBe(4);
        expect(estimateObjectSize(null)).toBe(0);
    });

    it('should estimate size for objects', () => {
        const obj = { name: 'test', value: 42 };
        const size = estimateObjectSize(obj);
        expect(size).toBeGreaterThan(0);
    });

    it('should estimate size for arrays', () => {
        const arr = [1, 2, 3, 4, 5];
        const size = estimateObjectSize(arr);
        expect(size).toBe(40); // 5 numbers * 8 bytes
    });

    it('should handle circular references', () => {
        const obj: { self?: unknown } = {};
        obj.self = obj;

        // Should not throw or hang
        const size = estimateObjectSize(obj);
        expect(size).toBeDefined();
    });
});
