import { describe, it, expect } from 'vitest';
import { removeBOM, hasBOM } from './bomUtils';

describe('bomUtils', () => {
    describe('removeBOM', () => {
        it('removes UTF-8 BOM from string', () => {
            const withBOM = '\uFEFF事業者番号';
            const withoutBOM = removeBOM(withBOM);
            expect(withoutBOM).toBe('事業者番号');
        });

        it('removes three-byte UTF-8 BOM representation', () => {
            const withBOM = String.fromCharCode(0xef, 0xbb, 0xbf) + '事業者番号';
            const withoutBOM = removeBOM(withBOM);
            expect(withoutBOM).toBe('事業者番号');
        });

        it('returns original string if no BOM present', () => {
            const noBOM = '事業者番号';
            expect(removeBOM(noBOM)).toBe('事業者番号');
        });

        it('handles empty string', () => {
            expect(removeBOM('')).toBe('');
        });

        it('handles null/undefined', () => {
            expect(removeBOM(null as unknown as string)).toBe(null);
            expect(removeBOM(undefined as unknown as string)).toBe(undefined);
        });
    });

    describe('hasBOM', () => {
        it('detects UTF-8 BOM', () => {
            const withBOM = '\uFEFF事業者番号';
            expect(hasBOM(withBOM)).toBe(true);
        });

        it('detects three-byte UTF-8 BOM representation', () => {
            const withBOM = String.fromCharCode(0xef, 0xbb, 0xbf) + '事業者番号';
            expect(hasBOM(withBOM)).toBe(true);
        });

        it('returns false for string without BOM', () => {
            const noBOM = '事業者番号';
            expect(hasBOM(noBOM)).toBe(false);
        });

        it('handles empty string', () => {
            expect(hasBOM('')).toBe(false);
        });

        it('handles null/undefined', () => {
            expect(hasBOM(null as unknown as string)).toBe(false);
            expect(hasBOM(undefined as unknown as string)).toBe(false);
        });
    });
});
