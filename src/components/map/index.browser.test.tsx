import { describe, it, expect, beforeAll } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import { convertArrowToJS } from '../../utils/arrowConverter';

// Helper to generate vector tile queries with different column handling strategies
const generateVectorTileQuery = (
    table: string, 
    columns: string[], 
    strategy: 'bug' | 'simple' | 'to_json' = 'simple'
) => {
    const columnSelect = columns.length > 0 
        ? columns.map(col => {
            switch (strategy) {
                case 'bug': 
                    return `CASE WHEN typeof("${col}") = 'BIGINT' THEN CAST("${col}" AS DOUBLE) ELSE "${col}" END as "${col}"`;
                case 'to_json': 
                    return `to_json("${col}") as "${col}"`;
                default: 
                    return `"${col}"`;
            }
        }).join(', ')
        : '1 as dummy';

    return `
        WITH filtered AS (
            SELECT geom as geom, ${columns.map(c => `"${c}"`).join(', ')}
            FROM ${table}
            WHERE ST_Intersects(geom, ST_MakeEnvelope(?, ?, ?, ?))
        )
        SELECT ST_AsGeoJSON(geom) AS geojson, ${columnSelect}
        FROM filtered`;
};

describe('Map Component BIGINT Handling', () => {
    let db: duckdb.AsyncDuckDB;

    beforeAll(async () => {
        // Initialize DuckDB with spatial extension
        const bundle = await duckdb.selectBundle({
            mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
            eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
        });
        
        db = new duckdb.AsyncDuckDB(
            new duckdb.VoidLogger(),
            new Worker(bundle.mainWorker!)
        );
        await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
        
        const conn = await db.connect();
        await conn.query(`INSTALL spatial`);
        await conn.close();
    });

    it('should fail with type mixing error when using CASE without consistent types', async () => {
        const conn = await db.connect();
        await conn.query(`LOAD spatial`);
        
        await conn.query(`
            CREATE OR REPLACE TABLE test_mixed (
                geom GEOMETRY,
                varchar_col VARCHAR,
                bigint_col BIGINT
            );
            INSERT INTO test_mixed VALUES
            (ST_Point(139.7, 35.7), 'text1', 9999999999)
        `);

        const query = generateVectorTileQuery('test_mixed', ['varchar_col', 'bigint_col'], 'bug');
        
        await expect(
            conn.prepare(query).then(stmt => stmt.query(139.5, 35.5, 140.0, 36.0))
        ).rejects.toThrow('Cannot mix values of type VARCHAR and DOUBLE');
    });

    it('should preserve numeric types with JavaScript BigInt handling', async () => {
        const conn = await db.connect();
        await conn.query(`LOAD spatial`);
        
        await conn.query(`
            CREATE OR REPLACE TABLE test_simple (
                geom GEOMETRY,
                int_col INTEGER,
                bigint_col BIGINT
            );
            INSERT INTO test_simple VALUES
            (ST_Point(139.7, 35.7), 100, 999999999999999)
        `);

        const query = generateVectorTileQuery('test_simple', ['int_col', 'bigint_col'], 'simple');
        const result = await conn.prepare(query).then(stmt => stmt.query(139.5, 35.5, 140.0, 36.0));
        const row = result.toArray()[0] as Record<string, unknown>;
        
        // Types preserved
        expect(typeof row.int_col).toBe('number');
        expect(typeof row.bigint_col).toBe('bigint');
        
        // BigInt needs conversion for JSON
        const jsonStr = JSON.stringify({ ...row, bigint_col: Number(row.bigint_col) });
        expect(JSON.parse(jsonStr).bigint_col).toBe(999999999999999);
    });

    it('should handle LIST of STRUCT columns (Arrow Vector)', async () => {
        const conn = await db.connect();
        await conn.query(`LOAD spatial`);
        
        await conn.query(`
            CREATE OR REPLACE TABLE test_list (
                geom GEOMETRY,
                items STRUCT(name VARCHAR, value BIGINT)[]
            );
            INSERT INTO test_list VALUES
            (ST_Point(139.7, 35.7), [
                {'name': 'Item1', 'value': 100000000000},
                {'name': 'Item2', 'value': 200000000000}
            ])
        `);

        const query = generateVectorTileQuery('test_list', ['items'], 'simple');
        const result = await conn.prepare(query).then(stmt => stmt.query(139.5, 35.5, 140.0, 36.0));
        const row = result.toArray()[0];
        
        // Verify items is an Arrow Vector
        expect(row.items?.constructor?.name).toBe('_Vector');
        expect(typeof row.items.toArray).toBe('function');
        
        // Test using the imported conversion function
        const converted = convertArrowToJS(row) as Record<string, unknown>;
        const items = converted.items as Array<{ name: string; value: number }>;
        expect(Array.isArray(items)).toBe(true);
        expect(items[0].name).toBe('Item1');
        expect(items[0].value).toBe(100000000000);
        expect(items[1].name).toBe('Item2');
        expect(items[1].value).toBe(200000000000);
    });

    it('should handle STRUCT columns with nested BigInt', async () => {
        const conn = await db.connect();
        await conn.query(`LOAD spatial`);
        
        await conn.query(`
            CREATE OR REPLACE TABLE test_struct (
                geom GEOMETRY,
                nested STRUCT(name VARCHAR, count BIGINT)
            );
            INSERT INTO test_struct VALUES
            (ST_Point(139.7, 35.7), {'name': 'Test', 'count': 999999999999})
        `);

        const query = generateVectorTileQuery('test_struct', ['nested'], 'simple');
        const result = await conn.prepare(query).then(stmt => stmt.query(139.5, 35.5, 140.0, 36.0));
        
        // Arrow StructRow needs conversion
        const row = result.toArray()[0];
        const jsonRow = typeof row.toJSON === 'function' ? row.toJSON() : row;
        
        // Before conversion, BigInt is preserved
        expect(jsonRow.nested.name).toBe('Test');
        expect(typeof jsonRow.nested.count).toBe('bigint');
        
        // Use the imported conversion function
        const converted = convertArrowToJS(row) as { nested: { name: string; count: number } };
        expect(converted.nested.count).toBe(999999999999);
    });

});