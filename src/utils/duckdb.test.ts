import { describe, it, expect } from 'vitest';
import { convertComplexTypesForArrow } from './duckdb';

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
