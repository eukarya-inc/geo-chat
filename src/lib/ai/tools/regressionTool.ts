import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import { olsRegression, type RegressionResult } from '../../../utils/regression/ols';
import type { ColumnSummary, RegressionAnalysisResponse, SimpleLinearRegression } from '../../../types/regression';

const MIN_REQUIRED_ROWS = 10;
const MAX_PREDICTORS = 6;

export function createRegressionTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Perform multiple linear regression analysis on DuckDB tables.
Returns regression coefficients, inference metrics (p-values, t-statistics, F statistic, adjusted R²),
variance inflation factors (VIF), and regression line metadata for each predictor.

IMPORTANT: After using this tool successfully, ALWAYS create regression visualizations **without** augmenting DuckDB tables with predicted columns:
Before creating any auxiliary tables, pick a short, descriptive English table name (e.g., "sales_vs_driver_ratio_scatter"). Use that name for the scatter table while keeping the original column names intact so analysts can still recognize them.
1. For each predictor, create a dedicated scatter table with that English name, selecting only the original target column and the predictor column (filtering NULLs if needed) while preserving the original column names.
2. Immediately compute the regression endpoints by taking each predictor's min and max from regression.columnSummaries (and holding other predictors at their means) and evaluating the equation predicted = intercept + Σ βᵢ·xᵢ at those values. Use those two points to build the regression line layer.
3. Use layered chart spec with scatter points (layer 1) and regression line (layer 2)`,
        parameters: z.object({
            table_name: z.string().describe('Table name to analyze'),
            target_column: z.string().describe('Dependent variable column (required).'),
            explanatory_columns: z
                .array(z.string())
                .min(1)
                .max(MAX_PREDICTORS)
                .describe(
                    'Predictor columns (1-6, required). Use select_features_for_regression tool first to identify optimal predictors.'
                ),
        }),
        execute: async ({ table_name, target_column, explanatory_columns }) => {
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
                        `テーブル「${tableName}」には回帰分析に十分な数値カラムがありません（数値カラム: ${numericColumns.length}件）。`
                    );
                }

                if (!numericColumns.includes(target_column)) {
                    return errorResponse(
                        `目的変数カラム「${target_column}」は存在しないか数値型ではありません。数値カラムを指定してください。`
                    );
                }

                const providedPredictors = deduplicateStrings(explanatory_columns);

                for (const predictor of providedPredictors) {
                    if (!numericColumns.includes(predictor)) {
                        return errorResponse(
                            `説明変数カラム「${predictor}」は存在しないか数値型ではありません。数値カラムを指定してください。`
                        );
                    }
                }

                if (providedPredictors.length > MAX_PREDICTORS) {
                    return errorResponse(`説明変数は最大${MAX_PREDICTORS}個まで指定可能です。`);
                }

                const columnsToFetch = [target_column, ...providedPredictors];

                const query = `SELECT ${columnsToFetch.map(quoteIdentifier).join(', ')} FROM ${qualifiedTable};`;
                const rows = await dbContext.executeQuery(query, schema);

                if (!Array.isArray(rows) || rows.length === 0) {
                    return errorResponse(`テーブル「${tableName}」からデータを取得できませんでした。`);
                }

                const numericData: Record<string, number[]> = {};
                for (const column of columnsToFetch) {
                    numericData[column] = [];
                }

                const totalRows = rows.length;
                for (const row of rows) {
                    for (const column of columnsToFetch) {
                        const value = toNumber(row[column]);
                        numericData[column].push(value ?? Number.NaN);
                    }
                }

                const targetColumn = target_column;
                const predictorColumns = providedPredictors;

                if (!numericData[targetColumn]) {
                    return errorResponse(`目的変数「${targetColumn}」のデータが取得できませんでした。`);
                }

                const missingColumns = predictorColumns.filter(column => !(column in numericData));
                if (missingColumns.length > 0) {
                    return errorResponse(
                        `説明変数のデータが取得できませんでした（不足: ${missingColumns.join(', ')}）。`
                    );
                }

                const columnTrackers: Record<string, number[]> = {};
                [targetColumn, ...predictorColumns].forEach(column => {
                    columnTrackers[column] = [];
                });

                const matrixX: number[][] = [];
                const vectorY: number[] = [];
                let skippedRows = 0;

                for (let rowIdx = 0; rowIdx < totalRows; rowIdx += 1) {
                    const targetValue = numericData[targetColumn]?.[rowIdx];
                    if (!Number.isFinite(targetValue)) {
                        skippedRows += 1;
                        continue;
                    }

                    const featureValues: number[] = [];
                    let validRow = true;
                    for (const predictor of predictorColumns) {
                        const value = numericData[predictor]?.[rowIdx];
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

                    vectorY.push(targetValue);
                    matrixX.push(featureValues);

                    columnTrackers[targetColumn].push(targetValue);
                    predictorColumns.forEach((predictor, index) => {
                        columnTrackers[predictor].push(featureValues[index]);
                    });
                }

                const usedRows = vectorY.length;
                if (usedRows <= predictorColumns.length) {
                    return errorResponse(
                        `回帰分析に必要なデータ行が不足しています（有効行数: ${usedRows}行）。NULLや非数値が多い可能性があります。`
                    );
                }

                if (usedRows < MIN_REQUIRED_ROWS) {
                    return errorResponse(
                        `有効なデータ行が${usedRows}行しかありません。最低でも${MIN_REQUIRED_ROWS}行以上必要です。`
                    );
                }

                let regression: RegressionResult;
                try {
                    regression = olsRegression(matrixX, vectorY, {
                        featureNames: predictorColumns,
                    });
                } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    return errorResponse(`回帰分析の計算中にエラーが発生しました: ${message}`);
                }

                const columnSummaries = buildColumnSummaries(columnTrackers, targetColumn);
                const warnings: string[] = [];

                if (skippedRows > 0) {
                    warnings.push(`NULLまたは非数値値のために${skippedRows}行を除外しました。`);
                }

                // Generate suggestions for creating scatter plots with simple regression lines
                const suggestions: string[] = [];

                suggestions.push(
                    '次のステップ: 各説明変数について散布図を作成し、単回帰直線を重ねてください。columnSummariesに各説明変数の単回帰直線パラメータ(slope, intercept)が含まれています。'
                );

                for (const predictor of predictorColumns) {
                    const predictorSummary = columnSummaries[predictor];
                    if (!predictorSummary || !predictorSummary.simpleRegression) continue;

                    const { slope, intercept: simpleIntercept } = predictorSummary.simpleRegression;
                    if (!Number.isFinite(slope) || !Number.isFinite(simpleIntercept)) continue;

                    const { min: minX, max: maxX } = predictorSummary;
                    if (!Number.isFinite(minX) || !Number.isFinite(maxX)) continue;

                    const minY = slope * minX + simpleIntercept;
                    const maxY = slope * maxX + simpleIntercept;

                    suggestions.push(
                        `説明変数「${predictor}」: 単回帰直線 y = ${formatNumeric(slope)} * x + ${formatNumeric(simpleIntercept)}、端点 (${formatNumeric(minX)}, ${formatNumeric(minY)}) と (${formatNumeric(maxX)}, ${formatNumeric(maxY)})`
                    );
                }

                const response: RegressionAnalysisResponse = {
                    success: true,
                    message: `テーブル「${tableName}」の回帰分析が完了しました。目的変数: ${targetColumn}、説明変数: ${predictorColumns.join(', ')}。`,
                    tableName,
                    targetColumn,
                    predictorColumns,
                    dataInfo: {
                        totalRows,
                        usedRows,
                        skippedRows,
                    },
                    regression,
                    columnSummaries,
                    warnings: warnings.length > 0 ? warnings : undefined,
                    suggestions: suggestions.length > 0 ? suggestions : undefined,
                };

                return response;
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return errorResponse(`回帰分析ツールの実行中に予期せぬエラーが発生しました: ${message}`);
            }
        },
    });
}

function errorResponse(message: string, warnings?: string[]): RegressionAnalysisResponse {
    return {
        success: false,
        message,
        warnings,
    };
}

function buildColumnSummaries(
    columnValues: Record<string, number[]>,
    targetColumn?: string
): Record<string, ColumnSummary> {
    const summaries: Record<string, ColumnSummary> = {};
    const targetValues = targetColumn ? columnValues[targetColumn] : undefined;

    for (const [column, values] of Object.entries(columnValues)) {
        const numericValues = values.filter(value => Number.isFinite(value));
        if (numericValues.length === 0) {
            summaries[column] = {
                column,
                count: 0,
                mean: Number.NaN,
                min: Number.NaN,
                max: Number.NaN,
                stdDev: Number.NaN,
            };
            continue;
        }

        const count = numericValues.length;
        const sum = numericValues.reduce((acc, value) => acc + value, 0);
        const mean = sum / count;
        let minValue = numericValues[0];
        let maxValue = numericValues[0];
        let squaredDiffSum = 0;

        for (const value of numericValues) {
            if (value < minValue) minValue = value;
            if (value > maxValue) maxValue = value;
            const diff = value - mean;
            squaredDiffSum += diff * diff;
        }

        const variance = count > 1 ? squaredDiffSum / (count - 1) : 0;

        // Calculate simple linear regression for predictors (not target)
        let simpleRegression: SimpleLinearRegression | undefined;
        if (targetValues && column !== targetColumn && values.length === targetValues.length) {
            // Get valid pairs for this predictor vs target
            const validXValues: number[] = [];
            const validYValues: number[] = [];
            for (let i = 0; i < values.length; i += 1) {
                const x = values[i];
                const y = targetValues[i];
                if (Number.isFinite(x) && Number.isFinite(y)) {
                    validXValues.push(x);
                    validYValues.push(y);
                }
            }
            if (validXValues.length >= 2) {
                simpleRegression = computeSimpleLinearRegression(validXValues, validYValues);
            }
        }

        summaries[column] = {
            column,
            count,
            mean,
            min: minValue,
            max: maxValue,
            stdDev: Math.sqrt(Math.max(variance, 0)),
            simpleRegression,
        };
    }

    return summaries;
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

/**
 * Compute simple linear regression: y = slope * x + intercept
 * Using least squares method
 */
function computeSimpleLinearRegression(xValues: number[], yValues: number[]): SimpleLinearRegression {
    if (xValues.length !== yValues.length || xValues.length < 2) {
        return { slope: Number.NaN, intercept: Number.NaN };
    }

    const n = xValues.length;
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < n; i += 1) {
        const x = xValues[i];
        const y = yValues[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) {
            return { slope: Number.NaN, intercept: Number.NaN };
        }
        sumX += x;
        sumY += y;
        sumXY += x * y;
        sumXX += x * x;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;

    const numerator = sumXY - n * meanX * meanY;
    const denominator = sumXX - n * meanX * meanX;

    if (Math.abs(denominator) < 1e-10) {
        return { slope: Number.NaN, intercept: meanY };
    }

    const slope = numerator / denominator;
    const intercept = meanY - slope * meanX;

    return { slope, intercept };
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
