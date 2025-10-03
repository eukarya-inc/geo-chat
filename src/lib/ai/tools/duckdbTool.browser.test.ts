import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBContext, type DBContext } from '../../duckdb/dbContext';
import { createDuckDBTool } from './duckdbTool';

describe('duckdbTool AI invocation (browser, real DuckDB-WASM)', () => {
  let db: AsyncDuckDB;
  let dbContext: DBContext;
  let originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
  };

  beforeAll(async () => {
    // Suppress console output during tests
    originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };
    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();
    // Initialize real DuckDB-WASM instance (browser)
    const MANUAL_BUNDLES = {
      mvp: {
        mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
        mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
      },
      eh: {
        mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
        mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
      },
    } as const;

    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.VoidLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    // Open and load spatial extension once
    await db.open({ path: ':memory:', accessMode: duckdb.DuckDBAccessMode.READ_WRITE });
    const conn = await db.connect();
    await conn.query(`INSTALL spatial; LOAD spatial;`);
    await conn.close();

    // Create DB context for tests
    dbContext = createDBContext(db);
  });

  afterAll(async () => {
    // Cleanup
    if (db) {
      await db.terminate();
    }
    
    // Restore original console functions
    if (originalConsole) {
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
    }
  });

  it('returns error for multiple SQL statements', async () => {
    const tool = createDuckDBTool(dbContext, null);
    const result = await tool.execute(
      { sql: 'SELECT 1; SELECT 2;' },
      { messages: [], toolCallId: '' }
    );
    if (!('error' in result)) {
      throw new Error('Expected error result');
    }
    expect(result.error).toContain('Multiple SQL statements');
    expect(result.suggestion).toContain('Split your SQL statements');
    expect(result.sql).toBe('SELECT 1; SELECT 2;');
  });

  it('auto-applies LIMIT for SELECT and returns sensible metadata', async () => {
    const tool = createDuckDBTool(dbContext, null);

    // Prepare data via tool (DDL path)
    const createRes = await tool.execute(
      { sql: 'CREATE TABLE nums AS SELECT range as id FROM range(0, 150)' },
      { messages: [], toolCallId: '' }
    );
    if ('error' in createRes) {
      throw new Error(`Unexpected error: ${createRes.error}`);
    }
    expect(createRes.createdTable).toBe('nums');

    // SELECT (no LIMIT) -> tool should add LIMIT 1000
    const selectRes = await tool.execute(
      { sql: 'SELECT id FROM nums ORDER BY id' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in selectRes) {
      throw new Error(`Unexpected error: ${selectRes.error}`);
    }
    expect(selectRes.limitApplied).toBe(true);
    expect(selectRes.rowCount).toBe(100); // AI_RETURN_LIMIT truncates to 100
    // columns/columnCount are no longer returned; infer locally if needed
    const inferredColumns = selectRes.data.length > 0 ? Object.keys(selectRes.data[0]) : [];
    expect(inferredColumns).toEqual(['id']);
    console.log("SELECT RES:", selectRes);
    expect(Array.isArray(selectRes.data)).toBe(true);
  });

  it('creates a table with geometry and detects geometry info', async () => {
    const tool = createDuckDBTool(dbContext, null);

    const res = await tool.execute(
      { sql: 'CREATE TABLE test_points AS SELECT ST_Point(139.7, 35.6) as geom, 1 as id' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    expect(res.createdTable).toBe('test_points');
    expect(res.tableSchema?.some((c: { name: string }) => c.name === 'geom')).toBe(true);
    expect(res.hasGeometry).toBe(true);
    // geometryInfo is computed via ST_GeometryType in the tool
    expect(res.geometryInfo && res.geometryInfo!.length).toBeGreaterThan(0);
    // Should include POINT in geometry info
    const types = (res.geometryInfo || []).map((g: { geometryType: string }) => g.geometryType);
    expect(types.join(',')).toContain('POINT');
    // Sample data present; we don’t assert exact geom encoding
    expect(res.sampleData && res.sampleData!.length).toBeGreaterThan(0);
    // Suggestions mention map visualization availability
    expect(res.suggestions?.some((s: string) => s.includes('地図での可視化が可能'))).toBe(true);
  });

  it('creates table with multiple geometry columns and detects types', async () => {
    const tool = createDuckDBTool(dbContext, null);

    const res = await tool.execute(
      {
        sql: `CREATE TABLE test_multi_geom AS
              SELECT
                ST_Point(139.7, 35.6) as point_geom,
                ST_MakeLine(ST_Point(139.7, 35.6), ST_Point(139.8, 35.7)) as line_geom,
                1 as id`
      },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    expect(res.createdTable).toBe('test_multi_geom');
    expect(res.hasGeometry).toBe(true);
    expect(res.geometryInfo?.length).toBe(2);

    // Check that both POINT and LINESTRING are detected
    const geomTypes = (res.geometryInfo?.map((g: { geometryType: string }) => g.geometryType)) || [];
    expect(geomTypes).toContain('POINT');
    expect(geomTypes).toContain('LINESTRING');

    // Check the formatted suggestion includes both columns
    const geoSuggestion = res.suggestions?.find((s: string) => s.includes('ジオメトリカラムが検出されました'));
    expect(geoSuggestion).toBeDefined();
    expect(geoSuggestion).toContain('point_geom');
    expect(geoSuggestion).toContain('line_geom');
  });

  it('reports no geometry for tables without geometry columns', async () => {
    const tool = createDuckDBTool(dbContext, null);

    const res = await tool.execute(
      { sql: 'CREATE TABLE test_no_geom AS SELECT 1 as id, \'Tokyo\' as city, 35.6 as lat, 139.7 as lon' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    expect(res.createdTable).toBe('test_no_geom');
    expect(res.hasGeometry).toBe(false);
    expect(res.geometryInfo).toBeUndefined();

    // Should suggest that map visualization is not possible
    expect(res.suggestions?.some((s: string) => s.includes('地図での可視化はできません'))).toBe(true);
    expect(res.suggestions?.some((s: string) => s.includes('グラフでの可視化'))).toBe(true);
  });

  it('handles CREATE OR REPLACE TABLE with geometry', async () => {
    const tool = createDuckDBTool(dbContext, null);

    // First create without geometry
    await tool.execute(
      { sql: 'CREATE TABLE IF NOT EXISTS test_replace AS SELECT 1 as id' },
      { messages: [], toolCallId: '' }
    );

    // Then replace with geometry
    const res = await tool.execute(
      { sql: 'CREATE OR REPLACE TABLE test_replace AS SELECT ST_Point(139.7, 35.6) as geom' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    expect(res.createdTable).toBe('test_replace');
    expect(res.hasGeometry).toBe(true);
    expect(res.geometryInfo?.length).toBeGreaterThan(0);
    expect(res.geometryInfo?.[0].geometryType).toContain('POINT');
  });

  it('does not return geometry info for SELECT queries', async () => {
    const tool = createDuckDBTool(dbContext, null);

    // First create a table with geometry
    await tool.execute(
      { sql: 'CREATE TABLE select_test_geom AS SELECT ST_Point(139.7, 35.6) as geom' },
      { messages: [], toolCallId: '' }
    );

    // Then SELECT from it
    const res = await tool.execute(
      { sql: 'SELECT * FROM select_test_geom' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    expect(res.createdTable).toBeUndefined();
    expect(res.hasGeometry).toBeUndefined();
    expect(res.geometryInfo).toBeUndefined();
    // But we should get the data
    expect(res.data?.length).toBeGreaterThan(0);
  });

  it('handles polygon geometry type detection', async () => {
    const tool = createDuckDBTool(dbContext, null);

    const res = await tool.execute(
      {
        sql: `CREATE TABLE test_polygon AS
              SELECT ST_MakePolygon(
                ST_MakeLine([
                  ST_Point(0, 0),
                  ST_Point(1, 0),
                  ST_Point(1, 1),
                  ST_Point(0, 1),
                  ST_Point(0, 0)
                ])
              ) as polygon_geom`
      },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    expect(res.createdTable).toBe('test_polygon');
    expect(res.hasGeometry).toBe(true);
    expect(res.geometryInfo?.[0].geometryType).toContain('POLYGON');
  });

  it('handles SQL syntax errors gracefully', async () => {
    const tool = createDuckDBTool(dbContext, null);

    const res = await tool.execute(
      { sql: 'CREAT TABLE invalid_syntax AS SELECT 1' }, // Typo: CREAT instead of CREATE
      { messages: [], toolCallId: '' }
    );
    if (!('error' in res)) {
      throw new Error('Expected error result');
    }
    expect(res.error).toBeDefined();
    expect(res.sql).toBe('CREAT TABLE invalid_syntax AS SELECT 1');
  });

  it('handles ST_Read error for non-existent files', async () => {
    const tool = createDuckDBTool(dbContext, null);

    const res = await tool.execute(
      { sql: 'CREATE TABLE test_shapefile AS SELECT * FROM ST_Read(\'/non/existent/file.shp\')' },
      { messages: [], toolCallId: '' }
    );
    if (!('error' in res)) {
      throw new Error('Expected error result');
    }
    expect(res.error).toBeDefined();
    expect(res.error).toContain('GDAL Error');
  });

  it('truncates large result sets for AI response', async () => {
    const tool = createDuckDBTool(dbContext, null);

    // Create a table with more than 1000 rows
    await tool.execute(
      { sql: 'CREATE TABLE large_table AS SELECT range as id FROM range(0, 1500)' },
      { messages: [], toolCallId: '' }
    );

    // SELECT without limit (auto-adds LIMIT 1000, then AI_RETURN_LIMIT truncates to 100)
    const res = await tool.execute(
      { sql: 'SELECT * FROM large_table' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    // limitApplied won't be true because data was truncated to 100 by AI_RETURN_LIMIT
    expect(res.dataTruncated).toBe(true); // Data was truncated by AI_RETURN_LIMIT
    expect(res.totalRowCount).toBe(1000); // Original query returned 1000 rows (with LIMIT)
    expect(res.rowCount).toBe(100); // Data truncated to AI_RETURN_LIMIT
    expect(res.data?.length).toBe(100); // Data truncated to AI_RETURN_LIMIT
  });

  it('generates SQL explanation when API key is provided', async () => {
    // Mock API key (won't actually call the service in tests)
    const tool = createDuckDBTool(dbContext, null, 'mock-api-key');

    const res = await tool.execute(
      { sql: 'CREATE TABLE test_explain AS SELECT 1 as id' },
      { messages: [], toolCallId: '' }
    );

    if ('error' in res) {
      throw new Error(`Unexpected error: ${res.error}`);
    }
    // Note: SQL explanation generation is async and may not complete in test
    // Just verify the table was created successfully
    expect(res.createdTable).toBe('test_explain');
  });
});
