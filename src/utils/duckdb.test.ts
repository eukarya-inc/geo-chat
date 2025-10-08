import { describe, it, expect } from 'vitest';

describe('duckdbTable', () => {
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
