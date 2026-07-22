import { describe, expect, it } from 'vitest';

import { geometryKindFromType } from './geometry';

describe('geometryKindFromType', () => {
    it('maps polygon types', () => {
        expect(geometryKindFromType('POLYGON')).toBe('polygon');
        expect(geometryKindFromType('MULTIPOLYGON')).toBe('polygon');
    });

    it('maps line types', () => {
        expect(geometryKindFromType('LINESTRING')).toBe('line');
        expect(geometryKindFromType('MULTILINESTRING')).toBe('line');
    });

    it('maps point and unknown types to point', () => {
        expect(geometryKindFromType('POINT')).toBe('point');
        expect(geometryKindFromType('MULTIPOINT')).toBe('point');
        expect(geometryKindFromType('GEOMETRYCOLLECTION')).toBe('point');
    });
});
