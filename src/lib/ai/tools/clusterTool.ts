import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import { kmeans } from '../../../utils/clustering/kmeans';
import { scalableKmeans } from '../../../utils/clustering/scalableKmeans';
import type { ClusterAnalysisResponse } from '../../../types/clustering';

const MIN_REQUIRED_ROWS = 10;
const DEFAULT_K = 3;
const MIN_K = 2;
const MAX_K = 10;
const LARGE_DATA_THRESHOLD = 10000; // Use scalable k-means for datasets > 10k rows

export function createClusterTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Perform k-means cluster analysis on DuckDB tables to discover natural groupings in data.
Returns cluster labels, centroids, inertia, silhouette score, and cluster sizes.

CRITICAL - TABLE NAMING:
- ALWAYS use English table names for cluster analysis (e.g., "logistics_companies", "customer_segments")
- NEVER use Japanese table names (e.g., "貨物運送事業者", "顧客データ")
- The tool creates derivative tables with English suffixes (e.g., "table_name_cluster_labels")
- English names ensure consistency across all analysis tables and avoid character encoding issues

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
- Analyzes all rows in the table by default

IMPORTANT:
- The tool analyzes the entire table unless max_rows is specified
- For large datasets, consider specifying max_rows to limit the number of rows analyzed
- The tool will automatically suggest creating visualization

IMPORTANT: After using this tool successfully, ALWAYS create visualizations:
1. Create a new table with cluster labels added
2. For 2D data: Create scatter plot with points colored by cluster label
3. For 3D data: Consider creating multiple 2D projections
4. Suggest appropriate SQL queries for creating these tables

CRITICAL - DO NOT CREATE SUMMARY TABLES:
- DO NOT create separate summary tables (e.g., cluster_summary, {table}_summary)
- The tool result already includes cluster statistics (sizes, centroids, quality metrics)
- Display cluster summary information as TEXT in your response, not as a new table
- Only create tables for visualization purposes (scatter plots), not for summary statistics
- If you need to show cluster statistics, use the clustering result data directly in your text response`,
        inputSchema: z.object({
            table_name: z
                .string()
                .describe(
                    'Table name to analyze - MUST be in English (e.g., "logistics_companies", "customer_segments"). Do NOT use Japanese characters in table names.'
                ),
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
                .optional()
                .describe(
                    'Maximum number of rows to sample for analysis (optional, analyzes all rows if not specified)'
                ),
            init_method: z
                .enum(['random', 'kmeans++'])
                .optional()
                .describe('Initialization method (default: kmeans++)'),
        }),
        execute: async ({
            table_name,
            feature_columns,
            k = DEFAULT_K,
            max_rows,
            init_method,
        }): Promise<ClusterAnalysisResponse> => {
            try {
                const tableName = table_name.trim();
                if (!tableName) {
                    return errorResponse('テーブル名が指定されていません。');
                }

                const sanitizedTable = quoteIdentifier(tableName);
                const qualifiedTable = schema ? `${quoteIdentifier(schema)}.${sanitizedTable}` : sanitizedTable;

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

                const limitClause = max_rows ? `LIMIT ${Math.max(max_rows, MIN_REQUIRED_ROWS)}` : '';
                const query = `SELECT ${providedFeatures
                    .map(quoteIdentifier)
                    .join(', ')} FROM ${qualifiedTable} ${limitClause};`;
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
                    // Use scalable k-means for large datasets (>10k rows)
                    if (usedRows > LARGE_DATA_THRESHOLD) {
                        clustering = await scalableKmeans(matrixX, {
                            numClusters: k,
                            featureNames: providedFeatures,
                            initMethod: init_method ?? 'kmeans++',
                            maxIterations: 20, // Reduced for sample training
                            refinementIterations: 2, // 2 refinement passes on full data
                            sampleRatio: 0.1, // 10% sample
                            maxSampleSize: 10000,
                        });
                    } else {
                        // Use standard k-means for smaller datasets
                        clustering = kmeans(matrixX, {
                            numClusters: k,
                            featureNames: providedFeatures,
                            initMethod: init_method ?? 'kmeans++',
                        });
                    }
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return errorResponse(`クラスター分析の計算中にエラーが発生しました: ${message}`);
                }

                const warnings: string[] = [];
                const suggestions: string[] = [];

                // Define labels table name before using it in suggestions
                const labelsTableName = `${tableName}_cluster_labels`;

                if (skippedRows > 0) {
                    warnings.push(`NULLまたは非数値値のために${skippedRows}行を除外しました。`);
                }

                if (max_rows && usedRows < totalRows) {
                    warnings.push(`サンプリング上限${max_rows}行から有効${usedRows}行を利用しました。`);
                }

                if (!clustering.converged) {
                    warnings.push('最大反復回数に到達しましたが収束しませんでした。結果が不安定な可能性があります。');
                }

                // Provide guidance for AI on how to use cluster labels
                suggestions.push(
                    `クラスターラベルは一時テーブル「${labelsTableName}」に保存されました。このテーブルには row_id (1から始まる行番号) と cluster (クラスターラベル) カラムがあります。`
                );
                suggestions.push(
                    `クラスターラベルを元のテーブルに結合する方法: SELECT t.*, l.cluster FROM ${tableName} t JOIN ${labelsTableName} l ON ROW_NUMBER() OVER () = l.row_id`
                );
                suggestions.push(
                    `クラスターの特性: ${clustering.centroids.map((c, i) => `クラスター${i}: ${providedFeatures.map((f, j) => `${f}=${formatNumeric(c[j])}`).join(', ')}`).join(' / ')}`
                );

                // 2D visualization suggestion
                if (providedFeatures.length === 2) {
                    const [feat1, feat2] = providedFeatures;

                    suggestions.push(
                        `可視化: ${feat1}と${feat2}の散布図を作成してください。クラスターラベルで色分けするには、テーブル「${labelsTableName}」をJOINしてください。`
                    );
                }

                // 3D+ visualization suggestion
                if (providedFeatures.length >= 3) {
                    suggestions.push(
                        `可視化: 特徴量が${providedFeatures.length}次元あります。主要な2次元 (${providedFeatures[0]}, ${providedFeatures[1]}) の散布図を作成してください。クラスターラベルで色分けするには、テーブル「${labelsTableName}」をJOINしてください。`
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

                // Create a temporary table with cluster labels for joining
                const labelsSanitized = quoteIdentifier(labelsTableName);
                const labelsQualified = schema ? `${quoteIdentifier(schema)}.${labelsSanitized}` : labelsSanitized;

                try {
                    // Drop existing labels table if exists
                    try {
                        await dbContext.executeQuery(`DROP TABLE IF EXISTS ${labelsQualified};`, schema);
                    } catch {
                        // Ignore drop errors
                    }

                    // Create labels table with row_id and cluster columns
                    const labelsData = clustering.labels.map((label, idx) => `(${idx + 1}, ${label})`).join(', ');
                    const createLabelsQuery = `CREATE TABLE ${labelsQualified} (row_id INTEGER, cluster INTEGER);
                        INSERT INTO ${labelsQualified} VALUES ${labelsData};`;
                    await dbContext.executeQuery(createLabelsQuery, schema);
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    warnings.push(`クラスターラベルテーブルの作成に失敗しました: ${message}`);
                }

                // Diagnostics with minimal data to prevent token overflow
                const diagnostics = {
                    timing: clustering.timing,
                    iterations: clustering.iterations,
                    // labels array removed - too large for AI context
                    // centroids included for cluster interpretation
                    centroids: clustering.centroids,
                    sampleInfo: clustering.sampleInfo,
                };

                // Build message with table creation marker for labels table
                const baseMessage = max_rows
                    ? `テーブル「${tableName}」のクラスター分析が完了しました。最大${max_rows}行から有効な${usedRows}行を使用して${k}個のクラスターに分類しました。特徴量: ${providedFeatures.join(', ')}`
                    : `テーブル「${tableName}」のクラスター分析が完了しました。${usedRows}行を使用して${k}個のクラスターに分類しました。特徴量: ${providedFeatures.join(', ')}`;

                const message = `${baseMessage}\n\n<!--TABLE_CREATED:${labelsTableName}-->`;

                const response: ClusterAnalysisResponse = {
                    success: true,
                    message,
                    tableName,
                    labelsTableName,
                    featureColumns: providedFeatures,
                    dataInfo: {
                        totalRows,
                        usedRows,
                        skippedRows,
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
