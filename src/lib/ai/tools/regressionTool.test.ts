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
        expect(result.suggestions).toEqual(expect.arrayContaining([expect.stringContaining('predicted_sales')]));

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
});
