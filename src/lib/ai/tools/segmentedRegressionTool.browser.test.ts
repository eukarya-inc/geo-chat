import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBContext, type DBContext } from '../../duckdb/dbContext';
import { createSegmentedRegressionTool } from './segmentedRegressionTool';
import { executeToolForTest } from './toolTestHelper';
import type { SegmentedRegressionResponse } from '../../../types/segmentedRegression';
import { suppressConsole } from '../../../test/console';
import { initializeDuckDB } from '../../../test/duckdb';

describe('segmentedRegressionTool (browser, real DuckDB-WASM)', () => {
    let db: AsyncDuckDB;
    let dbContext: DBContext;
    let restoreConsole: (() => void) | undefined;

    beforeAll(async () => {
        // Suppress console output during tests
        restoreConsole = suppressConsole();

        // Initialize DuckDB-WASM
        db = await initializeDuckDB();

        dbContext = createDBContext(db);
    }, 30000);

    afterAll(async () => {
        // Restore console
        restoreConsole?.();

        if (db) {
            await db.terminate();
        }
    });

    it('should create execution plan with segment_column and specified predictors', async () => {
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
        await dbContext.executeQuery(
            `INSERT INTO test_table VALUES
                (0, 1.0, 3.0),
                (0, 2.0, 5.0),
                (1, 1.0, 9.0),
                (1, 2.0, 8.0);`,
            null
        );

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await executeToolForTest<SegmentedRegressionResponse>(
            tool.execute,
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
            expect(result.plan).toBeDefined();
            expect(result.plan.sourceTable).toBe('test_table');
            expect(result.plan.segmentColumn).toBe('segment');
            expect(result.plan.targetColumn).toBe('y');
            expect(result.plan.predictorColumns).toEqual(['x']);
            expect(result.plan.segments).toHaveLength(2);
            expect(result.plan.totalSegments).toBe(2);

            // When predictors are specified, no common steps should exist
            expect(result.plan.commonSteps).toBeUndefined();

            // Check each segment has correct steps
            for (const segment of result.plan.segments) {
                expect(segment.steps).toHaveLength(3); // create table, regression, scatter charts
                expect(segment.steps[0].tool).toBe('create_scatter_charts');
                expect(segment.steps[1].tool).toBe('perform_regression_analysis');
                expect(segment.steps[2].tool).toBe('create_scatter_charts');
            }
        }
    }, 15000);

    it('should create execution plan with auto-selected predictors and commonSteps', async () => {
        // Create test table with segments
        await dbContext.executeQuery(
            `CREATE TABLE test_table_auto (
                segment INTEGER,
                x1 DOUBLE,
                x2 DOUBLE,
                x3 DOUBLE,
                y DOUBLE
            );`,
            null
        );

        // Insert data for two segments
        await dbContext.executeQuery(
            `INSERT INTO test_table_auto VALUES
                (0, 1.0, 2.0, 3.0, 3.0),
                (0, 2.0, 3.0, 4.0, 5.0),
                (1, 1.0, 2.0, 3.0, 9.0),
                (1, 2.0, 3.0, 4.0, 8.0);`,
            null
        );

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await executeToolForTest<SegmentedRegressionResponse>(
            tool.execute,
            {
                table_name: 'test_table_auto',
                target_column: 'y',
                segment_column: 'segment',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.plan).toBeDefined();
            expect(result.plan.sourceTable).toBe('test_table_auto');
            expect(result.plan.segmentColumn).toBe('segment');
            expect(result.plan.targetColumn).toBe('y');
            expect(result.plan.segments).toHaveLength(2);

            // When predictors are NOT specified, commonSteps should exist
            expect(result.plan.commonSteps).toBeDefined();
            expect(result.plan.commonSteps).toHaveLength(1);
            expect(result.plan.commonSteps?.[0].tool).toBe('select_predictors_for_regression');
            expect(result.plan.commonSteps?.[0].parameters).toEqual({
                table_name: 'test_table_auto',
                target_column: 'y',
                top_k: 3,
            });

            // Check each segment has correct steps (no predictor selection step)
            for (const segment of result.plan.segments) {
                expect(segment.steps).toHaveLength(3); // create table, regression, scatter charts
                expect(segment.steps[0].tool).toBe('create_scatter_charts');
                expect(segment.steps[1].tool).toBe('perform_regression_analysis');
                expect(segment.steps[2].tool).toBe('create_scatter_charts');
            }
        }
    }, 15000);

    it('should return error if neither segment_column nor cluster_labels_table_name is provided', async () => {
        await dbContext.executeQuery(`CREATE TABLE test_table2 (x DOUBLE, y DOUBLE);`, null);

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await executeToolForTest<SegmentedRegressionResponse>(
            tool.execute,
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

    it('should return error if no segments are found', async () => {
        await dbContext.executeQuery(`CREATE TABLE test_table3 (segment INTEGER, x DOUBLE, y DOUBLE);`, null);

        const tool = createSegmentedRegressionTool(dbContext, null);

        const result = await executeToolForTest<SegmentedRegressionResponse>(
            tool.execute,
            {
                table_name: 'test_table3',
                target_column: 'y',
                explanatory_columns: ['x'],
                segment_column: 'segment',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('セグメント値が見つかりませんでした');
        }
    }, 15000);
});
