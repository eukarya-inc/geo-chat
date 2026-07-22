import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { executeQuery } from '@/lib/duckdb/db';
import { terminateGlobalDB } from '@/lib/duckdb/globalDB';
import { createDuckDBLoader } from './VegaLiteChart';

describe('duckdb:// Vega loader', () => {
    beforeAll(async () => {
        await executeQuery(`CREATE TABLE loader_t AS SELECT * FROM (VALUES ('a', 1), ('b', 2)) AS t(label, n)`);
    });

    afterAll(async () => {
        await executeQuery('DROP TABLE IF EXISTS loader_t').catch(() => undefined);
        terminateGlobalDB();
    });

    it('resolves duckdb:// URLs to JSON rows', async () => {
        const loader = createDuckDBLoader();
        const json = await loader.load('duckdb://loader_t');
        const rows = JSON.parse(json) as { label: string; n: number }[];
        expect(rows).toHaveLength(2);
        expect(rows[0]).toEqual({ label: 'a', n: 1 });
    });

    it('sanitize whitelists the duckdb:// scheme', async () => {
        const loader = createDuckDBLoader();
        const result = await loader.sanitize('duckdb://loader_t', {} as never);
        expect(result.href).toBe('duckdb://loader_t');
    });
});
