import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import { olsRegression, type RegressionResult } from '../../../utils/regression/ols';
import type { ColumnSummary, RegressionAnalysisResponse } from '../../../types/regression';

const DEFAULT_MAX_ROWS = 5000;
const MAX_ALLOWED_ROWS = 20000;
const MIN_REQUIRED_ROWS = 10;
const MAX_AUTO_COLUMNS = 20;
const MAX_PREDICTORS = 6;

export function createRegressionTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Perform multiple linear regression analysis on DuckDB tables.
Returns regression coefficients, inference metrics (p-values, t-statistics, F statistic, adjusted R²),
variance inflation factors (VIF), and regression line metadata for each predictor.

IMPORTANT: After using this tool successfully, ALWAYS create regression visualizations **without** augmenting DuckDB tables with predicted columns:
1. Keep the scatter layer bound to the original data table (observed values only); never join or persist predicted values into that table.
2. Compute the regression endpoints by taking each predictor's min and max from regression.columnSummaries (and holding other predictors at their means) and evaluating the equation predicted = intercept + Σ βᵢ·xᵢ at those values.
3. Store exactly those two points per predictor inside the Vega-Lite spec's datasets section and reference the dataset name from the regression line layer.
4. In create_chart, use layered marks:
   - Scatter layer: data.sql (or equivalent) pointing at the source table with mark {"type": "point"}
   - Regression layer: data.name referencing the datasets entry with mark {"type": "line"} and an order on the predictor field
   Include tooltips so observed and predicted values can be compared directly.

Example workflow after regression:
1. perform_regression_analysis returns the regression coefficients (intercept + betas) and columnSummaries with min, max, and mean values for each numeric column.
2. For each predictor, evaluate the regression equation at (predictor_min, other_means) and (predictor_max, other_means), put those two points into the Vega-Lite datasets (e.g., "reg_line_<alias>"), then call create_chart with a layered spec that references the original table for points and the datasets entry for the regression line.`,
        parameters: z.object({
            table_name: z.string().describe('Table name to analyze'),
            target_column: z
                .string()
                .optional()
                .describe(
                    'Dependent variable column. When omitted the tool will pick a numeric column with the highest variance.'
                ),
            explanatory_columns: z
                .array(z.string())
                .min(1)
                .max(MAX_PREDICTORS)
                .optional()
                .describe(
                    'Predictor columns (1-6). When omitted the tool automatically selects numeric columns highly correlated with the target.'
                ),
            max_rows: z
                .number()
                .int()
                .min(MIN_REQUIRED_ROWS)
                .max(MAX_ALLOWED_ROWS)
                .optional()
                .describe('Maximum number of rows to sample. Default 5000.'),
        }),
        execute: async ({ table_name, target_column, explanatory_columns, max_rows }) => {
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

                const providedPredictors = deduplicateStrings(explanatory_columns ?? []);

                if (target_column && !numericColumns.includes(target_column)) {
                    return errorResponse(
                        `目的変数カラム「${target_column}」は存在しないか数値型ではありません。数値カラムを指定してください。`
                    );
                }

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

                const needsAutoSelection =
                    !target_column || providedPredictors.length === 0 || providedPredictors.includes(target_column);

                const { columnsToFetch, truncated } = determineWorkingColumns({
                    numericColumns,
                    targetColumn: target_column ?? null,
                    predictorColumns: providedPredictors,
                    needsAutoSelection,
                    maxColumns: MAX_AUTO_COLUMNS,
                });

                if (columnsToFetch.length === 0) {
                    return errorResponse('分析対象となる数値カラムを特定できませんでした。');
                }

                const limit = clamp(max_rows ?? DEFAULT_MAX_ROWS, MIN_REQUIRED_ROWS, MAX_ALLOWED_ROWS);
                const query = `SELECT ${columnsToFetch
                    .map(quoteIdentifier)
                    .join(', ')} FROM ${qualifiedTable} LIMIT ${limit};`;
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

                // Auto-select target when omitted
                let targetColumn = target_column ?? '';
                let autoTarget = false;
                if (!targetColumn) {
                    const detectedTarget = pickTargetColumn(numericData, columnsToFetch);
                    autoTarget = true;
                    if (!detectedTarget) {
                        return errorResponse('適切な目的変数候補が見つかりませんでした。');
                    }
                    targetColumn = detectedTarget;
                }

                // Validate provided predictors and auto-select when needed
                let predictorColumns = providedPredictors.filter(column => column !== targetColumn);
                let autoPredictors = false;

                if (predictorColumns.length === 0) {
                    predictorColumns = pickPredictorColumns(numericData, columnsToFetch, targetColumn, MAX_PREDICTORS);
                    autoPredictors = true;
                }

                if (predictorColumns.length === 0) {
                    return errorResponse(
                        '目的変数と十分な関連を持つ説明変数が見つかりませんでした。数値カラムを指定して再度お試しください。'
                    );
                }

                const missingColumns = predictorColumns.filter(column => !(column in numericData));
                if (!numericData[targetColumn] || missingColumns.length > 0) {
                    return errorResponse(
                        `回帰分析に必要なカラムがデータに含まれていません（不足: ${[
                            targetColumn,
                            ...missingColumns,
                        ].join(', ')}）。`
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

                const columnSummaries = buildColumnSummaries(columnTrackers);
                const warnings: string[] = [];

                if (truncated) {
                    warnings.push(
                        `数値カラムが多いため、最初の${MAX_AUTO_COLUMNS}件を自動選択対象としました。他のカラムを分析する場合は明示的に指定してください。`
                    );
                }

                if (skippedRows > 0) {
                    warnings.push(`NULLまたは非数値値のために${skippedRows}行を除外しました。`);
                }

                if (usedRows < totalRows) {
                    warnings.push(
                        `サンプリング上限${limit}行から有効${usedRows}行を利用しました。より正確な結果が必要な場合はmax_rowsを増やしてください。`
                    );
                }

                // Generate suggestions for creating regression line charts
                const suggestions: string[] = [];
                const { intercept, betas, names } = regression.coefficients;
                const coefficientsAreFinite =
                    Number.isFinite(intercept) &&
                    betas.every(beta => Number.isFinite(beta)) &&
                    names.length === betas.length;

                if (coefficientsAreFinite) {
                    const targetAlias = toAsciiIdentifier(targetColumn, 'target');
                    const predictedAlias = toAsciiIdentifier(`predicted_${targetColumn}`, 'predicted');

                    suggestions.push(
                        `次のステップ: 散布図は元テーブルの実測値（例: ${targetColumn}→${targetAlias}）をpointマークで描画し、回帰直線はdatasetsに登録した2点のみ（xに説明変数エイリアス、yに${predictedAlias}）をlineマークで表示してください。テーブルへ予測列を追加する必要はありません。`
                    );

                    const computePredicted = (featureIndex: number, predictorValue: number): number => {
                        let predictedValue = intercept;
                        for (let idx = 0; idx < betas.length; idx += 1) {
                            const featureName = names[idx];
                            const contributionValue =
                                idx === featureIndex ? predictorValue : (columnSummaries[featureName]?.mean ?? 0);
                            predictedValue += betas[idx] * contributionValue;
                        }
                        return predictedValue;
                    };

                    for (const predictor of predictorColumns) {
                        const predictorIndex = names.indexOf(predictor);
                        if (predictorIndex === -1) continue;

                        const predictorSummary = columnSummaries[predictor];
                        if (!predictorSummary) continue;

                        const { min: minX, max: maxX } = predictorSummary;
                        if (!Number.isFinite(minX) || !Number.isFinite(maxX)) continue;

                        const minPredicted = computePredicted(predictorIndex, minX);
                        const maxPredicted = computePredicted(predictorIndex, maxX);
                        if (!Number.isFinite(minPredicted) || !Number.isFinite(maxPredicted)) continue;

                        const predictorAlias = toAsciiIdentifier(predictor, 'predictor');
                        const datasetName = `reg_line_${predictorAlias}`;

                        const otherMeans = names
                            .filter((_, idx) => idx !== predictorIndex)
                            .map(name => {
                                const alias = toAsciiIdentifier(name, 'feature');
                                const mean = columnSummaries[name]?.mean ?? 0;
                                return `${alias}=${formatNumeric(mean)}`;
                            })
                            .join(', ');

                        const datasetSnippet = `  "${datasetName}": [\n    { "${predictorAlias}": ${formatNumeric(minX)}, "${predictedAlias}": ${formatNumeric(minPredicted)} },\n    { "${predictorAlias}": ${formatNumeric(maxX)}, "${predictedAlias}": ${formatNumeric(maxPredicted)} }\n  ]`;

                        suggestions.push(
                            `説明変数「${predictor}」の回帰線データセット例:\n{\n${datasetSnippet}\n}\nlineレイヤーでは data.name "${datasetName}"、encoding.x "${predictorAlias}"、encoding.y "${predictedAlias}" を指定してください。${
                                otherMeans
                                    ? ` 他の説明変数は平均値（${otherMeans}）を固定して予測値を計算しています。`
                                    : ''
                            }`
                        );
                    }
                } else {
                    warnings.push('回帰係数が有限値ではないため、回帰直線用のmin/maxポイントを提案できません。');
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
                        samplingLimit: limit,
                    },
                    autoSelection: {
                        target: autoTarget,
                        predictors: autoPredictors,
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

function determineWorkingColumns({
    numericColumns,
    targetColumn,
    predictorColumns,
    needsAutoSelection,
    maxColumns,
}: {
    numericColumns: string[];
    targetColumn: string | null;
    predictorColumns: string[];
    needsAutoSelection: boolean;
    maxColumns: number;
}): { columnsToFetch: string[]; truncated: boolean } {
    const required = deduplicateStrings([targetColumn ?? '', ...predictorColumns].filter(Boolean));

    if (!needsAutoSelection) {
        return {
            columnsToFetch: required,
            truncated: false,
        };
    }

    const columns: string[] = [...required];
    const seen = new Set(columns);

    for (const column of numericColumns) {
        if (columns.length >= maxColumns) {
            break;
        }
        if (!seen.has(column)) {
            columns.push(column);
            seen.add(column);
        }
    }

    const truncated = numericColumns.length > columns.length;
    return {
        columnsToFetch: columns,
        truncated,
    };
}

function errorResponse(message: string, warnings?: string[]): RegressionAnalysisResponse {
    return {
        success: false,
        message,
        warnings,
    };
}

function buildColumnSummaries(columnValues: Record<string, number[]>): Record<string, ColumnSummary> {
    const summaries: Record<string, ColumnSummary> = {};

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
        summaries[column] = {
            column,
            count,
            mean,
            min: minValue,
            max: maxValue,
            stdDev: Math.sqrt(Math.max(variance, 0)),
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

function pickTargetColumn(
    numericData: Record<string, number[]>,
    columnCandidates: string[],
    minValues = MIN_REQUIRED_ROWS
): string | null {
    let bestColumn: string | null = null;
    let bestVariance = -Infinity;

    for (const column of columnCandidates) {
        const series = numericData[column];
        if (!series || series.length === 0) continue;
        const values = series.filter(value => Number.isFinite(value));
        if (values.length < minValues) continue;

        const variance = computeVariance(values);
        if (Number.isFinite(variance) && variance > bestVariance) {
            bestVariance = variance;
            bestColumn = column;
        }
    }

    if (!bestColumn) {
        for (const column of columnCandidates) {
            const series = numericData[column];
            if (!series) continue;
            const validCount = series.reduce((acc, value) => acc + (Number.isFinite(value) ? 1 : 0), 0);
            if (validCount >= minValues) {
                bestColumn = column;
                break;
            }
        }
    }

    return bestColumn;
}

function pickPredictorColumns(
    numericData: Record<string, number[]>,
    columnCandidates: string[],
    targetColumn: string,
    maxPredictors: number,
    minValues = MIN_REQUIRED_ROWS
): string[] {
    const targetSeries = numericData[targetColumn];
    if (!targetSeries) return [];

    const stats = columnCandidates
        .filter(column => column !== targetColumn)
        .map(column => {
            const otherSeries = numericData[column];
            if (!otherSeries) {
                return { column, correlation: Number.NaN, pairCount: 0 };
            }
            const { correlation, pairCount } = computeCorrelation(targetSeries, otherSeries);
            return {
                column,
                correlation,
                pairCount,
            };
        })
        .filter(item => item.pairCount >= minValues && Number.isFinite(item.correlation));

    stats.sort((a, b) => {
        const diff = Math.abs(b.correlation) - Math.abs(a.correlation);
        if (diff !== 0) return diff;
        return b.pairCount - a.pairCount;
    });

    return stats.slice(0, maxPredictors).map(item => item.column);
}

function computeVariance(values: number[]): number {
    if (values.length === 0) return Number.NaN;
    if (values.length === 1) return 0;
    const mean = values.reduce((acc, value) => acc + value, 0) / values.length;
    const sumSq = values.reduce((acc, value) => {
        const diff = value - mean;
        return acc + diff * diff;
    }, 0);
    return sumSq / (values.length - 1);
}

function computeCorrelation(seriesA: number[], seriesB: number[]): { correlation: number; pairCount: number } {
    const length = Math.min(seriesA.length, seriesB.length);
    if (length === 0) return { correlation: Number.NaN, pairCount: 0 };

    let pairCount = 0;
    let sumX = 0;
    let sumY = 0;
    let sumXX = 0;
    let sumYY = 0;
    let sumXY = 0;

    for (let i = 0; i < length; i += 1) {
        const x = seriesA[i];
        const y = seriesB[i];
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;

        pairCount += 1;
        sumX += x;
        sumY += y;
        sumXX += x * x;
        sumYY += y * y;
        sumXY += x * y;
    }

    if (pairCount < 2) return { correlation: Number.NaN, pairCount };

    const meanX = sumX / pairCount;
    const meanY = sumY / pairCount;
    const cov = sumXY - pairCount * meanX * meanY;
    const varX = sumXX - pairCount * meanX * meanX;
    const varY = sumYY - pairCount * meanY * meanY;

    if (varX <= 0 || varY <= 0) {
        return { correlation: 0, pairCount };
    }

    const denominator = Math.sqrt(varX * varY);
    return {
        correlation: cov / denominator,
        pairCount,
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

function toAsciiIdentifier(name: string, fallbackPrefix: string): string {
    const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    let candidate = normalized
        .replace(/[^A-Za-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .toLowerCase();

    if (!candidate) {
        const hex = Array.from(name)
            .map(char => {
                const codePoint = char.codePointAt(0);
                return codePoint !== undefined ? codePoint.toString(16) : '';
            })
            .join('');
        candidate = `${fallbackPrefix}_${hex}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }

    candidate = candidate.replace(/__+/g, '_');

    if (!/^[a-z]/.test(candidate)) {
        candidate = `${fallbackPrefix}_${candidate}`.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    }

    if (candidate.length > 64) {
        candidate = candidate.slice(0, 64).replace(/_+$/g, '');
    }

    if (!candidate) {
        candidate = fallbackPrefix.toLowerCase();
    }

    return candidate;
}
