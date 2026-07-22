import { afterAll, describe, expect, it } from 'vitest';

import { executeQuery, getTableSchema } from '@/lib/duckdb/db';
import { terminateGlobalDB } from '@/lib/duckdb/globalDB';
import { createTableFromUrl } from '@/lib/duckdb/db';
import { findBuiltinDataset } from './builtinDatasets';

// End-to-end check of the load path the `load_builtin_dataset` tool uses:
// createTableFromUrl fetches the same-origin parquet and registers it as a virtual
// file (DuckDB-WASM has no httpfs, so plain read_parquet on a URL cannot work — see
// the tool's comment). The vitest browser dev server serves public/ at BASE_URL='/'.
describe('built-in dataset loading (browser)', () => {
    afterAll(() => terminateGlobalDB());

    it('exposes the URL and table for each built-in dataset', () => {
        const cities = findBuiltinDataset('japan_cities');
        expect(cities?.url).toContain('data/japan_cities.parquet');
    });

    it('loads japan_cities via createTableFromUrl and exposes its schema', async () => {
        const dataset = findBuiltinDataset('japan_cities')!;
        try {
            await createTableFromUrl(dataset.url, dataset.table);

            const schema = await getTableSchema('japan_cities');
            const names = schema.map(c => c.name);
            expect(names).toContain('city');
            expect(names).toContain('prefecture');
            expect(names).toContain('geom');

            const count = await executeQuery('SELECT count(*) AS n FROM japan_cities');
            expect(Number(count.rows[0].n)).toBeGreaterThan(0);
        } finally {
            await executeQuery('DROP TABLE IF EXISTS japan_cities');
        }
    });
});
