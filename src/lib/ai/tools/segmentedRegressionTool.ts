import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import { performRegressionAnalysis } from './regressionTool';
import type {
    SegmentRegressionResult,
    SegmentedRegressionAnalysisResponse,
    SegmentComparison,
} from '../../../types/segmentedRegression';

const MAX_PREDICTORS = 6;
const MAX_SEGMENTS = 10; // Limit number of segments to prevent excessive computation

export function createSegmentedRegressionTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Perform multiple linear regression analysis on DuckDB tables, separately for each segment/cluster.
This tool allows you to discover how relationships between variables differ across segments.

IMPORTANT: Use this tool AFTER clustering or when data has natural segments:
1. Run clusterTool to create clusters
2. Use this tool with cluster_labels_table_name to analyze each cluster separately
3. Compare regression coefficients across segments to understand differences

WHEN TO USE:
- After running clusterTool to analyze regression within each cluster
- When you have categorical columns defining natural segments (regions, categories, etc.)
- To compare how predictor effects differ across groups

EXAMPLES:
✓ "クラスター別に従業員数と売上の関係を分析してください"
✓ "地域ごとに価格と需要の回帰分析を行ってください"
✓ "セグメント別に広告費用対効果を分析してください"

OUTPUT:
- Separate regression results for each segment
- Comparison of coefficients across segments
- Identification of segments with strongest/weakest relationships`,
        inputSchema: z.object({
            table_name: z.string().describe('Table name to analyze'),
            target_column: z.string().describe('Dependent variable column (required)'),
            explanatory_columns: z
                .array(z.string())
                .min(1)
                .max(MAX_PREDICTORS)
                .describe('Predictor columns (1-6, required)'),
            segment_column: z
                .string()
                .describe(
                    'Column defining segments (e.g., cluster, region, category). Required unless cluster_labels_table_name is provided.'
                )
                .optional(),
            cluster_labels_table_name: z
                .string()
                .optional()
                .describe(
                    'Cluster labels table name from clusterTool (contains row_id and cluster columns). If provided, automatically joins with the main table.'
                ),
        }),
        execute: async ({
            table_name,
            target_column,
            explanatory_columns,
            segment_column,
            cluster_labels_table_name,
        }): Promise<SegmentedRegressionAnalysisResponse> => {
            try {
                const tableName = table_name.trim();
                if (!tableName) {
                    return errorResponse('テーブル名が指定されていません。');
                }

                // Validate segment column specification
                if (!segment_column && !cluster_labels_table_name) {
                    return errorResponse(
                        'segment_column または cluster_labels_table_name のいずれかを指定してください。'
                    );
                }

                // Determine working table and segment column
                let workingTable: string;
                let actualSegmentColumn: string;
                let isTemporaryTable = false;

                if (cluster_labels_table_name) {
                    // Create temporary joined table
                    const joinedTableName = `${tableName}_with_clusters_temp`;
                    const sanitizedOriginal = quoteIdentifier(tableName);
                    const qualifiedOriginal = schema
                        ? `${quoteIdentifier(schema)}.${sanitizedOriginal}`
                        : sanitizedOriginal;
                    const sanitizedLabels = quoteIdentifier(cluster_labels_table_name);
                    const qualifiedLabels = schema ? `${quoteIdentifier(schema)}.${sanitizedLabels}` : sanitizedLabels;
                    const sanitizedJoined = quoteIdentifier(joinedTableName);
                    const qualifiedJoined = schema ? `${quoteIdentifier(schema)}.${sanitizedJoined}` : sanitizedJoined;

                    // Drop existing temporary table if exists
                    try {
                        await dbContext.executeQuery(`DROP TABLE IF EXISTS ${qualifiedJoined};`, schema);
                    } catch {
                        // Ignore drop errors
                    }

                    // Create joined table with cluster labels
                    const createJoinedQuery = `CREATE TABLE ${qualifiedJoined} AS
                        SELECT t.*, l.cluster
                        FROM ${qualifiedOriginal} t
                        JOIN ${qualifiedLabels} l ON ROW_NUMBER() OVER () = l.row_id;`;

                    await dbContext.executeQuery(createJoinedQuery, schema);

                    workingTable = joinedTableName;
                    actualSegmentColumn = 'cluster';
                    isTemporaryTable = true;
                } else {
                    workingTable = tableName;
                    actualSegmentColumn = segment_column!;
                }

                const sanitizedTable = quoteIdentifier(workingTable);
                const qualifiedTable = schema ? `${quoteIdentifier(schema)}.${sanitizedTable}` : sanitizedTable;

                // Validate that segment column exists
                const columns = await dbContext.getTableColumns(workingTable, schema);
                if (!columns || columns.length === 0) {
                    return errorResponse(`テーブル「${workingTable}」のカラム情報が取得できませんでした。`);
                }

                const allColumnNames = columns.map(col => col.name);
                if (!allColumnNames.includes(actualSegmentColumn)) {
                    return errorResponse(
                        `セグメントカラム「${actualSegmentColumn}」が存在しません。利用可能なカラム: ${allColumnNames.join(', ')}`
                    );
                }

                // Get unique segment values
                const segmentQuery = `SELECT DISTINCT ${quoteIdentifier(actualSegmentColumn)} as segment_value
                    FROM ${qualifiedTable}
                    WHERE ${quoteIdentifier(actualSegmentColumn)} IS NOT NULL
                    ORDER BY segment_value;`;
                const segmentRows = await dbContext.executeQuery(segmentQuery, schema);

                if (!Array.isArray(segmentRows) || segmentRows.length === 0) {
                    return errorResponse(
                        `セグメントカラム「${actualSegmentColumn}」に有効な値が見つかりませんでした。`
                    );
                }

                const segmentValues = segmentRows.map(row => row.segment_value);

                if (segmentValues.length > MAX_SEGMENTS) {
                    return errorResponse(
                        `セグメント数が多すぎます（${segmentValues.length}個）。最大${MAX_SEGMENTS}個まで対応しています。`
                    );
                }

                // Perform regression for each segment
                const segmentResults: SegmentRegressionResult[] = [];
                const globalWarnings: string[] = [];

                for (const segmentValue of segmentValues) {
                    const segmentLabel = `${actualSegmentColumn}=${segmentValue}`;

                    // Create a filtered temporary table for this segment
                    const segmentTableName = `${workingTable}_segment_${segmentValue}_temp`;
                    const sanitizedSegmentTable = quoteIdentifier(segmentTableName);
                    const qualifiedSegmentTable = schema
                        ? `${quoteIdentifier(schema)}.${sanitizedSegmentTable}`
                        : sanitizedSegmentTable;

                    try {
                        // Drop existing segment table if exists
                        try {
                            await dbContext.executeQuery(`DROP TABLE IF EXISTS ${qualifiedSegmentTable};`, schema);
                        } catch {
                            // Ignore drop errors
                        }

                        // Create segment table
                        const createSegmentQuery = `CREATE TABLE ${qualifiedSegmentTable} AS
                            SELECT * FROM ${qualifiedTable}
                            WHERE ${quoteIdentifier(actualSegmentColumn)} = ${typeof segmentValue === 'string' ? `'${segmentValue.replace(/'/g, "''")}'` : segmentValue};`;
                        await dbContext.executeQuery(createSegmentQuery, schema);

                        // Call performRegressionAnalysis directly for this segment
                        const regressionResult = await performRegressionAnalysis(dbContext, schema, {
                            table_name: segmentTableName,
                            target_column,
                            explanatory_columns,
                        });

                        if (!regressionResult.success) {
                            globalWarnings.push(`セグメント「${segmentLabel}」: ${regressionResult.message}`);
                            // Clean up segment table before continuing
                            try {
                                await dbContext.executeQuery(`DROP TABLE IF EXISTS ${qualifiedSegmentTable};`, schema);
                            } catch {
                                // Ignore cleanup errors
                            }
                            continue;
                        }

                        // Clean up segment table after successful regression
                        try {
                            await dbContext.executeQuery(`DROP TABLE IF EXISTS ${qualifiedSegmentTable};`, schema);
                        } catch {
                            // Ignore cleanup errors
                        }

                        segmentResults.push({
                            segmentValue,
                            segmentLabel,
                            dataInfo: regressionResult.dataInfo,
                            regression: regressionResult.regression,
                            columnSummaries: regressionResult.columnSummaries,
                            warnings: regressionResult.warnings,
                        });
                    } catch (error) {
                        const message = error instanceof Error ? error.message : String(error);
                        globalWarnings.push(`セグメント「${segmentLabel}」: エラーが発生しました: ${message}`);
                    }
                }

                // Clean up temporary table if created
                if (isTemporaryTable) {
                    try {
                        const sanitizedJoined = quoteIdentifier(workingTable);
                        const qualifiedJoined = schema
                            ? `${quoteIdentifier(schema)}.${sanitizedJoined}`
                            : sanitizedJoined;
                        await dbContext.executeQuery(`DROP TABLE IF EXISTS ${qualifiedJoined};`, schema);
                    } catch {
                        // Ignore cleanup errors
                    }
                }

                if (segmentResults.length === 0) {
                    return errorResponse(
                        'すべてのセグメントで回帰分析に失敗しました。データを確認してください。',
                        globalWarnings
                    );
                }

                // Build comparison
                const comparison = buildComparison(segmentResults, explanatory_columns);

                // Generate suggestions
                const suggestions = generateSuggestions(segmentResults, comparison);

                const response: SegmentedRegressionAnalysisResponse = {
                    success: true,
                    message: `テーブル「${tableName}」の${segmentResults.length}個のセグメントに対して回帰分析が完了しました。目的変数: ${target_column}、説明変数: ${explanatory_columns.join(', ')}。`,
                    tableName,
                    segmentColumn: actualSegmentColumn,
                    targetColumn: target_column,
                    predictorColumns: explanatory_columns,
                    segments: segmentResults,
                    comparison,
                    warnings: globalWarnings.length > 0 ? globalWarnings : undefined,
                    suggestions: suggestions.length > 0 ? suggestions : undefined,
                };

                return response;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return errorResponse(`セグメント別回帰分析ツールの実行中に予期せぬエラーが発生しました: ${message}`);
            }
        },
    });
}

function errorResponse(message: string, warnings?: string[]): SegmentedRegressionAnalysisResponse {
    return {
        success: false,
        message,
        warnings,
    };
}

function buildComparison(segments: SegmentRegressionResult[], predictors: string[]): SegmentComparison {
    const rSquaredBySegment = segments.map(seg => seg.regression.r2);
    const adjustedRSquaredBySegment = segments.map(seg => seg.regression.adjustedR2);

    const coefficientsBySegment: Record<string, number[]> = {};

    for (const predictor of predictors) {
        coefficientsBySegment[predictor] = segments.map(seg => {
            const metric = seg.regression.metricsPerPredictor.find(m => m.name === predictor);
            return metric?.beta ?? Number.NaN;
        });
    }

    return {
        numSegments: segments.length,
        rSquaredBySegment,
        adjustedRSquaredBySegment,
        coefficientsBySegment,
    };
}

function generateSuggestions(segments: SegmentRegressionResult[], comparison: SegmentComparison): string[] {
    const suggestions: string[] = [];

    // Find segment with best R²
    const bestR2Index = comparison.adjustedRSquaredBySegment.indexOf(
        Math.max(...comparison.adjustedRSquaredBySegment.filter(r => Number.isFinite(r)))
    );
    if (bestR2Index !== -1) {
        const bestSegment = segments[bestR2Index];
        suggestions.push(
            `最も説明力が高いセグメント: ${bestSegment.segmentLabel} (調整済みR² = ${formatNumeric(bestSegment.regression.adjustedR2)})`
        );
    }

    // Find predictors with largest variation across segments
    for (const [predictor, coefficients] of Object.entries(comparison.coefficientsBySegment)) {
        const validCoefs = coefficients.filter(c => Number.isFinite(c));
        if (validCoefs.length < 2) continue;

        const minCoef = Math.min(...validCoefs);
        const maxCoef = Math.max(...validCoefs);
        const range = maxCoef - minCoef;

        if (range > 0.1) {
            // Arbitrary threshold for "significant" variation
            suggestions.push(
                `説明変数「${predictor}」の係数はセグメント間で大きく異なります（範囲: ${formatNumeric(minCoef)} 〜 ${formatNumeric(maxCoef)}）。セグメントごとに異なる戦略が必要かもしれません。`
            );
        }
    }

    // Suggest visualization
    suggestions.push(`次のステップ: セグメント別の散布図を作成し、各セグメントの回帰直線を重ねて比較してください。`);

    return suggestions;
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

function quoteIdentifier(identifier: string): string {
    const sanitized = identifier.replace(/"/g, '""');
    return `"${sanitized}"`;
}
