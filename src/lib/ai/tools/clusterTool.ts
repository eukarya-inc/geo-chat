import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import { kmeans } from '../../../utils/clustering/kmeans';
import type { ClusterAnalysisResponse } from '../../../types/clustering';

const DEFAULT_MAX_ROWS = 100;
const MAX_ALLOWED_ROWS = 5000;
const MIN_REQUIRED_ROWS = 10;
const AUTO_SAMPLING_THRESHOLD = 500;
const DEFAULT_K = 3;
const MIN_K = 2;
const MAX_K = 10;

export function createClusterTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Perform k-means cluster analysis on DuckDB tables to discover natural groupings in data.
Returns cluster labels, centroids, inertia, silhouette score, and cluster sizes.

USE THIS TOOL WHEN:
- User wants to discover natural groupings/segments in data based on numeric features
- User says "グループ分け", "分類", "セグメント化", "クラスタリング" without specifying explicit rules
- User wants to group entities (customers, companies, products) by similarity
- User provides multiple numeric columns for analysis (e.g., "従業員数と売上高で分類")

DO NOT USE THIS TOOL WHEN:
- User specifies explicit categorization rules (e.g., "従業員数100人以上は大企業") → Use SQL CASE instead
- User wants quantile-based segmentation (e.g., "売上高で上位25%") → Use SQL NTILE instead
- User has predefined category labels to apply

EXAMPLES OF WHEN TO USE:
✓ "貨物運送事業者を従業員数・売上高で分類してください"
✓ "顧客を購入傾向で自動的にグループ分けしてください"
✓ "似た特性の企業をセグメント化してください"
✓ "クラスター分析で事業者を分類してください"

EXAMPLES OF WHEN NOT TO USE:
✗ "従業員数100人以上を大企業として分類してください" → SQL: CASE WHEN employees >= 100 THEN '大企業'
✗ "売上高で3段階に分けてください" → SQL: NTILE(3) OVER (ORDER BY sales)
✗ "年齢層ごとに集計してください" → SQL: GROUP BY age_group

DEFAULT BEHAVIOR:
- Automatically uses k=3 clusters (small/medium/large or low/medium/high grouping)
- User can override by specifying different k value (2-10)
- Analyzes up to 100 rows by default (configurable up to 5000)

IMPORTANT AUTO-SAMPLING:
- If the input table has more than 500 rows, the tool automatically creates a sampled table with 500 rows
- The sampled table is named {original_table}_sampled_for_clustering
- This prevents AI from stalling when processing large datasets
- The tool analyzes up to max_rows (default: 100, max: 5000) from the table
- For visualization, only 100 points are recommended due to Vega-Lite rendering limits
- The tool will automatically suggest creating a sampled table for visualization

IMPORTANT: After using this tool successfully, ALWAYS create visualizations:
1. Create a new table with cluster labels added
2. For visualization, create a sampled table with LIMIT 100
3. For 2D data: Create scatter plot with points colored by cluster label
4. For 3D data: Consider creating multiple 2D projections
5. Suggest appropriate SQL queries for creating these tables

CRITICAL - DO NOT CREATE SUMMARY TABLES:
- DO NOT create separate summary tables (e.g., cluster_summary, {table}_summary)
- The tool result already includes cluster statistics (sizes, centroids, quality metrics)
- Display cluster summary information as TEXT in your response, not as a new table
- Only create tables for visualization purposes (scatter plots), not for summary statistics
- If you need to show cluster statistics, use the clustering result data directly in your text response`,
        parameters: z.object({
            table_name: z.string().describe('Table name to analyze'),
            feature_columns: z
                .array(z.string())
                .min(2)
                .describe('Feature columns for clustering (minimum 2 numeric columns)'),
            k: z
                .number()
                .int()
                .min(MIN_K)
                .max(MAX_K)
                .optional()
                .default(DEFAULT_K)
                .describe('Number of clusters (default: 3, range: 2-10)'),
            max_rows: z
                .number()
                .int()
                .min(MIN_REQUIRED_ROWS)
                .max(MAX_ALLOWED_ROWS)
                .optional()
                .describe('Maximum number of rows to sample for analysis (default: 1000, max: 5000)'),
            init_method: z
                .enum(['random', 'kmeans++'])
                .optional()
                .describe('Initialization method (default: kmeans++)'),
        }),
        execute: async ({ table_name, feature_columns, k = DEFAULT_K, max_rows, init_method }) => {
            try {
                let tableName = table_name.trim();
                if (!tableName) {
                    return errorResponse('テーブル名が指定されていません。');
                }

                let sanitizedTable = quoteIdentifier(tableName);
                let qualifiedTable = schema ? `${quoteIdentifier(schema)}.${sanitizedTable}` : sanitizedTable;

                // Check table row count and auto-sample if needed
                let originalTableName: string | null = null;
                let originalRowCount: number | null = null;
                const countQuery = `SELECT COUNT(*) as count FROM ${qualifiedTable};`;
                const countResult = await dbContext.executeQuery(countQuery, schema);

                if (Array.isArray(countResult) && countResult.length > 0) {
                    const rowCount = Number(countResult[0]?.count);
                    if (Number.isFinite(rowCount) && rowCount > AUTO_SAMPLING_THRESHOLD) {
                        originalTableName = tableName;
                        originalRowCount = rowCount;

                        // Create sampled table
                        const sampledTableName = `${tableName}_sampled_for_clustering`;
                        const sampledSanitized = quoteIdentifier(sampledTableName);
                        const sampledQualified = schema
                            ? `${quoteIdentifier(schema)}.${sampledSanitized}`
                            : sampledSanitized;

                        // Drop existing sampled table if exists
                        try {
                            await dbContext.executeQuery(`DROP TABLE IF EXISTS ${sampledQualified};`, schema);
                        } catch {
                            // Ignore drop errors
                        }

                        // Create new sampled table using random sampling
                        const createSampledQuery = `CREATE TABLE ${sampledQualified} AS
                            SELECT * FROM ${qualifiedTable}
                            ORDER BY random()
                            LIMIT ${AUTO_SAMPLING_THRESHOLD};`;
                        await dbContext.executeQuery(createSampledQuery, schema);

                        // Update table reference to use sampled table
                        tableName = sampledTableName;
                        sanitizedTable = sampledSanitized;
                        qualifiedTable = sampledQualified;
                    }
                }
                const columns = await dbContext.getTableColumns(tableName, schema);
                if (!columns || columns.length === 0) {
                    return errorResponse(`テーブル「${tableName}」のカラム情報が取得できませんでした。`);
                }

                const numericColumns = columns
                    .filter(col => isNumericType(col.type))
                    .map(col => col.name)
                    .filter((value, index, self) => self.indexOf(value) === index);

                if (numericColumns.length < 2) {
                    return errorResponse(
                        `テーブル「${tableName}」にはクラスター分析に十分な数値カラムがありません（数値カラム: ${numericColumns.length}件）。最低2つの数値カラムが必要です。`
                    );
                }

                const providedFeatures = deduplicateStrings(feature_columns ?? []);

                for (const feature of providedFeatures) {
                    if (!numericColumns.includes(feature)) {
                        return errorResponse(
                            `特徴量カラム「${feature}」は存在しないか数値型ではありません。数値カラムを指定してください。`
                        );
                    }
                }

                if (providedFeatures.length < 2) {
                    return errorResponse('クラスター分析には最低2つの特徴量カラムが必要です。');
                }

                const limit = clamp(max_rows ?? DEFAULT_MAX_ROWS, MIN_REQUIRED_ROWS, MAX_ALLOWED_ROWS);
                const query = `SELECT ${providedFeatures
                    .map(quoteIdentifier)
                    .join(', ')} FROM ${qualifiedTable} LIMIT ${limit};`;
                const rows = await dbContext.executeQuery(query, schema);

                if (!Array.isArray(rows) || rows.length === 0) {
                    return errorResponse(`テーブル「${tableName}」からデータを取得できませんでした。`);
                }

                const numericData: Record<string, number[]> = {};
                for (const column of providedFeatures) {
                    numericData[column] = [];
                }

                const totalRows = rows.length;
                for (const row of rows) {
                    for (const column of providedFeatures) {
                        const value = toNumber(row[column]);
                        numericData[column].push(value ?? Number.NaN);
                    }
                }

                // Build feature matrix
                const matrixX: number[][] = [];
                let skippedRows = 0;

                for (let rowIdx = 0; rowIdx < totalRows; rowIdx += 1) {
                    const featureValues: number[] = [];
                    let validRow = true;
                    for (const feature of providedFeatures) {
                        const value = numericData[feature]?.[rowIdx];
                        if (!Number.isFinite(value)) {
                            validRow = false;
                            break;
                        }
                        featureValues.push(value);
                    }

                    if (!validRow) {
                        skippedRows += 1;
                        continue;
                    }

                    matrixX.push(featureValues);
                }

                const usedRows = matrixX.length;
                if (usedRows < MIN_REQUIRED_ROWS) {
                    return errorResponse(
                        `有効なデータ行が${usedRows}行しかありません。最低でも${MIN_REQUIRED_ROWS}行以上必要です。`
                    );
                }

                if (k > usedRows) {
                    return errorResponse(
                        `クラスター数${k}がデータ数${usedRows}より大きいです。クラスター数を減らしてください。`
                    );
                }

                let clustering;
                try {
                    clustering = kmeans(matrixX, {
                        numClusters: k,
                        featureNames: providedFeatures,
                        initMethod: init_method ?? 'kmeans++',
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return errorResponse(`クラスター分析の計算中にエラーが発生しました: ${message}`);
                }

                const warnings: string[] = [];
                const suggestions: string[] = [];

                if (skippedRows > 0) {
                    warnings.push(`NULLまたは非数値値のために${skippedRows}行を除外しました。`);
                }

                if (usedRows < totalRows) {
                    warnings.push(
                        `サンプリング上限${limit}行から有効${usedRows}行を利用しました。より正確な結果が必要な場合はmax_rowsを増やしてください。`
                    );
                }

                if (!clustering.converged) {
                    warnings.push('最大反復回数に到達しましたが収束しませんでした。結果が不安定な可能性があります。');
                }

                // Provide guidance for AI to add cluster column using duckdb_query tool
                suggestions.push(
                    `次のステップ: duckdb_queryツールを使って、テーブル「${tableName}」に cluster カラムを追加してください。`
                );
                suggestions.push(
                    `cluster カラムの作成方法: 診断情報のlabels配列（${clustering.labels.length}件）を使用して、テーブル「${tableName}」の各行にクラスターラベルを設定してください。`
                );

                // 2D visualization suggestion
                if (providedFeatures.length === 2) {
                    const [feat1, feat2] = providedFeatures;

                    suggestions.push(
                        `可視化: テーブル「${tableName}」を使って、${feat1}と${feat2}の散布図を作成してください。clusterカラムで色分けしてください。`
                    );
                }

                // 3D+ visualization suggestion
                if (providedFeatures.length >= 3) {
                    suggestions.push(
                        `可視化: 特徴量が${providedFeatures.length}次元あります。テーブル「${tableName}」を使って、(${providedFeatures[0]}, ${providedFeatures[1]})の散布図を作成してください。clusterカラムで色分けしてください。`
                    );
                }

                // Cluster quality interpretation (before separating into metrics)
                if (Number.isFinite(clustering.silhouetteScore)) {
                    if (clustering.silhouetteScore > 0.7) {
                        suggestions.push(
                            `Silhouette Score: ${formatNumeric(clustering.silhouetteScore)} - 優れたクラスタリング品質です。`
                        );
                    } else if (clustering.silhouetteScore > 0.5) {
                        suggestions.push(
                            `Silhouette Score: ${formatNumeric(clustering.silhouetteScore)} - 良好なクラスタリング品質です。`
                        );
                    } else if (clustering.silhouetteScore > 0.25) {
                        suggestions.push(
                            `Silhouette Score: ${formatNumeric(clustering.silhouetteScore)} - 中程度のクラスタリング品質です。クラスター数kを調整すると改善する可能性があります。`
                        );
                    } else {
                        suggestions.push(
                            `Silhouette Score: ${formatNumeric(clustering.silhouetteScore)} - クラスタリング品質が低いです。異なるクラスター数を試すか、特徴量の選択を見直してください。`
                        );
                    }
                }

                // Separate clustering result into metrics (for AI) and diagnostics (for debugging)
                const metrics = {
                    numClusters: clustering.k,
                    numSamples: clustering.n,
                    numFeatures: clustering.p,
                    converged: clustering.converged,
                    silhouetteScore: clustering.silhouetteScore,
                    inertia: clustering.inertia,
                    clusterSizes: clustering.clusterSizes,
                    featureNames: clustering.featureNames,
                };

                const diagnostics = {
                    timing: clustering.timing,
                    iterations: clustering.iterations,
                    labels: clustering.labels,
                    centroids: clustering.centroids,
                };

                // Build message with auto-sampling info
                let message = '';
                if (originalTableName && originalRowCount) {
                    message = `テーブル「${originalTableName}」は${originalRowCount}行あったため、自動的に${AUTO_SAMPLING_THRESHOLD}行にサンプリングしたテーブル「${tableName}」を作成してクラスター分析を実行しました。${k}個のクラスターに分類しました。特徴量: ${providedFeatures.join(', ')}`;
                } else {
                    message = `テーブル「${tableName}」のクラスター分析が完了しました。${k}個のクラスターに分類しました。特徴量: ${providedFeatures.join(', ')}`;
                }

                const response: ClusterAnalysisResponse = {
                    success: true,
                    message,
                    tableName,
                    featureColumns: providedFeatures,
                    dataInfo: {
                        totalRows,
                        usedRows,
                        skippedRows,
                        samplingLimit: limit,
                    },
                    metrics,
                    diagnostics,
                    warnings: warnings.length > 0 ? warnings : undefined,
                    suggestions: suggestions.length > 0 ? suggestions : undefined,
                };

                return response;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return errorResponse(`クラスター分析ツールの実行中に予期せぬエラーが発生しました: ${message}`);
            }
        },
    });
}

function errorResponse(message: string, warnings?: string[]): ClusterAnalysisResponse {
    return {
        success: false,
        message,
        warnings,
    };
}

function deduplicateStrings(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        if (!value) continue;
        if (!seen.has(value)) {
            seen.add(value);
            result.push(value);
        }
    }
    return result;
}

function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
}

function quoteIdentifier(identifier: string): string {
    const sanitized = identifier.replace(/"/g, '""');
    return `"${sanitized}"`;
}

function isNumericType(type: string): boolean {
    const normalized = type.toUpperCase();
    return (
        normalized.includes('INT') ||
        normalized.includes('REAL') ||
        normalized.includes('DOUBLE') ||
        normalized.includes('FLOAT') ||
        normalized.includes('DECIMAL') ||
        normalized.includes('NUMERIC') ||
        normalized.includes('HUGEINT')
    );
}

function toNumber(value: unknown): number | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value === 'bigint') {
        const converted = Number(value);
        return Number.isFinite(converted) ? converted : null;
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed) return null;
        const parsed = Number(trimmed);
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
}

function formatNumeric(value: number): string {
    if (!Number.isFinite(value)) {
        return 'null';
    }
    const precise = Number.parseFloat(value.toPrecision(6));
    if (!Number.isFinite(precise)) {
        return value.toString();
    }
    return Object.is(precise, -0) ? '0' : precise.toString();
}
