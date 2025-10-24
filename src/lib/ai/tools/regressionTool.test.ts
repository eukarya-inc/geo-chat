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
            { table_name: 'sales' },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        expect(result.message).toContain('回帰分析に十分な数値カラムがありません');
        expect(getTableColumns).toHaveBeenCalledWith('sales', null);
    });

    it('auto-selects target and predictors and returns suggestions with sanitized aliases', async () => {
        const rows = Array.from({ length: 12 }, (_, index) => ({
            sales: (index + 1) * 10,
            ad_spend: (index + 1) * 2,
            profit: (index + 1) * 5,
        }));

        // Inject some non-numeric values to trigger skippedRows warnings
        rows[3].sales = null as unknown as number;
        rows[5].ad_spend = Number.POSITIVE_INFINITY;

        const getTableColumns = vi.fn(async () => [
            { name: 'sales', type: 'DOUBLE' },
            { name: 'ad_spend', type: 'DOUBLE' },
            { name: 'profit', type: 'DOUBLE' },
        ]);

        const executeQuery = vi.fn(async (sql: string) => {
            const trimmedSql = sql.trim();
            if (trimmedSql.toUpperCase().startsWith('SELECT')) {
                expect(sql).toBe('SELECT "sales", "ad_spend", "profit" FROM "sales" LIMIT 5000;');
                return rows;
            }

            // Check for CREATE TABLE statement that uses SELECT
            expect(trimmedSql.toUpperCase().startsWith('CREATE') && trimmedSql.toUpperCase().includes('SELECT')).toBe(
                true
            );
            return [];
        });

        const dbContext = createMockDBContext({
            getTableColumns,
            executeQuery,
        });

        const tool = createRegressionTool(dbContext, null);
        const result = await tool.execute(
            { table_name: 'sales' },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        expect(result.tableName).toBe('sales');
        expect(result.autoSelection.target).toBe(true);
        expect(result.autoSelection.predictors).toBe(true);
        expect(result.predictorColumns.length).toBeGreaterThan(0);
        expect(result.dataInfo.totalRows).toBe(12);
        expect(result.dataInfo.usedRows).toBeLessThan(12);
        expect(result.dataInfo.skippedRows).toBeGreaterThan(0);

        expect(result.warnings).toEqual(
            expect.arrayContaining([
                expect.stringContaining('NULLまたは非数値値のために'),
                expect.stringContaining('サンプリング上限'),
            ])
        );

        expect(result.suggestions).toBeDefined();
        expect(result.suggestions?.some(s => s.includes('単回帰直線') || s.includes('散布図'))).toBe(true);

        const selectCall = executeQuery.mock.calls[0]?.[0] ?? '';
        expect(selectCall.startsWith('SELECT')).toBe(true);

        const additionalCalls = executeQuery.mock.calls.slice(1).map(([sql]) => sql as string);
        additionalCalls.forEach(sql => {
            expect(sql.startsWith('SELECT')).toBe(true);
        });
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

    it('auto-selects top 3 predictors when none specified (DEFAULT_TOP_K)', async () => {
        // Create data with 5 numeric columns but only 3 should be selected by default
        const rows = Array.from({ length: 20 }, (_, index) => ({
            target: (index + 1) * 10,
            predictor1: (index + 1) * 2, // High correlation
            predictor2: (index + 1) * 3, // High correlation
            predictor3: (index + 1) * 4, // High correlation
            predictor4: (index + 1) * 0.1, // Low correlation
            predictor5: (index + 1) * 0.05, // Very low correlation
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

        const tool = createRegressionTool(dbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                target_column: 'target',
                // No explanatory_columns specified - should auto-select top 3
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        if (!result.success) {
            throw new Error(`Expected success but got error: ${result.message}`);
        }

        // Should select exactly 3 predictors (DEFAULT_TOP_K)
        expect(result.predictorColumns.length).toBe(3);
        expect(result.autoSelection.predictors).toBe(true);

        // Should select the ones with highest correlation
        expect(result.predictorColumns).toContain('predictor1');
        expect(result.predictorColumns).toContain('predictor2');
        expect(result.predictorColumns).toContain('predictor3');
        expect(result.predictorColumns).not.toContain('predictor4');
        expect(result.predictorColumns).not.toContain('predictor5');
    });
});
