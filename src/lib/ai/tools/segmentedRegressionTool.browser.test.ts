import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBContext, type DBContext } from '../../duckdb/dbContext';
import { createSegmentedRegressionTool } from './segmentedRegressionTool';

describe('segmentedRegressionTool (browser, real DuckDB-WASM)', () => {
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
            error: console.error,
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

        await db.open({ path: ':memory:', accessMode: duckdb.DuckDBAccessMode.READ_WRITE });

        dbContext = createDBContext(db);
    }, 30000);

    afterAll(async () => {
        // Restore console
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;

        if (db) {
            await db.terminate();
        }
    });

    it('should perform segmented regression with segment_column', async () => {
        // Create test table with segments
        await dbContext.executeQuery(
            `CREATE TABLE test_table (
                segment INTEGER,
                x DOUBLE,
                y DOUBLE
            );`,
            null
        );

        // Insert data for two segments
        // Segment 0: y = 2x + 1
        await dbContext.executeQuery(
            `INSERT INTO test_table VALUES
                (0, 1.0, 3.0),
                (0, 2.0, 5.0),
                (0, 3.0, 7.0),
                (0, 4.0, 9.0),
                (0, 5.0, 11.0);`,
            null
        );

        // Segment 1: y = -1x + 10
        await dbContext.executeQuery(
            `INSERT INTO test_table VALUES
                (1, 1.0, 9.0),
                (1, 2.0, 8.0),
                (1, 3.0, 7.0),
                (1, 4.0, 6.0),
                (1, 5.0, 5.0);`,
            null
        );

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await tool.execute(
            {
                table_name: 'test_table',
                target_column: 'y',
                explanatory_columns: ['x'],
                segment_column: 'segment',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.tableName).toBe('test_table');
            expect(result.segmentColumn).toBe('segment');
            expect(result.targetColumn).toBe('y');
            expect(result.predictorColumns).toEqual(['x']);
            expect(result.segments).toHaveLength(2);

            // Check segment 0 (positive slope ~2)
            const segment0 = result.segments.find(s => s.segmentValue === 0);
            expect(segment0).toBeDefined();
            if (segment0) {
                expect(segment0.dataInfo.usedRows).toBe(5);
                const xMetric = segment0.regression.metricsPerPredictor.find(m => m.name === 'x');
                expect(xMetric?.beta).toBeCloseTo(2, 0);
            }

            // Check segment 1 (negative slope ~-1)
            const segment1 = result.segments.find(s => s.segmentValue === 1);
            expect(segment1).toBeDefined();
            if (segment1) {
                expect(segment1.dataInfo.usedRows).toBe(5);
                const xMetric = segment1.regression.metricsPerPredictor.find(m => m.name === 'x');
                expect(xMetric?.beta).toBeCloseTo(-1, 0);
            }

            // Check comparison
            expect(result.comparison.numSegments).toBe(2);
            expect(result.comparison.rSquaredBySegment).toHaveLength(2);
            expect(result.comparison.coefficientsBySegment.x).toHaveLength(2);
        }
    }, 15000);

    it('should perform segmented regression with cluster_labels_table_name', async () => {
        // Create main table
        await dbContext.executeQuery(
            `CREATE TABLE main_table (
                x DOUBLE,
                y DOUBLE
            );`,
            null
        );

        // Insert data
        await dbContext.executeQuery(
            `INSERT INTO main_table VALUES
                (1.0, 3.0),
                (2.0, 5.0),
                (3.0, 7.0),
                (4.0, 6.0),
                (5.0, 4.0);`,
            null
        );

        // Create cluster labels table
        await dbContext.executeQuery(
            `CREATE TABLE main_table_cluster_labels (
                row_id INTEGER,
                cluster INTEGER
            );`,
            null
        );

        await dbContext.executeQuery(
            `INSERT INTO main_table_cluster_labels VALUES
                (1, 0),
                (2, 0),
                (3, 0),
                (4, 1),
                (5, 1);`,
            null
        );

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await tool.execute(
            {
                table_name: 'main_table',
                target_column: 'y',
                explanatory_columns: ['x'],
                cluster_labels_table_name: 'main_table_cluster_labels',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.tableName).toBe('main_table');
            expect(result.segmentColumn).toBe('cluster');
            expect(result.segments).toHaveLength(2);

            // Check that both segments were analyzed
            const segment0 = result.segments.find(s => s.segmentValue === 0);
            const segment1 = result.segments.find(s => s.segmentValue === 1);
            expect(segment0).toBeDefined();
            expect(segment1).toBeDefined();

            if (segment0) {
                expect(segment0.dataInfo.usedRows).toBe(3);
            }
            if (segment1) {
                expect(segment1.dataInfo.usedRows).toBe(2);
            }
        }
    }, 15000);

    it('should return error if neither segment_column nor cluster_labels_table_name is provided', async () => {
        await dbContext.executeQuery(`CREATE TABLE test_table2 (x DOUBLE, y DOUBLE);`, null);

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await tool.execute(
            {
                table_name: 'test_table2',
                target_column: 'y',
                explanatory_columns: ['x'],
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('segment_column または cluster_labels_table_name');
        }
    }, 15000);

    it('should return error if segment column does not exist', async () => {
        await dbContext.executeQuery(`CREATE TABLE test_table3 (x DOUBLE, y DOUBLE);`, null);

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await tool.execute(
            {
                table_name: 'test_table3',
                target_column: 'y',
                explanatory_columns: ['x'],
                segment_column: 'nonexistent',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('セグメントカラム「nonexistent」が存在しません');
        }
    }, 15000);

    it('should skip segments with insufficient data', async () => {
        await dbContext.executeQuery(
            `CREATE TABLE test_table4 (
                segment INTEGER,
                x DOUBLE,
                y DOUBLE
            );`,
            null
        );

        // Segment 0: sufficient data
        await dbContext.executeQuery(
            `INSERT INTO test_table4 VALUES
                (0, 1.0, 2.0),
                (0, 2.0, 4.0),
                (0, 3.0, 6.0),
                (0, 4.0, 8.0),
                (0, 5.0, 10.0),
                (0, 6.0, 12.0),
                (0, 7.0, 14.0),
                (0, 8.0, 16.0),
                (0, 9.0, 18.0),
                (0, 10.0, 20.0);`,
            null
        );

        // Segment 1: insufficient data (only 2 rows)
        await dbContext.executeQuery(
            `INSERT INTO test_table4 VALUES
                (1, 1.0, 100.0),
                (1, 2.0, 200.0);`,
            null
        );

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await tool.execute(
            {
                table_name: 'test_table4',
                target_column: 'y',
                explanatory_columns: ['x'],
                segment_column: 'segment',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            // Only segment 0 should be included
            expect(result.segments).toHaveLength(1);
            expect(result.segments[0].segmentValue).toBe(0);

            // Should have warning about segment 1
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.some(w => w.includes('segment=1'))).toBe(true);
        }
    }, 15000);

    it('should handle multiple predictors', async () => {
        await dbContext.executeQuery(
            `CREATE TABLE test_table5 (
                segment INTEGER,
                x1 DOUBLE,
                x2 DOUBLE,
                y DOUBLE
            );`,
            null
        );

        // Segment 0: y = 2*x1 + 3*x2 + 1
        await dbContext.executeQuery(
            `INSERT INTO test_table5 VALUES
                (0, 1.0, 1.0, 6.0),
                (0, 2.0, 2.0, 11.0),
                (0, 3.0, 3.0, 16.0),
                (0, 4.0, 4.0, 21.0),
                (0, 5.0, 5.0, 26.0);`,
            null
        );

        // Segment 1: y = -1*x1 + 2*x2 + 5
        await dbContext.executeQuery(
            `INSERT INTO test_table5 VALUES
                (1, 1.0, 1.0, 6.0),
                (1, 2.0, 2.0, 7.0),
                (1, 3.0, 3.0, 8.0),
                (1, 4.0, 4.0, 9.0),
                (1, 5.0, 5.0, 10.0);`,
            null
        );

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await tool.execute(
            {
                table_name: 'test_table5',
                target_column: 'y',
                explanatory_columns: ['x1', 'x2'],
                segment_column: 'segment',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.segments).toHaveLength(2);
            expect(result.predictorColumns).toEqual(['x1', 'x2']);

            // Check coefficients are captured in comparison
            expect(result.comparison.coefficientsBySegment).toHaveProperty('x1');
            expect(result.comparison.coefficientsBySegment).toHaveProperty('x2');
            expect(result.comparison.coefficientsBySegment.x1).toHaveLength(2);
            expect(result.comparison.coefficientsBySegment.x2).toHaveLength(2);
        }
    }, 15000);
});
