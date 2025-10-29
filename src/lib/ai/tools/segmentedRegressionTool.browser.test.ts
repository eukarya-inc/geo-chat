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

        // Insert data for two segments (need at least 10 rows per segment for regression)
        // Segment 0: y = 2x + 1
        await dbContext.executeQuery(
            `INSERT INTO test_table VALUES
                (0, 1.0, 3.0),
                (0, 2.0, 5.0),
                (0, 3.0, 7.0),
                (0, 4.0, 9.0),
                (0, 5.0, 11.0),
                (0, 6.0, 13.0),
                (0, 7.0, 15.0),
                (0, 8.0, 17.0),
                (0, 9.0, 19.0),
                (0, 10.0, 21.0);`,
            null
        );

        // Segment 1: y = -1x + 10
        await dbContext.executeQuery(
            `INSERT INTO test_table VALUES
                (1, 1.0, 9.0),
                (1, 2.0, 8.0),
                (1, 3.0, 7.0),
                (1, 4.0, 6.0),
                (1, 5.0, 5.0),
                (1, 6.0, 4.0),
                (1, 7.0, 3.0),
                (1, 8.0, 2.0),
                (1, 9.0, 1.0),
                (1, 10.0, 0.0);`,
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
                expect(segment0.dataInfo.usedRows).toBe(10);
                const xMetric = segment0.regression.metricsPerPredictor.find(m => m.name === 'x');
                expect(xMetric?.beta).toBeCloseTo(2, 0);
            }

            // Check segment 1 (negative slope ~-1)
            const segment1 = result.segments.find(s => s.segmentValue === 1);
            expect(segment1).toBeDefined();
            if (segment1) {
                expect(segment1.dataInfo.usedRows).toBe(10);
                const xMetric = segment1.regression.metricsPerPredictor.find(m => m.name === 'x');
                expect(xMetric?.beta).toBeCloseTo(-1, 0);
            }

            // Check comparison
            expect(result.comparison.numSegments).toBe(2);
            expect(result.comparison.rSquaredBySegment).toHaveLength(2);
            expect(result.comparison.coefficientsBySegment.x).toHaveLength(2);
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
});
