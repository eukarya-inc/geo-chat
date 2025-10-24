import { tool } from 'ai';
import { z } from 'zod';
import { jStat } from 'jstat';
import type { DBContext } from '../../duckdb/dbContext';
import type {
    PredictorSelectionResponse,
    PredictorCorrelation,
    ExcludedPredictor,
} from '../../../types/predictorSelection';

const DEFAULT_MAX_ROWS = 5000;
const MAX_ALLOWED_ROWS = 20000;
const MIN_REQUIRED_ROWS = 10;
const MAX_AUTO_COLUMNS = 20;
const DEFAULT_TOP_K = 3;
const HIGH_CORRELATION_THRESHOLD = 0.95;

export function createPredictorSelectionTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Select optimal explanatory variables (predictors) for regression analysis using correlation-based selection.
This tool implements univariate filtering (SelectKBest approach) to identify the top K predictors most correlated with the target variable.

IMPORTANT: Use this tool BEFORE perform_regression_analysis when explanatory variables are not specified.
- Helps detect circular dependencies (e.g., target="revenue_per_employee", predictor="revenue")
- Identifies highly correlated predictors that may cause multicollinearity
- Provides transparency in variable selection process
- Allows exclusion of problematic predictors before regression`,
        parameters: z.object({
            table_name: z.string().describe('Table name to analyze'),
            target_column: z.string().describe('Target variable (dependent variable) for correlation analysis'),
            top_k: z
                .number()
                .int()
                .min(1)
                .max(10)
                .optional()
                .describe('Number of top predictors to select. Default is 3.'),
            exclude_columns: z
                .array(z.string())
                .optional()
                .describe(
                    'Columns to exclude from selection (e.g., derived variables, IDs). Target column is always excluded.'
                ),
            max_rows: z
                .number()
                .int()
                .min(MIN_REQUIRED_ROWS)
                .max(MAX_ALLOWED_ROWS)
                .optional()
                .describe('Maximum number of rows to sample. Default 5000.'),
        }),
        execute: async ({ table_name, target_column, top_k, exclude_columns, max_rows }) => {
            try {
                const tableName = table_name.trim();
                if (!tableName) {
                    return errorResponse('テーブル名が指定されていません。');
                }

                if (!target_column || !target_column.trim()) {
                    return errorResponse('目的変数カラムが指定されていません。');
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
                        `テーブル「${tableName}」には説明変数選択に十分な数値カラムがありません（数値カラム: ${numericColumns.length}件）。最低2件必要です。`
                    );
                }

                if (!numericColumns.includes(target_column)) {
                    return errorResponse(
                        `目的変数カラム「${target_column}」は存在しないか数値型ではありません。数値カラムを指定してください。`
                    );
                }

                const excludeSet = new Set(exclude_columns?.map(c => c.trim()).filter(Boolean) || []);
                excludeSet.add(target_column); // Always exclude target

                // Determine columns to fetch
                const candidateColumns = numericColumns.filter(col => !excludeSet.has(col));
                const columnsToFetch = [target_column, ...candidateColumns.slice(0, MAX_AUTO_COLUMNS)];
                const truncated = candidateColumns.length > MAX_AUTO_COLUMNS;

                if (columnsToFetch.length <= 1) {
                    return errorResponse('選択可能な説明変数候補がありません。除外リストを確認してください。');
                }

                const limit = clamp(max_rows ?? DEFAULT_MAX_ROWS, MIN_REQUIRED_ROWS, MAX_ALLOWED_ROWS);
                const query = `SELECT ${columnsToFetch
                    .map(quoteIdentifier)
                    .join(', ')} FROM ${qualifiedTable} LIMIT ${limit};`;
                const rows = await dbContext.executeQuery(query, schema);

                if (!Array.isArray(rows) || rows.length === 0) {
                    return errorResponse(`テーブル「${tableName}」からデータを取得できませんでした。`);
                }

                // Convert to numeric arrays
                const numericData: Record<string, number[]> = {};
                for (const column of columnsToFetch) {
                    numericData[column] = [];
                }

                for (const row of rows) {
                    for (const column of columnsToFetch) {
                        const value = toNumber(row[column]);
                        numericData[column].push(value ?? Number.NaN);
                    }
                }

                // Calculate correlations
                const targetSeries = numericData[target_column];
                if (!targetSeries) {
                    return errorResponse('目的変数のデータが取得できませんでした。');
                }

                const validTargetIndices: number[] = [];
                const validTargetValues: number[] = [];
                for (let i = 0; i < targetSeries.length; i += 1) {
                    if (Number.isFinite(targetSeries[i])) {
                        validTargetIndices.push(i);
                        validTargetValues.push(targetSeries[i]);
                    }
                }

                if (validTargetValues.length < MIN_REQUIRED_ROWS) {
                    return errorResponse(
                        `目的変数「${target_column}」の有効なデータが不足しています（${validTargetValues.length}行）。最低${MIN_REQUIRED_ROWS}行必要です。`
                    );
                }

                const correlations: PredictorCorrelation[] = [];
                const excludedPredictors: ExcludedPredictor[] = [];

                for (const column of candidateColumns) {
                    const series = numericData[column];
                    if (!series) continue;

                    // Get valid pairs
                    const validPairs: Array<{ x: number; y: number }> = [];
                    for (const idx of validTargetIndices) {
                        const value = series[idx];
                        if (Number.isFinite(value)) {
                            validPairs.push({ x: value, y: validTargetValues[validTargetIndices.indexOf(idx)] });
                        }
                    }

                    if (validPairs.length < MIN_REQUIRED_ROWS) {
                        excludedPredictors.push({
                            predictor: column,
                            correlation: Number.NaN,
                            reason: 'insufficient_data',
                            details: `有効なペア数: ${validPairs.length}行（最低${MIN_REQUIRED_ROWS}行必要）`,
                        });
                        continue;
                    }

                    // Calculate correlation using jStat
                    const xValues = validPairs.map(p => p.x);
                    const yValues = validPairs.map(p => p.y);

                    try {
                        const correlation = jStat.corrcoeff(xValues, yValues);
                        if (!Number.isFinite(correlation)) {
                            excludedPredictors.push({
                                predictor: column,
                                correlation: Number.NaN,
                                reason: 'insufficient_data',
                                details: '相関係数が計算できませんでした（分散が0の可能性）',
                            });
                            continue;
                        }

                        correlations.push({
                            predictor: column,
                            correlation,
                            absoluteCorrelation: Math.abs(correlation),
                            pairCount: validPairs.length,
                        });
                    } catch {
                        excludedPredictors.push({
                            predictor: column,
                            correlation: Number.NaN,
                            reason: 'insufficient_data',
                            details: '相関計算中にエラーが発生しました',
                        });
                    }
                }

                if (correlations.length === 0) {
                    return errorResponse(
                        '有効な説明変数候補が見つかりませんでした。データの欠損値を確認してください。'
                    );
                }

                // Sort by absolute correlation (descending)
                correlations.sort((a, b) => {
                    const diff = b.absoluteCorrelation - a.absoluteCorrelation;
                    if (diff !== 0) return diff;
                    return b.pairCount - a.pairCount;
                });

                // Detect high correlations
                const warnings: string[] = [];
                for (const corr of correlations) {
                    if (corr.absoluteCorrelation >= HIGH_CORRELATION_THRESHOLD) {
                        warnings.push(
                            `⚠️ 「${corr.predictor}」は目的変数と極めて高い相関（${formatCorrelation(corr.correlation)}）があります。循環依存の可能性があります。`
                        );
                        excludedPredictors.push({
                            predictor: corr.predictor,
                            correlation: corr.correlation,
                            reason: 'high_correlation',
                            details: `絶対相関係数: ${formatCorrelation(corr.absoluteCorrelation)} >= ${HIGH_CORRELATION_THRESHOLD}`,
                        });
                    }
                }

                // Remove high correlation predictors from selection
                const filteredCorrelations = correlations.filter(
                    c => c.absoluteCorrelation < HIGH_CORRELATION_THRESHOLD
                );

                if (filteredCorrelations.length === 0) {
                    return errorResponse(
                        '循環依存の可能性がある変数を除外した結果、選択可能な変数がなくなりました。exclude_columnsパラメータで明示的に除外するか、別の目的変数を選択してください。',
                        warnings
                    );
                }

                const k = Math.min(top_k ?? DEFAULT_TOP_K, filteredCorrelations.length);
                const selectedCorrelations = filteredCorrelations.slice(0, k);
                const selectedPredictors = selectedCorrelations.map(c => c.predictor);

                if (truncated) {
                    warnings.push(
                        `数値カラムが多いため、最初の${MAX_AUTO_COLUMNS}件を候補としました。他のカラムを分析する場合は別途確認してください。`
                    );
                }

                const response: PredictorSelectionResponse = {
                    success: true,
                    message: `テーブル「${tableName}」から目的変数「${target_column}」に対する上位${k}個の説明変数を選択しました。`,
                    tableName,
                    targetColumn: target_column,
                    selectedPredictors,
                    predictorCorrelations: selectedCorrelations,
                    excludedPredictors,
                    candidateCount: candidateColumns.length,
                    selectionMethod: 'correlation_based',
                    topK: k,
                    warnings: warnings.length > 0 ? warnings : undefined,
                };

                return response;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return errorResponse(`説明変数選択ツールの実行中に予期せぬエラーが発生しました: ${message}`);
            }
        },
    });
}

function errorResponse(message: string, warnings?: string[]): PredictorSelectionResponse {
    return {
        success: false,
        message,
        warnings,
    };
}

function formatCorrelation(value: number): string {
    if (!Number.isFinite(value)) return 'NaN';
    return value.toFixed(3);
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
