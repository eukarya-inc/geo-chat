import { afterAll, describe, expect, it } from 'vitest';

import { executeQuery, getTables, getTableSchema } from './db';
import { getGlobalDB, terminateGlobalDB } from './globalDB';

// Runs against real DuckDB-WASM (webkit via Playwright). globalDB is a singleton,
// so these tests share one database instance and one connection.
describe('DuckDB browser integration', () => {
    afterAll(() => {
        terminateGlobalDB();
    });

    it('runs a trivial SELECT', async () => {
        const res = await executeQuery('SELECT 1 AS hello');
        expect(res.rowCount).toBe(1);
        expect(res.rows[0].hello).toBe(1);
        expect(res.columns[0].name).toBe('hello');
        expect(res.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('has the spatial extension loaded', async () => {
        const res = await executeQuery('SELECT ST_AsText(ST_Point(1, 2)) AS wkt');
        expect(res.rows[0].wkt).toBe('POINT (1 2)');
    });

    it('converts BigInt results to numbers', async () => {
        const res = await executeQuery('SELECT 42::BIGINT AS n');
        expect(res.rows[0].n).toBe(42);
        expect(typeof res.rows[0].n).toBe('number');
    });

    it('creates a table from a registered CSV buffer and lists it', async () => {
        const csv = 'city,pop\nTokyo,1000\nOsaka,500\n';
        const db = await getGlobalDB();
        await db.registerFileBuffer('cities.csv', new TextEncoder().encode(csv));
        try {
            await executeQuery(`CREATE TABLE cities AS SELECT * FROM read_csv_auto('cities.csv')`);

            const tables = await getTables();
            expect(tables).toContain('cities');

            const schema = await getTableSchema('cities');
            expect(schema.map(c => c.name)).toEqual(['city', 'pop']);

            const rows = await executeQuery('SELECT * FROM cities ORDER BY pop DESC');
            expect(rows.rowCount).toBe(2);
            expect(rows.rows[0].city).toBe('Tokyo');
        } finally {
            await executeQuery('DROP TABLE IF EXISTS cities');
            await db.dropFile('cities.csv').catch(() => undefined);
        }
    });

    it('serializes concurrent statements in submission order', async () => {
        const results = await Promise.all([
            executeQuery('SELECT 1 AS n'),
            executeQuery('SELECT 2 AS n'),
            executeQuery('SELECT 3 AS n'),
        ]);
        expect(results.map(r => r.rows[0].n)).toEqual([1, 2, 3]);
    });
});
