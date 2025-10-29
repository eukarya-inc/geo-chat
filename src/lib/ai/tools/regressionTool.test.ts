import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createRegressionTool } from './regressionTool';
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

describe('createRegressionTool', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('returns an error when the table lacks enough numeric columns', async () => {
        const getTableColumns = vi.fn(async () => [
            { name: 'category', type: 'VARCHAR' },
            { name: 'label', type: 'TEXT' },
        ]);

        const dbContext = createMockDBContext({
            getTableColumns,
        });

        const tool = createRegressionTool(dbContext, null);
        const result = await tool.execute(
            { table_name: 'sales', target_column: 'category', explanatory_columns: ['label'] },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain('回帰分析に十分な数値カラムがありません');
        expect(getTableColumns).toHaveBeenCalledWith('sales', null);
    });

    it('rejects invalid predictor column requests', async () => {
        const getTableColumns = vi.fn(async () => [
            { name: 'sales', type: 'DOUBLE' },
            { name: 'cost', type: 'DOUBLE' },
        ]);
        const executeQuery = vi.fn();

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createRegressionTool(dbContext, null);
        const result = await tool.execute(
            { table_name: 'sales', target_column: 'sales', explanatory_columns: ['missing'] },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain('説明変数カラム「missing」');
        expect(executeQuery).not.toHaveBeenCalled();
    });

    it('includes simple linear regression data in columnSummaries for predictors', async () => {
        // Create synthetic data with clear linear relationships
        const rows = Array.from({ length: 20 }, (_, index) => ({
            y: (index + 1) * 10, // target
            x1: (index + 1) * 2, // x1 = 0.2 * y (slope should be ~5)
            x2: (index + 1) * 3, // x2 = 0.3 * y (slope should be ~3.33)
        }));

        const getTableColumns = vi.fn(async () => [
            { name: 'y', type: 'DOUBLE' },
            { name: 'x1', type: 'DOUBLE' },
            { name: 'x2', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async (sql: string) => {
            if (sql.trim().toUpperCase().startsWith('SELECT')) {
                return rows;
            }
            return [];
        });

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createRegressionTool(dbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                target_column: 'y',
                explanatory_columns: ['x1', 'x2'],
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        // Check that simple regression data is included for predictors
        expect(result.columnSummaries.x1).toBeDefined();
        expect(result.columnSummaries.x1.simpleRegression).toBeDefined();
        expect(result.columnSummaries.x1.simpleRegression?.slope).toBeCloseTo(5, 1);
        expect(result.columnSummaries.x1.simpleRegression?.intercept).toBeCloseTo(0, 1);

        expect(result.columnSummaries.x2).toBeDefined();
        expect(result.columnSummaries.x2.simpleRegression).toBeDefined();
        expect(result.columnSummaries.x2.simpleRegression?.slope).toBeCloseTo(3.33, 1);
        expect(result.columnSummaries.x2.simpleRegression?.intercept).toBeCloseTo(0, 1);

        // Target should not have simple regression
        expect(result.columnSummaries.y).toBeDefined();
        expect(result.columnSummaries.y.simpleRegression).toBeUndefined();

        // Check suggestions mention simple regression
        expect(result.suggestions).toBeDefined();
        expect(result.suggestions?.some(s => s.includes('単回帰直線'))).toBe(true);
    });
});
