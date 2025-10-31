import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBContext, type DBContext } from './dbContext';
import { suppressConsole } from '../../test/console';
import { initializeDuckDB } from '../../test/duckdb';

// Browser integration tests - these run with actual DuckDB-WASM
describe('DBContext Browser Integration', () => {
    let db: AsyncDuckDB;
    let dbContext: DBContext;
    let restoreConsole: (() => void) | undefined;

    beforeAll(async () => {
        // Suppress console output during tests
        restoreConsole = suppressConsole();

        // Initialize DuckDB-WASM
        db = await initializeDuckDB();

        // Install spatial extension
        const conn = await db.connect();
        try {
            await conn.query(`INSTALL spatial`);
            await conn.query(`LOAD spatial`);
        } finally {
            await conn.close();
        }

        // Create a shared DBContext
        dbContext = createDBContext(db);
    }, 60000); // 60 second timeout for initialization

    afterEach(async () => {
        // Force cleanup of all connections after each test to prevent leaks
        try {
            await dbContext.closeAllConnections();
        } catch (error) {
            console.error('Failed to cleanup connections after test:', error);
        }
    });

    afterAll(async () => {
        // Cleanup
        if (db) {
            await db.terminate();
        }

        // Restore original console functions
        restoreConsole?.();
    });

    describe('executeQuery', () => {
        it('should execute DDL statements (CREATE TABLE)', async () => {
            const tableName = `test_ddl_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${tableName} (id INTEGER, name VARCHAR)`);
            const tables = await dbContext.getTables();
            expect(tables).toContain(tableName);
            await dbContext.dropTable(tableName);
        });

        it('should execute DML statements (INSERT, SELECT)', async () => {
            const tableName = `test_dml_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${tableName} (id INTEGER, name VARCHAR)`);
            await dbContext.executeQuery(`INSERT INTO ${tableName} VALUES (1, 'Alice'), (2, 'Bob')`);

            const result = await dbContext.executeQuery(`SELECT * FROM ${tableName} ORDER BY id`);
            expect(result).toEqual([
                { id: 1, name: 'Alice' },
                { id: 2, name: 'Bob' },
            ]);

            await dbContext.dropTable(tableName);
        });

        it('should handle SHOW TABLES command', async () => {
            const tableA = `table_a_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const tableB = `table_b_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${tableA} (id INTEGER)`);
            await dbContext.executeQuery(`CREATE TABLE ${tableB} (id INTEGER)`);

            const result = await dbContext.executeQuery('SHOW TABLES');
            const tableNames = result.map(r => r.name);

            expect(tableNames).toContain(tableA);
            expect(tableNames).toContain(tableB);

            await dbContext.dropTable(tableA);
            await dbContext.dropTable(tableB);
        });

        it('should handle BigInt values correctly', async () => {
            const tableName = `big_numbers_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${tableName} (id BIGINT)`);
            await dbContext.executeQuery(`INSERT INTO ${tableName} VALUES (9007199254740992)`);

            const result = await dbContext.executeQuery(`SELECT * FROM ${tableName}`);
            expect(typeof result[0].id).toBe('number');
            expect(result[0].id).toBeGreaterThan(Number.MAX_SAFE_INTEGER);

            await dbContext.dropTable(tableName);
        });

        it('should work with schemas', async () => {
            const schemaName = `schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery('CREATE TABLE products (id INTEGER, name VARCHAR)', schemaName);
            await dbContext.executeQuery("INSERT INTO products VALUES (1, 'Product A')", schemaName);

            const result = await dbContext.executeQuery('SELECT * FROM products', schemaName);
            expect(result).toEqual([{ id: 1, name: 'Product A' }]);

            await dbContext.dropTable('products', schemaName);
        });

        it('should handle geospatial queries', async () => {
            const tableName = `locations_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`
        CREATE TABLE ${tableName} (
          id INTEGER,
          name VARCHAR,
          geom GEOMETRY
        )
      `);

            await dbContext.executeQuery(`
        INSERT INTO ${tableName} VALUES
        (1, 'Tokyo', ST_Point(139.6917, 35.6895))
      `);

            const result = await dbContext.executeQuery(`
        SELECT
          id,
          name,
          ST_AsText(geom) as geom_text
        FROM ${tableName}
      `);

            expect(result).toHaveLength(1);
            expect(result[0].name).toBe('Tokyo');
            expect(result[0].geom_text).toContain('POINT');

            await dbContext.dropTable(tableName);
        });
    });

    describe('getTables', () => {
        it('should return list of tables in main schema', async () => {
            const table1 = `table1_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const table2 = `table2_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${table1} (id INTEGER)`);
            await dbContext.executeQuery(`CREATE TABLE ${table2} (id INTEGER)`);

            const tables = await dbContext.getTables();

            expect(tables).toContain(table1);
            expect(tables).toContain(table2);

            await dbContext.dropTable(table1);
            await dbContext.dropTable(table2);
        });

        it('should return tables from specific schema', async () => {
            const schemaName = `test_schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

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
            const tableName = `test_columns_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`
        CREATE TABLE ${tableName} (
          id INTEGER PRIMARY KEY,
          name VARCHAR(100),
          price DECIMAL(10,2),
          created_at TIMESTAMP,
          is_active BOOLEAN
        )
      `);

            const columns = await dbContext.getTableColumns(tableName);

            expect(columns).toContainEqual({ name: 'id', type: 'INTEGER' });
            expect(columns).toContainEqual({ name: 'name', type: 'VARCHAR' });
            expect(columns).toContainEqual({ name: 'price', type: 'DECIMAL(10,2)' });
            expect(columns).toContainEqual({ name: 'created_at', type: 'TIMESTAMP' });
            expect(columns).toContainEqual({ name: 'is_active', type: 'BOOLEAN' });

            await dbContext.dropTable(tableName);
        });

        it('should throw error for non-existent table', async () => {
            const nonExistentTable = `non_existent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await expect(dbContext.getTableColumns(nonExistentTable)).rejects.toThrow(
                `Table '${nonExistentTable}' does not exist or is not accessible`
            );
        });
    });

    describe('validateTable', () => {
        it('should return true for existing table', async () => {
            const tableName = `validation_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${tableName} (id INTEGER)`);

            const exists = await dbContext.validateTable(tableName);
            expect(exists).toBe(true);

            await dbContext.dropTable(tableName);
        });

        it('should return false for non-existent table', async () => {
            const nonExistentTable = `non_existent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            const exists = await dbContext.validateTable(nonExistentTable);
            expect(exists).toBe(false);
        });

        it('should validate table in specific schema', async () => {
            const schemaName = `schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

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
            const tableName = `to_drop_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`CREATE TABLE ${tableName} (id INTEGER)`);

            let tables = await dbContext.getTables();
            expect(tables).toContain(tableName);

            await dbContext.dropTable(tableName);

            tables = await dbContext.getTables();
            expect(tables).not.toContain(tableName);
        });

        it('should handle dropping non-existent table gracefully', async () => {
            const nonExistentTable = `non_existent_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            // Should not throw
            await expect(dbContext.dropTable(nonExistentTable)).resolves.not.toThrow();
        });
    });

    describe('describeTable', () => {
        it('should return detailed table structure', async () => {
            const tableName = `test_describe_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeQuery(`
        CREATE TABLE ${tableName} (
          id INTEGER PRIMARY KEY,
          name VARCHAR NOT NULL,
          optional_field VARCHAR
        )
      `);

            const description = await dbContext.describeTable(tableName);

            expect(description).toHaveLength(3);
            expect(description[0]).toHaveProperty('column_name', 'id');
            expect(description[0]).toHaveProperty('column_type', 'INTEGER');
            expect(description[1]).toHaveProperty('column_name', 'name');
            expect(description[2]).toHaveProperty('column_name', 'optional_field');

            await dbContext.dropTable(tableName);
        });
    });

    describe('createManagedConnection', () => {
        it('should create connection without schema', async () => {
            const tableName = `conn_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            const conn = await dbContext.createManagedConnection(null);

            await conn.query(`CREATE TABLE ${tableName} (id INTEGER)`);

            const tables = await dbContext.getTables();
            expect(tables).toContain(tableName);

            await conn.close();
            await dbContext.dropTable(tableName);
        });

        it('should create connection with schema', async () => {
            const schemaName = `conn_schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            const conn = await dbContext.createManagedConnection(schemaName);

            await conn.query('CREATE TABLE schema_conn_test (id INTEGER)');

            const tables = await dbContext.getTables(schemaName);
            expect(tables).toContain('schema_conn_test');

            await conn.close();
            await dbContext.dropTable('schema_conn_test', schemaName);
        });

        it('should handle concurrent connections', async () => {
            const table1 = `conn_test1_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const table2 = `conn_test2_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            const conn1 = await dbContext.createManagedConnection(null);
            const conn2 = await dbContext.createManagedConnection(null);

            await conn1.query(`CREATE TABLE ${table1} (id INTEGER)`);
            await conn2.query(`CREATE TABLE ${table2} (id INTEGER)`);

            const tables = await dbContext.getTables();
            expect(tables).toContain(table1);
            expect(tables).toContain(table2);

            await conn1.close();
            await conn2.close();
            await dbContext.dropTable(table1);
            await dbContext.dropTable(table2);
        });
    });

    describe('executeWithRefresh', () => {
        it('should execute operation and notify listeners', async () => {
            const tableName = `refresh_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
            const changes: Array<{ table?: string; schema?: string | null }> = [];

            const unsubscribe = dbContext.onTableChange((table, schema) => {
                changes.push({ table, schema });
            });

            await dbContext.executeWithRefresh(
                () => dbContext.executeQuery(`CREATE TABLE ${tableName} (id INTEGER)`),
                tableName
            );

            // Wait for notification
            await new Promise(resolve => setTimeout(resolve, 600));

            expect(changes).toContainEqual({ table: tableName, schema: null });

            unsubscribe();
            await dbContext.dropTable(tableName);
        });

        it('should validate table after creation', async () => {
            const tableName = `validated_table_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.executeWithRefresh(
                () => dbContext.executeQuery(`CREATE TABLE ${tableName} (id INTEGER)`),
                tableName
            );

            // Table should be validated and accessible
            const exists = await dbContext.validateTable(tableName);
            expect(exists).toBe(true);

            await dbContext.dropTable(tableName);
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

    // These tests use multiple connections, so run them sequentially to avoid resource contention
    describe('forceConsistency', () => {
        it('should force database consistency across connections', async () => {
            const tableName = `consistency_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            const conn1 = await dbContext.createManagedConnection(null);

            await conn1.query(`CREATE TABLE ${tableName} (id INTEGER)`);
            await dbContext.forceConsistency();

            // Should be visible from different connection
            const conn2 = await dbContext.createManagedConnection(null);
            const result = await conn2.query(
                `SELECT tbl_name FROM sqlite_master WHERE type='table' AND tbl_name='${tableName}'`
            );

            expect(result.numRows).toBeGreaterThan(0);

            await conn1.close();
            await conn2.close();
            await dbContext.dropTable(tableName);
        });
    });

    describe('getPoolStats', () => {
        it('should return connection pool statistics', async () => {
            const schemaName = `schema_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            // Get initial stats to track baseline
            const statsBefore = dbContext.getPoolStats();
            const nullSchemaStatsBefore = statsBefore.find(s => s.schema === null);
            const initialNullInUse = nullSchemaStatsBefore?.inUse ?? 0;

            const conn1 = await dbContext.createManagedConnection(null);
            const conn2 = await dbContext.createManagedConnection(schemaName);

            const stats = dbContext.getPoolStats();

            // Check that null schema exists and has increased by 1
            const nullSchemaStats = stats.find(s => s.schema === null);
            expect(nullSchemaStats).toBeDefined();
            expect(nullSchemaStats!.inUse).toBe(initialNullInUse + 1);

            // Check that schema was created with 1 connection in use
            expect(stats).toContainEqual(
                expect.objectContaining({
                    schema: schemaName,
                    total: 1,
                    inUse: 1,
                })
            );

            await conn1.close();
            await conn2.close();

            const statsAfter = dbContext.getPoolStats();

            // Check that null schema connections returned to baseline
            const nullSchemaStatsAfter = statsAfter.find(s => s.schema === null);
            expect(nullSchemaStatsAfter).toBeDefined();
            expect(nullSchemaStatsAfter!.inUse).toBe(initialNullInUse);

            // Check that schema has no connections in use
            expect(statsAfter).toContainEqual(
                expect.objectContaining({
                    schema: schemaName,
                    inUse: 0,
                })
            );
        });
    });

    describe('closeSchemaConnections', () => {
        it('should close all connections for a schema', async () => {
            const schemaName = `close_test_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

            await dbContext.createManagedConnection(schemaName);
            await dbContext.createManagedConnection(schemaName);

            let stats = dbContext.getPoolStats();
            expect(stats).toContainEqual(
                expect.objectContaining({
                    schema: schemaName,
                    total: 2,
                })
            );

            await dbContext.closeSchemaConnections(schemaName);

            stats = dbContext.getPoolStats();
            expect(stats).not.toContainEqual(
                expect.objectContaining({
                    schema: schemaName,
                })
            );
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
