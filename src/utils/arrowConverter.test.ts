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
                text: 'hello'
            }
        };
        const result = convertArrowToJS(input);
        expect(result).toEqual({
            name: 'test',
            value: 100000000000,
            nested: {
                count: 999,
                text: 'hello'
            }
        });
    });

    it('should handle Arrow Vector with BigInt', () => {
        // Create actual Arrow Vector with BigInt values
        const data = [
            { name: 'Item1', value: BigInt(100000000000) },
            { name: 'Item2', value: BigInt(200000000000) }
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
            { id: 2, name: 'Test2', count: BigInt(888888888888) }
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
                    field2: BigInt(12345678901234)
                } 
            }
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
                { name: 'Item2', value: BigInt(200000000000) }
            ]
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
                        value: BigInt(555555555555)
                    }
                }
            })
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
});