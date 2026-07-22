import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { executeQuery, getTileBytes } from '@/lib/duckdb/db';
import { terminateGlobalDB } from '@/lib/duckdb/globalDB';
import { attributeColumns, detectGeometryColumn, detectGeometryKind, getTableBounds } from './geometry';
import { generateVectorTileQuery } from './mvtQuery';

// Runs against real DuckDB-WASM + spatial (webkit via Playwright).
describe('MVT generation and geometry detection', () => {
    beforeAll(async () => {
        await executeQuery(`
            CREATE TABLE mvt_cities AS
            SELECT * FROM (VALUES
                ('Tokyo', 100, ST_Point(139.69, 35.68)),
                ('Osaka', 50, ST_Point(135.50, 34.69)),
                ('Sapporo', 30, ST_Point(141.35, 43.06))
            ) AS t(name, pop, geom)
        `);
    });

    afterAll(async () => {
        await executeQuery('DROP TABLE IF EXISTS mvt_cities').catch(() => undefined);
        terminateGlobalDB();
    });

    it('detects the geometry column, kind, and attribute columns', async () => {
        expect(await detectGeometryColumn('mvt_cities')).toBe('geom');
        expect(await detectGeometryKind('mvt_cities', 'geom')).toBe('point');
        const attrs = await attributeColumns('mvt_cities');
        expect(attrs.map(c => c.name)).toEqual(['name', 'pop']);
    });

    it('computes lon/lat bounds', async () => {
        const bounds = await getTableBounds('mvt_cities', 'geom');
        expect(bounds).not.toBeNull();
        const [[minLng, minLat], [maxLng, maxLat]] = bounds!;
        expect(minLng).toBeCloseTo(135.5, 1);
        expect(maxLng).toBeCloseTo(141.35, 1);
        expect(minLat).toBeCloseTo(34.69, 1);
        expect(maxLat).toBeCloseTo(43.06, 1);
    });

    it('produces MVT bytes carrying features for a covering tile', async () => {
        const columns = await attributeColumns('mvt_cities');
        const covering = await getTileBytes(
            generateVectorTileQuery({
                table: 'mvt_cities',
                geometryColumn: 'geom',
                columns,
                zxy: { z: 0, x: 0, y: 0 }, // world tile — covers all points
            })
        );
        // A far tile (arctic, no data) still yields a tiny header-only blob.
        const empty = await getTileBytes(
            generateVectorTileQuery({
                table: 'mvt_cities',
                geometryColumn: 'geom',
                columns,
                zxy: { z: 5, x: 0, y: 0 },
            })
        );
        expect(covering).not.toBeNull();
        expect(covering!.length).toBeGreaterThan((empty?.length ?? 0) + 10);
    });
});
