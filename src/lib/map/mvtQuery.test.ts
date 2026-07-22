import { describe, expect, it } from 'vitest';

import { calculateSimplifyTolerance, generateVectorTileQuery } from './mvtQuery';

const base = {
    table: 'cities',
    geometryColumn: 'geom',
    zxy: { z: 5, x: 10, y: 12 },
} as const;

describe('generateVectorTileQuery', () => {
    it('emits ST_AsMVT / ST_AsMVTGeom with the always_xy transform', () => {
        const sql = generateVectorTileQuery({ ...base, columns: [{ name: 'name', type: 'VARCHAR' }] });
        expect(sql).toContain('ST_AsMVT(feature');
        expect(sql).toContain('ST_AsMVTGeom(');
        expect(sql).toContain('ST_Transform(ST_SimplifyPreserveTopology("geom"');
        expect(sql).toContain("'EPSG:4326', 'EPSG:3857', true");
        expect(sql).toContain('ST_TileEnvelope(5, 10, 12)');
        expect(sql).toContain('FROM "cities"');
    });

    it('keeps primitive numeric columns uncast', () => {
        const sql = generateVectorTileQuery({
            ...base,
            columns: [
                { name: 'population', type: 'INTEGER' },
                { name: 'density', type: 'DOUBLE' },
            ],
        });
        expect(sql).toContain(`'population': "population"`);
        expect(sql).toContain(`'density': "density"`);
        expect(sql).not.toContain('TRY_CAST("population"');
    });

    it('stringifies STRUCT/LIST/JSON columns via TRY_CAST to VARCHAR', () => {
        const sql = generateVectorTileQuery({
            ...base,
            columns: [
                { name: 'stats', type: 'STRUCT(min DOUBLE, max DOUBLE)' },
                { name: 'tags', type: 'VARCHAR[]' },
            ],
        });
        expect(sql).toContain(`'stats': TRY_CAST("stats" AS VARCHAR)`);
        expect(sql).toContain(`'tags': TRY_CAST("tags" AS VARCHAR)`);
    });

    it('casts unsupported integer widths to INTEGER/BIGINT', () => {
        const sql = generateVectorTileQuery({
            ...base,
            columns: [
                { name: 'tiny', type: 'TINYINT' },
                { name: 'huge', type: 'HUGEINT' },
            ],
        });
        expect(sql).toContain(`'tiny': TRY_CAST("tiny" AS INTEGER)`);
        expect(sql).toContain(`'huge': TRY_CAST("huge" AS BIGINT)`);
    });

    it('handles a zero-column geometry table (geometry only, valid SQL)', () => {
        const sql = generateVectorTileQuery({ ...base, columns: [] });
        expect(sql).toContain("'geometry': ST_AsMVTGeom(");
        // Only the geometry struct key — no attribute columns.
        expect((sql.match(/'[\w]+':/g) ?? []).length).toBe(1);
        expect(sql).toContain('ST_AsMVT(feature');
    });

    it('caps very wide tables at maxColumns', () => {
        const columns = Array.from({ length: 40 }, (_, i) => ({ name: `c${i}`, type: 'INTEGER' }));
        const sql = generateVectorTileQuery({ ...base, columns, maxColumns: 30 });
        expect(sql).toContain(`'c29': "c29"`);
        expect(sql).not.toContain(`'c30': "c30"`);
    });

    it('throws when the geometry column is missing', () => {
        expect(() => generateVectorTileQuery({ ...base, geometryColumn: '', columns: [] })).toThrow();
    });
});

describe('calculateSimplifyTolerance', () => {
    it('is zero at high zoom and larger when zoomed out', () => {
        expect(calculateSimplifyTolerance(15)).toBe(0);
        expect(calculateSimplifyTolerance(20)).toBe(0);
        expect(calculateSimplifyTolerance(0)).toBeCloseTo(0.001, 6);
        expect(calculateSimplifyTolerance(0)).toBeGreaterThan(calculateSimplifyTolerance(10));
    });
});
