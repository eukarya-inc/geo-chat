import { describe, expect, it } from 'vitest';

import { convertArrowToJS, GEOMETRY_PLACEHOLDER } from './arrowConverter';

describe('convertArrowToJS', () => {
    it('passes through primitives and null', () => {
        expect(convertArrowToJS(null)).toBeNull();
        expect(convertArrowToJS(undefined)).toBeUndefined();
        expect(convertArrowToJS('x')).toBe('x');
        expect(convertArrowToJS(42)).toBe(42);
        expect(convertArrowToJS(true)).toBe(true);
    });

    it('converts safe BigInt to number', () => {
        expect(convertArrowToJS(123n)).toBe(123);
        expect(typeof convertArrowToJS(123n)).toBe('number');
    });

    it('keeps unsafe BigInt as string', () => {
        const big = 9007199254740993n; // > Number.MAX_SAFE_INTEGER
        expect(convertArrowToJS(big)).toBe('9007199254740993');
    });

    it('replaces binary blobs with a geometry placeholder', () => {
        expect(convertArrowToJS(new Uint8Array([1, 2, 3]))).toBe(GEOMETRY_PLACEHOLDER);
        expect(convertArrowToJS(new ArrayBuffer(4))).toBe(GEOMETRY_PLACEHOLDER);
    });

    it('keeps Date instances as-is', () => {
        const d = new Date('2020-01-01T00:00:00Z');
        expect(convertArrowToJS(d)).toBe(d);
    });

    it('recurses into plain objects and arrays', () => {
        expect(convertArrowToJS({ a: 1n, b: [2n, 'x'] })).toEqual({ a: 1, b: [2, 'x'] });
    });

    it('unwraps objects exposing toJSON (Arrow StructRow)', () => {
        const struct = { toJSON: () => ({ id: 7n }) };
        expect(convertArrowToJS(struct)).toEqual({ id: 7 });
    });
});
