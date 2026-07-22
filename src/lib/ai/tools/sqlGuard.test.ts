import { describe, expect, it } from 'vitest';

import { countStatements, hasMultipleStatements } from './sqlGuard';

describe('sqlGuard', () => {
    it('counts a single statement as one', () => {
        expect(countStatements('SELECT 1')).toBe(1);
        expect(countStatements('SELECT 1;')).toBe(1);
        expect(hasMultipleStatements('SELECT 1;')).toBe(false);
    });

    it('detects multiple statements', () => {
        expect(countStatements('SELECT 1; SELECT 2')).toBe(2);
        expect(hasMultipleStatements('DROP TABLE a; DROP TABLE b')).toBe(true);
    });

    it('ignores semicolons inside string literals', () => {
        expect(hasMultipleStatements("SELECT 'a;b' AS x")).toBe(false);
    });

    it('ignores semicolons inside comments', () => {
        expect(hasMultipleStatements('SELECT 1 -- a; b\n')).toBe(false);
        expect(hasMultipleStatements('SELECT 1 /* a; b */')).toBe(false);
    });
});
