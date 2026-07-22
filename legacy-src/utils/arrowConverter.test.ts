import { describe, it, expect } from 'vitest';
import * as arrow from 'apache-arrow';
import { convertArrowToJS } from './arrowConverter';

describe('convertArrowToJS', () => {
    it('should convert BigInt to number', () => {
        const result = convertArrowToJS(BigInt(9999999999999));
        expect(result).toBe(9999999999999);
        expect(typeof result).toBe('number');
    });

    it('should handle null and undefined', () => {
        expect(convertArrowToJS(null)).toBe(null);
        expect(convertArrowToJS(undefined)).toBe(undefined);
    });

    it('should preserve primitive values', () => {
        expect(convertArrowToJS(123)).toBe(123);
        expect(convertArrowToJS('test')).toBe('test');
        expect(convertArrowToJS(true)).toBe(true);
        expect(convertArrowToJS(false)).toBe(false);
    });

    it('should convert arrays recursively', () => {
        const input = [1, BigInt(999), 'test', null];
        const result = convertArrowToJS(input);
        expect(result).toEqual([1, 999, 'test', null]);
    });

    it('should convert nested objects with BigInt', () => {
        const input = {
            name: 'test',
            value: BigInt(100000000000),
            nested: {
                count: BigInt(999),
                text: 'hello',
            },
        };
        const result = convertArrowToJS(input);
        expect(result).toEqual({
            name: 'test',
            value: 100000000000,
            nested: {
                count: 999,
                text: 'hello',
            },
        });
    });

    it('should handle Arrow Vector with BigInt', () => {
        // Create actual Arrow Vector with BigInt values
        const data = [
            { name: 'Item1', value: BigInt(100000000000) },
            { name: 'Item2', value: BigInt(200000000000) },
        ];

        // Build Arrow Table with struct type
        const table = arrow.tableFromJSON(data);
        const vector = table.getChild('value');

        // Test that the vector is properly converted
        if (vector) {
            const result = convertArrowToJS(vector);
            expect(Array.isArray(result)).toBe(true);
            const arrayResult = result as unknown[];
            expect(arrayResult[0]).toBe(100000000000);
            expect(arrayResult[1]).toBe(200000000000);
        }
    });

    it('should handle Arrow Table with multiple columns', () => {
        // Create Arrow Table with mixed types including BigInt
        const data = [
            { id: 1, name: 'Test1', count: BigInt(999999999999) },
            { id: 2, name: 'Test2', count: BigInt(888888888888) },
        ];

        const table = arrow.tableFromJSON(data);

        // Convert the entire table
        const rows = table.toArray();
        const result = rows.map((row: unknown) => convertArrowToJS(row));

        expect(Array.isArray(result)).toBe(true);
        expect(result).toHaveLength(2);

        const firstRow = result[0] as Record<string, unknown>;
        expect(firstRow.id).toBe(1);
        expect(firstRow.name).toBe('Test1');
        expect(firstRow.count).toBe(999999999999);
        expect(typeof firstRow.count).toBe('number');
    });

    it('should handle Arrow Struct type', () => {
        // Create Arrow Table with struct column
        const data = [
            {
                nested: {
                    field1: 'value1',
                    field2: BigInt(12345678901234),
                },
            },
        ];

        const table = arrow.tableFromJSON(data);
        const rows = table.toArray();

        const result = convertArrowToJS(rows[0]) as Record<string, unknown>;

        expect(result.nested).toBeDefined();
        const nested = result.nested as Record<string, unknown>;
        expect(nested.field1).toBe('value1');
        expect(nested.field2).toBe(12345678901234);
        expect(typeof nested.field2).toBe('number');
    });

    it('should handle Arrow-like Vector objects from DuckDB', () => {
        // Simulate the _Vector objects that DuckDB returns
        // This matches the actual structure we see in browser tests
        const mockVector = {
            constructor: { name: '_Vector' },
            toArray: () => [
                { name: 'Item1', value: BigInt(100000000000) },
                { name: 'Item2', value: BigInt(200000000000) },
            ],
        };

        const result = convertArrowToJS(mockVector);
        expect(Array.isArray(result)).toBe(true);
        const items = result as unknown[];
        expect(items).toHaveLength(2);
        const item0 = items[0] as Record<string, unknown>;
        const item1 = items[1] as Record<string, unknown>;
        expect(item0.name).toBe('Item1');
        expect(item0.value).toBe(100000000000);
        expect(item1.name).toBe('Item2');
        expect(item1.value).toBe(200000000000);
    });

    it('should handle Arrow StructRow objects from DuckDB', () => {
        // Simulate the StructRow objects that DuckDB returns
        // These have a toJSON() method that returns the data
        const mockStructRow = {
            constructor: { name: 'StructRow' },
            toJSON: () => ({
                id: 1,
                metadata: {
                    count: BigInt(999999999999),
                    tags: ['tag1', 'tag2'],
                    details: {
                        description: 'Test description',
                        value: BigInt(555555555555),
                    },
                },
            }),
        };

        const result = convertArrowToJS(mockStructRow) as Record<string, unknown>;

        expect(result.id).toBe(1);
        const metadata = result.metadata as Record<string, unknown>;
        expect(metadata.count).toBe(999999999999);
        expect(typeof metadata.count).toBe('number');
        expect(metadata.tags).toEqual(['tag1', 'tag2']);
        const details = metadata.details as Record<string, unknown>;
        expect(details.description).toBe('Test description');
        expect(details.value).toBe(555555555555);
        expect(typeof details.value).toBe('number');
    });

    it('should convert HUGEINT string values to numbers when column type is provided', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('hugeint_col', 'HUGEINT');
        columnTypes.set('bigint_col', 'BIGINT');
        columnTypes.set('varchar_col', 'VARCHAR');

        const input = {
            hugeint_col: '123456789012345',
            bigint_col: '9876543210',
            varchar_col: '12345', // Should remain string because it's VARCHAR
            regular_col: 42,
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        expect(result.hugeint_col).toBe(123456789012345);
        expect(typeof result.hugeint_col).toBe('number');
        expect(result.bigint_col).toBe(9876543210);
        expect(typeof result.bigint_col).toBe('number');
        expect(result.varchar_col).toBe('12345');
        expect(typeof result.varchar_col).toBe('string');
        expect(result.regular_col).toBe(42);
    });

    it('should handle all integer types', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('tinyint_col', 'TINYINT');
        columnTypes.set('smallint_col', 'SMALLINT');
        columnTypes.set('integer_col', 'INTEGER');
        columnTypes.set('bigint_col', 'BIGINT');
        columnTypes.set('hugeint_col', 'HUGEINT');
        columnTypes.set('utinyint_col', 'UTINYINT');
        columnTypes.set('usmallint_col', 'USMALLINT');
        columnTypes.set('uinteger_col', 'UINTEGER');
        columnTypes.set('ubigint_col', 'UBIGINT');
        columnTypes.set('uhugeint_col', 'UHUGEINT');

        const input = {
            tinyint_col: '127',
            smallint_col: '32767',
            integer_col: '2147483647',
            bigint_col: '9223372036854775807',
            hugeint_col: '170141183460469231731687303715884105727',
            utinyint_col: '255',
            usmallint_col: '65535',
            uinteger_col: '4294967295',
            ubigint_col: '18446744073709551615',
            uhugeint_col: '340282366920938463463374607431768211455',
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        // All should be converted to numbers
        expect(typeof result.tinyint_col).toBe('number');
        expect(typeof result.smallint_col).toBe('number');
        expect(typeof result.integer_col).toBe('number');
        expect(typeof result.bigint_col).toBe('number');
        expect(typeof result.hugeint_col).toBe('number');
        expect(typeof result.utinyint_col).toBe('number');
        expect(typeof result.usmallint_col).toBe('number');
        expect(typeof result.uinteger_col).toBe('number');
        expect(typeof result.ubigint_col).toBe('number');
        expect(typeof result.uhugeint_col).toBe('number');
    });

    it('should keep invalid number strings as strings', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('hugeint_col', 'HUGEINT');

        const input = {
            hugeint_col: 'not a number',
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        expect(result.hugeint_col).toBe('not a number');
        expect(typeof result.hugeint_col).toBe('string');
    });

    it('should handle empty strings for integer columns', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('hugeint_col', 'HUGEINT');

        const input = {
            hugeint_col: '   ',
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        expect(result.hugeint_col).toBe('   ');
        expect(typeof result.hugeint_col).toBe('string');
    });

    it('should handle Arrow Decimal types for HUGEINT (Decimal[38e0])', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('hugeint_col', 'Decimal[38e0]'); // Arrow representation of HUGEINT
        columnTypes.set('decimal_col', 'Decimal[18e2]'); // Real decimal with scale

        const input = {
            hugeint_col: '123456789012345',
            decimal_col: '123.45', // Should remain string as it has scale
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        // Decimal with scale 0 should be converted to number
        expect(result.hugeint_col).toBe(123456789012345);
        expect(typeof result.hugeint_col).toBe('number');

        // Decimal with non-zero scale is also converted to number
        expect(result.decimal_col).toBe(123.45);
        expect(typeof result.decimal_col).toBe('number');
    });

    it('should handle double-quoted string numbers (JSON encoded)', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('hugeint_col', 'Decimal[38e0]');

        const input = {
            hugeint_col: '"50308"', // Double-quoted string number
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        expect(result.hugeint_col).toBe(50308);
        expect(typeof result.hugeint_col).toBe('number');
    });

    it('should handle various double-quoted integer values', () => {
        const columnTypes = new Map<string, string>();
        columnTypes.set('value1', 'BIGINT');
        columnTypes.set('value2', 'Decimal[38e0]');
        columnTypes.set('value3', 'INTEGER');

        const input = {
            value1: '"12345"',
            value2: '"0"',
            value3: '"999999"',
        };

        const result = convertArrowToJS(input, columnTypes) as Record<string, unknown>;

        expect(result.value1).toBe(12345);
        expect(result.value2).toBe(0);
        expect(result.value3).toBe(999999);
        expect(typeof result.value1).toBe('number');
        expect(typeof result.value2).toBe('number');
        expect(typeof result.value3).toBe('number');
    });
});
