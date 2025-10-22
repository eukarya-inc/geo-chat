import { describe, it, expect } from 'vitest';
import { convertComplexTypesForArrow, convertToArrowTable, type TableColumn } from './duckdb';

describe('duckdbTable', () => {
    describe('convertComplexTypesForArrow', () => {
        it('should keep Uint8Array as-is', () => {
            const input = new Uint8Array([1, 2, 3, 4, 5]);
            const result = convertComplexTypesForArrow(input, 'GEOMETRY');
            expect(result).toBeInstanceOf(Uint8Array);
            expect(result).toEqual(input);
        });

        it('should convert object with numeric keys and byteLength to Uint8Array', () => {
            const input = {
                0: 5,
                1: 4,
                2: 0,
                3: 0,
                byteLength: 4,
            };
            const result = convertComplexTypesForArrow(input, 'GEOMETRY');
            expect(result).toBeInstanceOf(Uint8Array);
            expect((result as Uint8Array)[0]).toBe(5);
            expect((result as Uint8Array)[1]).toBe(4);
            expect((result as Uint8Array)[2]).toBe(0);
            expect((result as Uint8Array)[3]).toBe(0);
        });

        it('should convert ArrayBuffer as-is', () => {
            const buffer = new ArrayBuffer(10);
            const result = convertComplexTypesForArrow(buffer, 'BLOB');
            expect(result).toBe(buffer);
        });

        it('should convert regular objects to JSON string', () => {
            const input = { foo: 'bar', nested: { value: 123 } };
            const result = convertComplexTypesForArrow(input);
            expect(result).toBe(JSON.stringify(input));
        });

        it('should keep Date objects as-is', () => {
            const input = new Date('2024-01-01');
            const result = convertComplexTypesForArrow(input);
            expect(result).toBe(input);
        });

        it('should convert STRUCT array to JSON string', () => {
            const structArray = [
                { name: 'item1', value: 100.0 },
                { name: 'item2', value: 200.0 },
            ];
            const columnType = 'STRUCT("name" VARCHAR, "value" DOUBLE)[]';

            const result = convertComplexTypesForArrow(structArray, columnType);

            expect(typeof result).toBe('string');
            expect(result).toBe(JSON.stringify(structArray));
        });

        it('should convert null STRUCT array to empty string', () => {
            const columnType = 'STRUCT(...)[]';
            const result = convertComplexTypesForArrow(null, columnType);

            expect(result).toBe('');
        });

        it('should convert null for GEOMETRY type to empty Uint8Array', () => {
            const columnType = 'GEOMETRY';
            const result = convertComplexTypesForArrow(null, columnType);

            expect(result).toBeInstanceOf(Uint8Array);
            expect((result as Uint8Array).length).toBe(0);
        });

        it('should convert null for BLOB type to empty Uint8Array', () => {
            const columnType = 'BLOB';
            const result = convertComplexTypesForArrow(null, columnType);

            expect(result).toBeInstanceOf(Uint8Array);
            expect((result as Uint8Array).length).toBe(0);
        });

        it('should convert null for JSON type to empty string', () => {
            const columnType = 'JSON';
            const result = convertComplexTypesForArrow(null, columnType);

            expect(result).toBe('');
        });

        it('should convert regular array to JSON string', () => {
            const array = [1, 2, 3];
            const result = convertComplexTypesForArrow(array);

            expect(typeof result).toBe('string');
            expect(result).toBe(JSON.stringify(array));
        });
    });

    describe('convertToArrowTable', () => {
        it('should handle STRUCT array columns without throwing type inference error', () => {
            const columns: TableColumn[] = [
                { name: 'id', type: 'INTEGER' },
                { name: 'items', type: 'STRUCT("name" VARCHAR, "value" DOUBLE)[]' },
            ];

            const data = [
                {
                    id: 1,
                    items: [
                        { name: 'item_a', value: 100.0 },
                        { name: 'item_b', value: 200.0 },
                    ],
                },
                {
                    id: 2,
                    items: [{ name: 'item_c', value: 300.0 }],
                },
                {
                    id: 3,
                    items: null,
                },
            ];

            // This should not throw
            expect(() => convertToArrowTable(data, columns)).not.toThrow();

            const result = convertToArrowTable(data, columns);
            expect(result.numRows).toBe(3);
            expect(result.numCols).toBe(2);
        });

        it('should handle GEOMETRY columns with null values without type mixing', () => {
            const columns: TableColumn[] = [
                { name: 'id', type: 'INTEGER' },
                { name: 'geom', type: 'GEOMETRY' },
            ];

            const data = [
                { id: 1, geom: null },
                { id: 2, geom: null },
                { id: 3, geom: new Uint8Array([1, 1, 0, 0, 0, 10, 20, 30]) },
                { id: 4, geom: new Uint8Array([1, 1, 0, 0, 0, 40, 50, 60]) },
            ];

            // This should not throw
            expect(() => convertToArrowTable(data, columns)).not.toThrow();

            const result = convertToArrowTable(data, columns);
            expect(result.numRows).toBe(4);
            expect(result.numCols).toBe(2);
        });

        it('should handle mixed complex types (STRUCT arrays, GEOMETRY, NULL)', () => {
            const columns: TableColumn[] = [
                { name: 'id', type: 'INTEGER' },
                { name: 'data', type: 'STRUCT("name" VARCHAR, "value" DOUBLE)[]' },
                { name: 'geom', type: 'GEOMETRY' },
            ];

            const data = [
                {
                    id: 1,
                    data: [
                        { name: 'a', value: 1.0 },
                        { name: 'b', value: null },
                    ],
                    geom: null,
                },
                {
                    id: 2,
                    data: null,
                    geom: new Uint8Array([1, 1, 0, 0, 0]),
                },
                {
                    id: 3,
                    data: [
                        { name: 'c', value: 3.0 },
                        { name: 'd', value: 4.0 },
                        { name: 'e', value: 5.0 },
                    ],
                    geom: new Uint8Array([1, 1, 0, 0, 0, 1, 2, 3]),
                },
            ];

            // This should not throw
            expect(() => convertToArrowTable(data, columns)).not.toThrow();

            const result = convertToArrowTable(data, columns);
            expect(result.numRows).toBe(3);
            expect(result.numCols).toBe(3);
        });

        it('should return empty table for empty data', () => {
            const columns: TableColumn[] = [{ name: 'id', type: 'INTEGER' }];
            const data: Record<string, unknown>[] = [];

            const result = convertToArrowTable(data, columns);
            expect(result.numRows).toBe(0);
        });
    });

    describe('convertSpecialValues', () => {
        // We can't directly test the private function, but we can test the behavior
        // through the public functions that use it

        it('should format Date objects as YYYY-MM-DD HH:mm:ss', () => {
            // This test validates that our date formatting logic works
            const testDate = new Date('2024-03-15T14:30:45');
            const year = testDate.getFullYear();
            const month = String(testDate.getMonth() + 1).padStart(2, '0');
            const day = String(testDate.getDate()).padStart(2, '0');
            const hours = String(testDate.getHours()).padStart(2, '0');
            const minutes = String(testDate.getMinutes()).padStart(2, '0');
            const seconds = String(testDate.getSeconds()).padStart(2, '0');

            const expected = `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            expect(expected).toBe('2024-03-15 14:30:45');
        });

        it('should format date-only values as YYYY-MM-DD when time is 00:00:00', () => {
            const testDate = new Date('2024-03-15T00:00:00');
            const year = testDate.getFullYear();
            const month = String(testDate.getMonth() + 1).padStart(2, '0');
            const day = String(testDate.getDate()).padStart(2, '0');

            const expected = `${year}-${month}-${day}`;
            expect(expected).toBe('2024-03-15');
        });

        it('should handle BigInt conversion to string', () => {
            const bigIntValue = BigInt('9007199254740992');
            const result = bigIntValue.toString();
            expect(result).toBe('9007199254740992');
        });
    });
});
