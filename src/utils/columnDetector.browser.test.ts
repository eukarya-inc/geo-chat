import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm';
import { 
  detectDisplayColumns, 
  isGeometryColumn, 
  isBlobColumn, 
  findGeometryColumns,
  type ColumnInfo 
} from './columnDetector';

describe('Column Detection Utilities', () => {
  let db: duckdb.AsyncDuckDB;
  let conn: duckdb.AsyncDuckDBConnection;

  beforeAll(async () => {
    // Initialize DuckDB with spatial extension
    const DUCKDB_BUNDLES = {
      mvp: {
        mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
        mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
      },
      eh: {
        mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
        mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
      },
    };

    const bundle = await duckdb.selectBundle(DUCKDB_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.VoidLogger();
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule);
    
    conn = await db.connect();
    
    // Install spatial extension
    await conn.query(`INSTALL spatial`);
    await conn.query(`LOAD spatial`);
    
    // Create test tables with various column types
    await conn.query(`
      CREATE TABLE test_with_geometry (
        id INTEGER,
        name VARCHAR,
        description TEXT,
        geom GEOMETRY,
        data BLOB,
        created_at TIMESTAMP,
        amount DECIMAL(10,2),
        is_active BOOLEAN
      )
    `);
    
    await conn.query(`
      CREATE TABLE test_without_geometry (
        id INTEGER,
        title VARCHAR,
        content TEXT,
        metadata JSON,
        tags VARCHAR[],
        score DOUBLE
      )
    `);
    
    // Create table with GEOMETRY type (DuckDB doesn't support subtype constraints in CREATE TABLE)
    await conn.query(`
      CREATE TABLE test_geometry_types (
        point_geom GEOMETRY,
        line_geom GEOMETRY,
        polygon_geom GEOMETRY,
        multi_geom GEOMETRY,
        any_geom GEOMETRY,
        regular_data VARCHAR
      )
    `);
  });

  afterAll(async () => {
    await conn.close();
    await db.terminate();
  });

  describe('detectDisplayColumns', () => {
    it('should exclude GEOMETRY columns', async () => {
      const result = await conn.query('DESCRIBE test_with_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const displayColumns = detectDisplayColumns(schemaData);
      
      expect(displayColumns).not.toContain('geom');
      expect(displayColumns).toContain('id');
      expect(displayColumns).toContain('name');
      expect(displayColumns).toContain('description');
      expect(displayColumns).toContain('created_at');
      expect(displayColumns).toContain('amount');
      expect(displayColumns).toContain('is_active');
    });

    it('should exclude BLOB columns', async () => {
      const result = await conn.query('DESCRIBE test_with_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const displayColumns = detectDisplayColumns(schemaData);
      
      expect(displayColumns).not.toContain('data');
    });

    it('should exclude specified geometry column name', async () => {
      const result = await conn.query('DESCRIBE test_with_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const displayColumns = detectDisplayColumns(schemaData, 'name');
      
      expect(displayColumns).not.toContain('name');
      expect(displayColumns).toContain('id');
      expect(displayColumns).toContain('description');
    });

    it('should return all columns when no GEOMETRY or BLOB types exist', async () => {
      const result = await conn.query('DESCRIBE test_without_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const displayColumns = detectDisplayColumns(schemaData);
      
      expect(displayColumns).toContain('id');
      expect(displayColumns).toContain('title');
      expect(displayColumns).toContain('content');
      expect(displayColumns).toContain('metadata');
      expect(displayColumns).toContain('tags');
      expect(displayColumns).toContain('score');
      expect(displayColumns).toHaveLength(6);
    });

    it('should handle multiple GEOMETRY columns', async () => {
      const result = await conn.query('DESCRIBE test_geometry_types');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const displayColumns = detectDisplayColumns(schemaData);
      
      // All geometry columns should be excluded
      expect(displayColumns).not.toContain('point_geom');
      expect(displayColumns).not.toContain('line_geom');
      expect(displayColumns).not.toContain('polygon_geom');
      expect(displayColumns).not.toContain('multi_geom');
      expect(displayColumns).not.toContain('any_geom');
      
      // Regular data should be included
      expect(displayColumns).toContain('regular_data');
      expect(displayColumns).toHaveLength(1);
    });
  });

  describe('isGeometryColumn', () => {
    it('should identify GEOMETRY type', () => {
      expect(isGeometryColumn('GEOMETRY')).toBe(true);
      expect(isGeometryColumn('geometry')).toBe(true);
      expect(isGeometryColumn('Geometry')).toBe(true);
    });

    it('should identify GEOMETRY subtypes', () => {
      expect(isGeometryColumn('GEOMETRY(POINT)')).toBe(true);
      expect(isGeometryColumn('GEOMETRY(LINESTRING)')).toBe(true);
      expect(isGeometryColumn('GEOMETRY(POLYGON)')).toBe(true);
      expect(isGeometryColumn('GEOMETRY(MULTIPOLYGON)')).toBe(true);
      expect(isGeometryColumn('geometry(point)')).toBe(true);
    });

    it('should not identify non-GEOMETRY types', () => {
      expect(isGeometryColumn('VARCHAR')).toBe(false);
      expect(isGeometryColumn('INTEGER')).toBe(false);
      expect(isGeometryColumn('BLOB')).toBe(false);
      expect(isGeometryColumn('TEXT')).toBe(false);
      expect(isGeometryColumn('GEOMETRIC')).toBe(false); // Similar but not GEOMETRY
    });
  });

  describe('isBlobColumn', () => {
    it('should identify BLOB type', () => {
      expect(isBlobColumn('BLOB')).toBe(true);
      expect(isBlobColumn('blob')).toBe(true);
      expect(isBlobColumn('Blob')).toBe(true);
    });

    it('should identify BLOB variations', () => {
      expect(isBlobColumn('TINYBLOB')).toBe(true);
      expect(isBlobColumn('MEDIUMBLOB')).toBe(true);
      expect(isBlobColumn('LONGBLOB')).toBe(true);
    });

    it('should not identify non-BLOB types', () => {
      expect(isBlobColumn('VARCHAR')).toBe(false);
      expect(isBlobColumn('INTEGER')).toBe(false);
      expect(isBlobColumn('GEOMETRY')).toBe(false);
      expect(isBlobColumn('TEXT')).toBe(false);
    });
  });

  describe('findGeometryColumns', () => {
    it('should find all geometry columns', async () => {
      const result = await conn.query('DESCRIBE test_with_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const geometryColumns = findGeometryColumns(schemaData);
      
      expect(geometryColumns).toContain('geom');
      expect(geometryColumns).toHaveLength(1);
    });

    it('should return empty array when no geometry columns exist', async () => {
      const result = await conn.query('DESCRIBE test_without_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const geometryColumns = findGeometryColumns(schemaData);
      
      expect(geometryColumns).toHaveLength(0);
    });

    it('should find multiple geometry columns', async () => {
      const result = await conn.query('DESCRIBE test_geometry_types');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      const geometryColumns = findGeometryColumns(schemaData);
      
      expect(geometryColumns).toContain('point_geom');
      expect(geometryColumns).toContain('line_geom');
      expect(geometryColumns).toContain('polygon_geom');
      expect(geometryColumns).toContain('multi_geom');
      expect(geometryColumns).toContain('any_geom');
      expect(geometryColumns).toHaveLength(5);
    });
  });

  describe('Integration with real DuckDB data', () => {
    it('should correctly process schema from DESCRIBE query', async () => {
      const result = await conn.query('DESCRIBE test_with_geometry');
      const schemaData = result.toArray() as unknown as ColumnInfo[];
      
      // Verify the structure matches our interface
      expect(schemaData.length).toBeGreaterThan(0);
      schemaData.forEach(col => {
        expect(col).toHaveProperty('column_name');
        expect(col).toHaveProperty('column_type');
        expect(typeof col.column_name).toBe('string');
        expect(typeof col.column_type).toBe('string');
      });
      
      // Test detection with real data
      const displayColumns = detectDisplayColumns(schemaData);
      const geometryColumns = findGeometryColumns(schemaData);
      
      // Should have some display columns but not geometry
      expect(displayColumns.length).toBeGreaterThan(0);
      expect(displayColumns).not.toContain('geom');
      expect(displayColumns).not.toContain('data');
      
      // Should find the geometry column
      expect(geometryColumns).toContain('geom');
    });
  });
});