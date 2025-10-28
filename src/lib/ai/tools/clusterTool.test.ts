import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createClusterTool } from './clusterTool';
import type { DBContext } from '../../duckdb/dbContext';

describe('createClusterTool', () => {
    let mockDbContext: DBContext;

    beforeEach(() => {
        mockDbContext = {
            getTableColumns: vi.fn(),
            executeQuery: vi.fn(),
        } as unknown as DBContext;
    });

    it('should create a tool with correct description', () => {
        const tool = createClusterTool(mockDbContext, null);

        expect(tool).toBeDefined();
        expect(tool.description).toContain('k-means cluster analysis');
        expect(tool.description).toContain('USE THIS TOOL WHEN');
        expect(tool.description).toContain('DO NOT USE THIS TOOL WHEN');
    });

    it('should successfully cluster simple data', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0.5, y: 0.5 },
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.9 },
            { x: 10, y: 10 },
            { x: 11, y: 11 },
            { x: 10.5, y: 10.5 },
            { x: 10.2, y: 10.3 },
            { x: 10.8, y: 10.9 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.tableName).toBe('test_table');
            expect(result.featureColumns).toEqual(['x', 'y']);
            expect(result.metrics.numClusters).toBe(2);
            expect(result.metrics.numSamples).toBe(10);
            expect(result.diagnostics.labels).toHaveLength(10);
            expect(result.suggestions).toBeDefined();
        }
    });

    it('should use default k=3 when not specified', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'feature1', type: 'DOUBLE' },
            { name: 'feature2', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { feature1: 0, feature2: 0 },
            { feature1: 1, feature2: 1 },
            { feature1: 0.5, feature2: 0.5 },
            { feature1: 5, feature2: 5 },
            { feature1: 6, feature2: 6 },
            { feature1: 5.5, feature2: 5.5 },
            { feature1: 10, feature2: 10 },
            { feature1: 11, feature2: 11 },
            { feature1: 10.5, feature2: 10.5 },
            { feature1: 10.2, feature2: 10.2 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            // @ts-expect-error - Testing default value by omitting k
            {
                table_name: 'test_table',
                feature_columns: ['feature1', 'feature2'],
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.metrics.numClusters).toBe(3); // Default value
        }
    });

    it('should return error for empty table name', async () => {
        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: '',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('テーブル名が指定されていません');
        }
    });

    it('should return error for insufficient numeric columns', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([{ name: 'x', type: 'VARCHAR' }]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('十分な数値カラムがありません');
        }
    });

    it('should return error for non-numeric feature column', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'VARCHAR' },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            // yがVARCHARなので数値カラムが1つしかなく、早期にエラーが出る
            expect(result.message).toContain('十分な数値カラムがありません');
        }
    });

    it('should return error for less than 2 feature columns', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([{ name: 'x', type: 'DOUBLE' }]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            // カラムが1つしかないので「十分な数値カラムがありません」エラーが先に出る
            expect(result.message).toContain('十分な数値カラムがありません');
        }
    });

    it('should return error when no data is returned', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('データを取得できませんでした');
        }
    });

    it('should return error when k is larger than data size', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0.5, y: 0.5 },
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.9 },
            { x: 10, y: 10 },
            { x: 11, y: 11 },
            { x: 10.5, y: 10.5 },
            { x: 10.2, y: 10.3 },
            { x: 10.8, y: 10.9 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 15, // k > data size (10)
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(result.message).toContain('クラスター数');
            expect(result.message).toContain('データ数');
        }
    });

    it('should skip rows with NULL values', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { x: 0, y: 0 },
            { x: null, y: 1 },
            { x: 1, y: 1 },
            { x: 0.5, y: 0.5 },
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.9 },
            { x: 0.3, y: 0.4 },
            { x: 10, y: 10 },
            { x: 11, y: null },
            { x: 10.5, y: 10.5 },
            { x: 10.2, y: 10.3 },
            { x: 10.8, y: 10.9 },
            { x: null, y: null },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.dataInfo.usedRows).toBe(10); // 10 valid rows
            expect(result.dataInfo.skippedRows).toBe(3);
            expect(result.warnings).toBeDefined();
            expect(result.warnings?.some(w => w.includes('除外しました'))).toBe(true);
        }
    });

    it('should suggest visualization for 2D data', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'width', type: 'DOUBLE' },
            { name: 'height', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { width: 0, height: 0 },
            { width: 1, height: 1 },
            { width: 0.5, height: 0.5 },
            { width: 0.2, height: 0.3 },
            { width: 0.8, height: 0.9 },
            { width: 10, height: 10 },
            { width: 11, height: 11 },
            { width: 10.5, height: 10.5 },
            { width: 10.2, height: 10.3 },
            { width: 10.8, height: 10.9 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['width', 'height'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.suggestions?.some(s => s.includes('散布図') || s.includes('Vega-Lite'))).toBe(true);
            expect(result.suggestions?.some(s => s.includes('width'))).toBe(true);
            expect(result.suggestions?.some(s => s.includes('height'))).toBe(true);
        }
    });

    it('should suggest multiple projections for 3D+ data', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
            { name: 'z', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { x: 0, y: 0, z: 0 },
            { x: 1, y: 1, z: 1 },
            { x: 0.5, y: 0.5, z: 0.5 },
            { x: 0.2, y: 0.3, z: 0.4 },
            { x: 0.8, y: 0.9, z: 0.7 },
            { x: 10, y: 10, z: 10 },
            { x: 11, y: 11, z: 11 },
            { x: 10.5, y: 10.5, z: 10.5 },
            { x: 10.2, y: 10.3, z: 10.4 },
            { x: 10.8, y: 10.9, z: 10.7 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y', 'z'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.suggestions?.some(s => s.includes('2次元プロジェクション'))).toBe(true);
        }
    });

    it('should provide silhouette score interpretation', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0.5, y: 0.5 },
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.9 },
            { x: 10, y: 10 },
            { x: 11, y: 11 },
            { x: 10.5, y: 10.5 },
            { x: 10.2, y: 10.3 },
            { x: 10.8, y: 10.9 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y'],
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.suggestions?.some(s => s.includes('Silhouette Score'))).toBe(true);
        }
    });

    it('should deduplicate feature columns', async () => {
        vi.mocked(mockDbContext.getTableColumns).mockResolvedValue([
            { name: 'x', type: 'DOUBLE' },
            { name: 'y', type: 'DOUBLE' },
        ]);

        vi.mocked(mockDbContext.executeQuery).mockResolvedValue([
            { x: 0, y: 0 },
            { x: 1, y: 1 },
            { x: 0.5, y: 0.5 },
            { x: 0.2, y: 0.3 },
            { x: 0.8, y: 0.9 },
            { x: 10, y: 10 },
            { x: 11, y: 11 },
            { x: 10.5, y: 10.5 },
            { x: 10.2, y: 10.3 },
            { x: 10.8, y: 10.9 },
        ]);

        const tool = createClusterTool(mockDbContext, null);
        const result = await tool.execute(
            {
                table_name: 'test_table',
                feature_columns: ['x', 'y', 'x', 'y'], // Duplicates
                k: 2,
            },
            {
                messages: [],
                toolCallId: '',
            }
        );

        expect(result.success).toBe(true);
        if (result.success) {
            expect(result.featureColumns).toEqual(['x', 'y']);
        }
    });
});
