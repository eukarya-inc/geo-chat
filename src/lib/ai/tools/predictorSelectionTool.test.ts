import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { PredictorSelectionResponse } from '../../../types/predictorSelection';
import { executeToolForTest } from './toolTestHelper';
import { createPredictorSelectionTool } from './predictorSelectionTool';
import type { DBContext } from '../../duckdb/dbContext';
import { SQLHistoryManager } from '../../duckdb/sqlHistoryManager';

function createMockDBContext(overrides: Partial<DBContext> = {}): DBContext {
    const base: DBContext = {
        createManagedConnection: async () => {
            throw new Error('Not implemented in tests');
        },
        forceConsistency: async () => {},
        notifyTableChange: () => {},
        onTableChange: () => () => {},
        executeWithRefresh: async <T>(operation: () => Promise<T>) => operation(),
        validateTable: async () => false,
        getTables: async () => [],
        getTableColumns: async () => [],
        executeQuery: async () => [],
        getSQLHistory: () => new SQLHistoryManager(),
        dropTable: async () => {},
        describeTable: async () => [],
        getPoolStats: () => [],
        closeSchemaConnections: async () => {},
        createSchema: async () => {},
        deleteSchema: async () => {},
        downloadTable: async () => ({}) as Blob,
        createTableFromUrl: async () => '',
    };

    return { ...base, ...overrides };
}

describe('createPredictorSelectionTool', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('selects top 3 predictors by default', async () => {
        // Use deterministic data with controlled correlation
        const rows = Array.from({ length: 20 }, (_, index) => ({
            target: (index + 1) * 10 + (index % 3) * 15 - 15, // Controlled variation
            predictor1: (index + 1) * 2 + (index % 5) * 3 - 6,
            predictor2: (index + 1) * 3 + (index % 4) * 5 - 7,
            predictor3: (index + 1) * 4 + (index % 6) * 4 - 10,
            predictor4: (index + 1) * 0.1 + (index % 7) * 2 - 6,
            predictor5: (index + 1) * 0.05 + (index % 8) * 1.5 - 5,
        }));

        const getTableColumns = vi.fn(async () => [
            { name: 'target', type: 'DOUBLE' },
            { name: 'predictor1', type: 'DOUBLE' },
            { name: 'predictor2', type: 'DOUBLE' },
            { name: 'predictor3', type: 'DOUBLE' },
            { name: 'predictor4', type: 'DOUBLE' },
            { name: 'predictor5', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async () => rows);

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createPredictorSelectionTool(dbContext, null);
        const result = await executeToolForTest<PredictorSelectionResponse>(
            tool.execute,
            {
                table_name: 'test_table',
                target_column: 'target',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        // Should select up to 3 predictors (may be less if high correlation detected)
        expect(result.selectedPredictors.length).toBeGreaterThan(0);
        expect(result.selectedPredictors.length).toBeLessThanOrEqual(3);
        expect(result.topK).toBe(3);
        // All selected predictors should be from the available list
        result.selectedPredictors.forEach(p => {
            expect(['predictor1', 'predictor2', 'predictor3', 'predictor4', 'predictor5']).toContain(p);
        });
    });

    it('detects and excludes high correlation predictors (>0.95)', async () => {
        const rows = Array.from({ length: 20 }, (_, index) => ({
            revenue_per_employee: (index + 1) * 100 + (index % 2) * 5, // Add tiny variation
            revenue: (index + 1) * 100 * 5 + (index % 2) * 25, // Perfect correlation (circular dependency)
            employees: (index + 1) * 5 + (index % 3) * 2,
            vehicles: (index + 1) * 2 + (index % 4),
        }));

        const getTableColumns = vi.fn(async () => [
            { name: 'revenue_per_employee', type: 'DOUBLE' },
            { name: 'revenue', type: 'DOUBLE' },
            { name: 'employees', type: 'DOUBLE' },
            { name: 'vehicles', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async () => rows);

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createPredictorSelectionTool(dbContext, null);
        const result = await executeToolForTest<PredictorSelectionResponse>(
            tool.execute,
            {
                table_name: 'business',
                target_column: 'revenue_per_employee',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        // High correlation may cause all predictors to be excluded, which is a valid error case
        if (result.success) {
            // If successful, 'revenue' should be excluded due to high correlation
            expect(result.selectedPredictors).not.toContain('revenue');
            expect(
                result.excludedPredictors.some(e => e.predictor === 'revenue' && e.reason === 'high_correlation')
            ).toBe(true);
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.some(w => w.includes('revenue') && w.includes('循環依存'))).toBe(true);
        } else {
            // If all predictors were excluded, error message should mention circular dependency
            expect(result.message).toContain('循環依存');
        }
    });

    it('respects exclude_columns parameter', async () => {
        const rows = Array.from({ length: 20 }, (_, index) => ({
            target: (index + 1) * 10 + (index % 3) * 15 - 15,
            predictor1: (index + 1) * 2 + (index % 5) * 3 - 6,
            predictor2: (index + 1) * 3 + (index % 4) * 5 - 7,
            predictor3: (index + 1) * 4 + (index % 6) * 4 - 10,
            id: index + 1 + (index % 7) * 2 - 6,
        }));

        const getTableColumns = vi.fn(async () => [
            { name: 'target', type: 'DOUBLE' },
            { name: 'predictor1', type: 'DOUBLE' },
            { name: 'predictor2', type: 'DOUBLE' },
            { name: 'predictor3', type: 'DOUBLE' },
            { name: 'id', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async () => rows);

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createPredictorSelectionTool(dbContext, null);
        const result = await executeToolForTest<PredictorSelectionResponse>(
            tool.execute,
            {
                table_name: 'test_table',
                target_column: 'target',
                exclude_columns: ['id', 'predictor1'],
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        // Excluded columns should not be in the selected list
        expect(result.selectedPredictors).not.toContain('id');
        expect(result.selectedPredictors).not.toContain('predictor1');
        // Note: excludedPredictors only contains predictors that failed validation or have high correlation
        // User-excluded columns are simply not considered, so they won't appear in excludedPredictors
    });

    it('allows custom top_k parameter', async () => {
        const rows = Array.from({ length: 20 }, (_, index) => ({
            target: (index + 1) * 10 + (index % 3) * 15 - 15,
            predictor1: (index + 1) * 2 + (index % 5) * 3 - 6,
            predictor2: (index + 1) * 3 + (index % 4) * 5 - 7,
            predictor3: (index + 1) * 4 + (index % 6) * 4 - 10,
            predictor4: (index + 1) * 5 + (index % 7) * 5 - 12,
            predictor5: (index + 1) * 6 + (index % 8) * 6 - 16,
        }));

        const getTableColumns = vi.fn(async () => [
            { name: 'target', type: 'DOUBLE' },
            { name: 'predictor1', type: 'DOUBLE' },
            { name: 'predictor2', type: 'DOUBLE' },
            { name: 'predictor3', type: 'DOUBLE' },
            { name: 'predictor4', type: 'DOUBLE' },
            { name: 'predictor5', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async () => rows);

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createPredictorSelectionTool(dbContext, null);
        const result = await executeToolForTest<PredictorSelectionResponse>(
            tool.execute,
            {
                table_name: 'test_table',
                target_column: 'target',
                top_k: 5,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        // Should select up to 5 predictors (may be less if high correlation detected)
        expect(result.selectedPredictors.length).toBeGreaterThan(0);
        expect(result.selectedPredictors.length).toBeLessThanOrEqual(5);
        // topK reflects the actual number selected (after high correlation filtering)
        expect(result.topK).toBe(result.selectedPredictors.length);
    });

    it('returns correlation scores for selected predictors', async () => {
        const rows = Array.from({ length: 20 }, (_, index) => ({
            target: (index + 1) * 10 + (index % 3) * 15 - 15,
            predictor1: (index + 1) * 2 + (index % 5) * 3 - 6,
            predictor2: (index + 1) * 3 + (index % 4) * 5 - 7,
        }));

        const getTableColumns = vi.fn(async () => [
            { name: 'target', type: 'DOUBLE' },
            { name: 'predictor1', type: 'DOUBLE' },
            { name: 'predictor2', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async () => rows);

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createPredictorSelectionTool(dbContext, null);
        const result = await executeToolForTest<PredictorSelectionResponse>(
            tool.execute,
            {
                table_name: 'test_table',
                target_column: 'target',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        expect(result.predictorCorrelations).toBeDefined();
        expect(result.predictorCorrelations.length).toBeGreaterThan(0);
        result.predictorCorrelations.forEach(corr => {
            expect(corr.predictor).toBeDefined();
            expect(typeof corr.correlation).toBe('number');
            expect(typeof corr.absoluteCorrelation).toBe('number');
            expect(corr.pairCount).toBeGreaterThan(0);
        });
    });

    it('returns error when table has insufficient numeric columns', async () => {
        const getTableColumns = vi.fn(async () => [
            { name: 'name', type: 'VARCHAR' },
            { name: 'predictor1', type: 'DOUBLE' },
        ]);

        const dbContext = createMockDBContext({
            getTableColumns,
        });

        const tool = createPredictorSelectionTool(dbContext, null);
        const result = await executeToolForTest<PredictorSelectionResponse>(
            tool.execute,
            {
                table_name: 'test_table',
                target_column: 'predictor1',
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain('数値カラムがありません');
    });
});
