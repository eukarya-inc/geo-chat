import { describe, it, expect } from 'vitest';
import { generateVectorTileQuery, calculateSimplifyTolerance } from './mvt';

const baseParams = {
    zxy: { z: 5, x: 10, y: 12 },
    selectedTable: 'public.cities',
    geometryColumnName: 'geom',
} as const;

describe('generateVectorTileQuery', () => {
    it('keeps primitive numeric columns without casting', () => {
        const query = generateVectorTileQuery({
            ...baseParams,
            selectedColumns: ['population', 'density'],
            columnTypes: {
                population: 'INTEGER',
                density: 'DOUBLE',
            },
        });

        expect(query).toContain(`'population': "population"`);
        expect(query).toContain(`'density': "density"`);
        expect(query).not.toContain(`TRY_CAST("population" AS VARCHAR)`);
        expect(query).not.toContain(`TRY_CAST("density" AS VARCHAR)`);
    });

    it('stringifies complex columns using TRY_CAST', () => {
        const query = generateVectorTileQuery({
            ...baseParams,
            selectedColumns: ['stats', 'tags'],
            columnTypes: {
                stats: 'STRUCT(min DOUBLE, max DOUBLE)',
                tags: 'VARCHAR[]',
            },
        });

        expect(query).toContain(`'stats': TRY_CAST("stats" AS VARCHAR)`);
        expect(query).toContain(`'tags': TRY_CAST("tags" AS VARCHAR)`);
    });

    it('defaults to no casting when column types are missing', () => {
        const query = generateVectorTileQuery({
            ...baseParams,
            selectedColumns: ['name'],
            columnTypes: undefined,
        });

        expect(query).toContain(`'name': "name"`);
        expect(query).not.toContain(`TRY_CAST("name" AS VARCHAR)`);
    });
});

describe('calculateSimplifyTolerance', () => {
    it('returns 0 for zoom level 15 and above', () => {
        expect(calculateSimplifyTolerance(15)).toBe(0);
        expect(calculateSimplifyTolerance(16)).toBe(0);
        expect(calculateSimplifyTolerance(20)).toBe(0);
    });

    it('returns aggressive simplification for low zoom levels (0-5)', () => {
        // Zoom 0: 0.01
        expect(calculateSimplifyTolerance(0)).toBe(0.01);
        // Zoom 5: 0.005
        expect(calculateSimplifyTolerance(5)).toBe(0.005);
        // Zoom 3: 0.007
        expect(calculateSimplifyTolerance(3)).toBe(0.007);
    });

    it('returns moderate simplification for mid zoom levels (6-10)', () => {
        // Zoom 6: 0.0042
        expect(calculateSimplifyTolerance(6)).toBeCloseTo(0.0042, 4);
        // Zoom 10: 0.001
        expect(calculateSimplifyTolerance(10)).toBeCloseTo(0.001, 4);
    });

    it('returns light simplification for high zoom levels (11-14)', () => {
        // Zoom 11: 0.001
        expect(calculateSimplifyTolerance(11)).toBeGreaterThan(0);
        expect(calculateSimplifyTolerance(11)).toBeLessThanOrEqual(0.001);
        // Zoom 14: close to 0
        expect(calculateSimplifyTolerance(14)).toBeGreaterThan(0);
        expect(calculateSimplifyTolerance(14)).toBeLessThan(0.001);
    });

    it('decreases simplification as zoom level increases', () => {
        // Verify monotonic decrease
        for (let z = 0; z < 15; z++) {
            const current = calculateSimplifyTolerance(z);
            const next = calculateSimplifyTolerance(z + 1);
            expect(current).toBeGreaterThanOrEqual(next);
        }
    });
});
