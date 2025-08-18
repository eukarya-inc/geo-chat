import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBContext, type DBContext } from './dbContext';

// Browser integration tests - these run with actual DuckDB-WASM
describe('DBContext Browser Integration', () => {
  let db: AsyncDuckDB;
  let dbContext: DBContext;

  beforeAll(async () => {
    // Initialize real DuckDB-WASM instance
    const MANUAL_BUNDLES = {
      mvp: {
        mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
        mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
      },
      eh: {
        mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
        mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
      },
    };

    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    
    db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule);
    
    // Install spatial extension
    const conn = await db.connect();
    try {
      await conn.query(`INSTALL spatial`);
      await conn.query(`LOAD spatial`);
    } finally {
      await conn.close();
    }
    
    dbContext = createDBContext(db);
  }, 30000); // 30 second timeout for initialization

  afterAll(async () => {
    // Cleanup
    if (db) {
      await db.terminate();
    }
  });

  describe('executeQuery', () => {
    it('should execute DDL statements (CREATE TABLE)', async () => {
      await dbContext.executeQuery('CREATE TABLE test_ddl (id INTEGER, name VARCHAR)');
      const tables = await dbContext.getTables();
      expect(tables).toContain('test_ddl');
      await dbContext.dropTable('test_ddl');
    });

    it('should execute DML statements (INSERT, SELECT)', async () => {
      await dbContext.executeQuery('CREATE TABLE test_dml (id INTEGER, name VARCHAR)');
      await dbContext.executeQuery("INSERT INTO test_dml VALUES (1, 'Alice'), (2, 'Bob')");
      
      const result = await dbContext.executeQuery('SELECT * FROM test_dml ORDER BY id');
      expect(result).toEqual([
        { id: 1, name: 'Alice' },
        { id: 2, name: 'Bob' }
      ]);
      
      await dbContext.dropTable('test_dml');
    });

    it('should handle SHOW TABLES command', async () => {
      await dbContext.executeQuery('CREATE TABLE table_a (id INTEGER)');
      await dbContext.executeQuery('CREATE TABLE table_b (id INTEGER)');
      
      const result = await dbContext.executeQuery('SHOW TABLES');
      const tableNames = result.map(r => r.name);
      
      expect(tableNames).toContain('table_a');
      expect(tableNames).toContain('table_b');
      
      await dbContext.dropTable('table_a');
      await dbContext.dropTable('table_b');
    });

    it('should handle BigInt values correctly', async () => {
      await dbContext.executeQuery('CREATE TABLE big_numbers (id BIGINT)');
      await dbContext.executeQuery('INSERT INTO big_numbers VALUES (9007199254740992)');
      
      const result = await dbContext.executeQuery('SELECT * FROM big_numbers');
      expect(typeof result[0].id).toBe('number');
      expect(result[0].id).toBeGreaterThan(Number.MAX_SAFE_INTEGER);
      
      await dbContext.dropTable('big_numbers');
    });

    it('should work with schemas', async () => {
      const schemaName = `schema_${Date.now()}`;
      
      await dbContext.executeQuery('CREATE TABLE products (id INTEGER, name VARCHAR)', schemaName);
      await dbContext.executeQuery("INSERT INTO products VALUES (1, 'Product A')", schemaName);
      
      const result = await dbContext.executeQuery('SELECT * FROM products', schemaName);
      expect(result).toEqual([{ id: 1, name: 'Product A' }]);
      
      await dbContext.dropTable('products', schemaName);
    });

    it('should handle geospatial queries', async () => {
      await dbContext.executeQuery(`
        CREATE TABLE locations (
          id INTEGER,
          name VARCHAR,
          geom GEOMETRY
        )
      `);
      
      await dbContext.executeQuery(`
        INSERT INTO locations VALUES 
        (1, 'Tokyo', ST_Point(139.6917, 35.6895))
      `);
      
      const result = await dbContext.executeQuery(`
        SELECT 
          id, 
          name, 
          ST_AsText(geom) as geom_text
        FROM locations
      `);
      
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Tokyo');
      expect(result[0].geom_text).toContain('POINT');
      
      await dbContext.dropTable('locations');
    });
  });

  describe('getTables', () => {
    it('should return list of tables in main schema', async () => {
      await dbContext.executeQuery('CREATE TABLE table1 (id INTEGER)');
      await dbContext.executeQuery('CREATE TABLE table2 (id INTEGER)');
      
      const tables = await dbContext.getTables();
      
      expect(tables).toContain('table1');
      expect(tables).toContain('table2');
      
      await dbContext.dropTable('table1');
      await dbContext.dropTable('table2');
    });

    it('should return tables from specific schema', async () => {
      const schemaName = `test_schema_${Date.now()}`;
      
      await dbContext.executeQuery('CREATE TABLE schema_table (id INTEGER)', schemaName);
      
      const tables = await dbContext.getTables(schemaName);
      expect(tables).toContain('schema_table');
      
      const mainTables = await dbContext.getTables();
      expect(mainTables).not.toContain('schema_table');
      
      await dbContext.dropTable('schema_table', schemaName);
    });
  });

  describe('getTableColumns', () => {
    it('should return column information', async () => {
      await dbContext.executeQuery(`
        CREATE TABLE test_columns (
          id INTEGER PRIMARY KEY,
          name VARCHAR(100),
          price DECIMAL(10,2),
          created_at TIMESTAMP,
          is_active BOOLEAN
        )
      `);
      
      const columns = await dbContext.getTableColumns('test_columns');
      
      expect(columns).toContainEqual({ name: 'id', type: 'INTEGER' });
      expect(columns).toContainEqual({ name: 'name', type: 'VARCHAR' });
      expect(columns).toContainEqual({ name: 'price', type: 'DECIMAL(10,2)' });
      expect(columns).toContainEqual({ name: 'created_at', type: 'TIMESTAMP' });
      expect(columns).toContainEqual({ name: 'is_active', type: 'BOOLEAN' });
      
      await dbContext.dropTable('test_columns');
    });

    it('should throw error for non-existent table', async () => {
      await expect(dbContext.getTableColumns('non_existent_table')).rejects.toThrow(
        "Table 'non_existent_table' does not exist or is not accessible"
      );
    });
  });

  describe('validateTable', () => {
    it('should return true for existing table', async () => {
      await dbContext.executeQuery('CREATE TABLE validation_test (id INTEGER)');
      
      const exists = await dbContext.validateTable('validation_test');
      expect(exists).toBe(true);
      
      await dbContext.dropTable('validation_test');
    });

    it('should return false for non-existent table', async () => {
      const exists = await dbContext.validateTable('non_existent_table');
      expect(exists).toBe(false);
    });

    it('should validate table in specific schema', async () => {
      const schemaName = `schema_${Date.now()}`;
      
      await dbContext.executeQuery('CREATE TABLE schema_validation (id INTEGER)', schemaName);
      
      const exists = await dbContext.validateTable('schema_validation', schemaName);
      expect(exists).toBe(true);
      
      const notExists = await dbContext.validateTable('schema_validation'); // wrong schema
      expect(notExists).toBe(false);
      
      await dbContext.dropTable('schema_validation', schemaName);
    });
  });

  describe('dropTable', () => {
    it('should drop existing table', async () => {
      await dbContext.executeQuery('CREATE TABLE to_drop (id INTEGER)');
      
      let tables = await dbContext.getTables();
      expect(tables).toContain('to_drop');
      
      await dbContext.dropTable('to_drop');
      
      tables = await dbContext.getTables();
      expect(tables).not.toContain('to_drop');
    });

    it('should handle dropping non-existent table gracefully', async () => {
      // Should not throw
      await expect(dbContext.dropTable('non_existent_table')).resolves.not.toThrow();
    });
  });

  describe('describeTable', () => {
    it('should return detailed table structure', async () => {
      await dbContext.executeQuery(`
        CREATE TABLE test_describe (
          id INTEGER PRIMARY KEY,
          name VARCHAR NOT NULL,
          optional_field VARCHAR
        )
      `);
      
      const description = await dbContext.describeTable('test_describe');
      
      expect(description).toHaveLength(3);
      expect(description[0]).toHaveProperty('column_name', 'id');
      expect(description[0]).toHaveProperty('column_type', 'INTEGER');
      expect(description[1]).toHaveProperty('column_name', 'name');
      expect(description[2]).toHaveProperty('column_name', 'optional_field');
      
      await dbContext.dropTable('test_describe');
    });
  });

  describe('createManagedConnection', () => {
    it('should create connection without schema', async () => {
      const conn = await dbContext.createManagedConnection(null);
      
      await conn.query('CREATE TABLE conn_test (id INTEGER)');
      
      const tables = await dbContext.getTables();
      expect(tables).toContain('conn_test');
      
      await conn.close();
      await dbContext.dropTable('conn_test');
    });

    it('should create connection with schema', async () => {
      const schemaName = `conn_schema_${Date.now()}`;
      const conn = await dbContext.createManagedConnection(schemaName);
      
      await conn.query('CREATE TABLE schema_conn_test (id INTEGER)');
      
      const tables = await dbContext.getTables(schemaName);
      expect(tables).toContain('schema_conn_test');
      
      await conn.close();
      await dbContext.dropTable('schema_conn_test', schemaName);
    });

    it('should handle concurrent connections', async () => {
      const conn1 = await dbContext.createManagedConnection(null);
      const conn2 = await dbContext.createManagedConnection(null);
      
      await conn1.query('CREATE TABLE conn_test1 (id INTEGER)');
      await conn2.query('CREATE TABLE conn_test2 (id INTEGER)');
      
      const tables = await dbContext.getTables();
      expect(tables).toContain('conn_test1');
      expect(tables).toContain('conn_test2');
      
      await conn1.close();
      await conn2.close();
      await dbContext.dropTable('conn_test1');
      await dbContext.dropTable('conn_test2');
    });
  });

  describe('executeWithRefresh', () => {
    it('should execute operation and notify listeners', async () => {
      const changes: Array<{table?: string; schema?: string | null}> = [];
      
      const unsubscribe = dbContext.onTableChange((table, schema) => {
        changes.push({ table, schema });
      });
      
      await dbContext.executeWithRefresh(
        () => dbContext.executeQuery('CREATE TABLE refresh_test (id INTEGER)'),
        'refresh_test'
      );
      
      // Wait for notification
      await new Promise(resolve => setTimeout(resolve, 600));
      
      expect(changes).toContainEqual({ table: 'refresh_test', schema: null });
      
      unsubscribe();
      await dbContext.dropTable('refresh_test');
    });

    it('should validate table after creation', async () => {
      await dbContext.executeWithRefresh(
        () => dbContext.executeQuery('CREATE TABLE validated_table (id INTEGER)'),
        'validated_table'
      );
      
      // Table should be validated and accessible
      const exists = await dbContext.validateTable('validated_table');
      expect(exists).toBe(true);
      
      await dbContext.dropTable('validated_table');
    });
  });

  describe('onTableChange / notifyTableChange', () => {
    it('should register and trigger change listeners', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      
      const unsubscribe1 = dbContext.onTableChange(callback1);
      const unsubscribe2 = dbContext.onTableChange(callback2);
      
      dbContext.notifyTableChange('test_table', 'test_schema');
      
      expect(callback1).toHaveBeenCalledWith('test_table', 'test_schema');
      expect(callback2).toHaveBeenCalledWith('test_table', 'test_schema');
      
      unsubscribe1();
      callback1.mockClear();
      callback2.mockClear();
      
      dbContext.notifyTableChange('another_table', null);
      
      expect(callback1).not.toHaveBeenCalled();
      expect(callback2).toHaveBeenCalledWith('another_table', null);
      
      unsubscribe2();
    });
  });

  describe('forceConsistency', () => {
    it('should force database consistency across connections', async () => {
      const conn1 = await dbContext.createManagedConnection(null);
      
      await conn1.query('CREATE TABLE consistency_test (id INTEGER)');
      await dbContext.forceConsistency();
      
      // Should be visible from different connection
      const conn2 = await dbContext.createManagedConnection(null);
      const result = await conn2.query(`SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name='consistency_test'`);
      
      expect(result.numRows).toBeGreaterThan(0);
      
      await conn1.close();
      await conn2.close();
      await dbContext.dropTable('consistency_test');
    });
  });

  describe('getPoolStats', () => {
    it('should return connection pool statistics', async () => {
      const conn1 = await dbContext.createManagedConnection(null);
      const conn2 = await dbContext.createManagedConnection('schema1');
      
      const stats = dbContext.getPoolStats();
      
      expect(stats).toContainEqual(expect.objectContaining({ 
        schema: null, 
        inUse: expect.any(Number) 
      }));
      expect(stats).toContainEqual(expect.objectContaining({ 
        schema: 'schema1', 
        total: 1,
        inUse: 1 
      }));
      
      await conn1.close();
      await conn2.close();
      
      const statsAfter = dbContext.getPoolStats();
      
      expect(statsAfter).toContainEqual(expect.objectContaining({ 
        schema: null, 
        inUse: 0 
      }));
      expect(statsAfter).toContainEqual(expect.objectContaining({ 
        schema: 'schema1', 
        inUse: 0 
      }));
    });
  });

  describe('closeSchemaConnections', () => {
    it('should close all connections for a schema', async () => {
      const schemaName = `close_test_${Date.now()}`;
      
      await dbContext.createManagedConnection(schemaName);
      await dbContext.createManagedConnection(schemaName);
      
      let stats = dbContext.getPoolStats();
      expect(stats).toContainEqual(expect.objectContaining({ 
        schema: schemaName, 
        total: 2 
      }));
      
      await dbContext.closeSchemaConnections(schemaName);
      
      stats = dbContext.getPoolStats();
      expect(stats).not.toContainEqual(expect.objectContaining({ 
        schema: schemaName 
      }));
    });
  });

  describe('getSQLHistory', () => {
    it('should return SQL history manager instance', () => {
      const history = dbContext.getSQLHistory();
      
      expect(history).toBeDefined();
      // Just verify it returns a SQLHistoryManager instance
      // Detailed testing is in sqlHistoryManager.test.ts
      expect(typeof history.recordCreateTable).toBe('function');
      expect(typeof history.getAllHistory).toBe('function');
    });
  });
});