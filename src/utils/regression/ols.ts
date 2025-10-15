import { Matrix, pseudoInverse } from 'ml-matrix';
import { jStat } from 'jstat';

export interface RegressionMetricsPerPredictor {
    name: string;
    beta: number;
    standardError: number;
    tStatistic: number;
    pValue: number;
    vif: number | null;
    correlation: number;
}

export interface RegressionPlotSeries {
    predictor: string;
    points: Array<{ x: number; y: number }>;
    regressionLine: Array<{ x: number; y: number }>;
    summary: {
        minX: number;
        maxX: number;
        slope: number;
        intercept: number;
        correlation: number;
    };
}

export interface RegressionResult {
    n: number;
    p: number;
    coefficients: {
        intercept: number;
        betas: number[];
        names: string[];
    };
    equation: string;
    r2: number;
    adjustedR2: number;
    sse: number;
    ssr: number;
    sst: number;
    dfModel: number;
    dfResidual: number;
    fStatistic: number;
    residualStandardError: number;
    metricsPerPredictor: RegressionMetricsPerPredictor[];
    predictions: number[];
    residuals: number[];
    plotSeries: RegressionPlotSeries[];
}

export interface RegressionOptions {
    featureNames?: string[];
    generatePlots?: boolean;
}

export class RegressionError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'RegressionError';
    }
}

const DEFAULT_PLOT_SAMPLE_LIMIT = 2000;

/**
 * Ordinary Least Squares regression supporting single and multiple predictors.
 * Returns rich statistics including inference metrics and optional plot data.
 */
export function olsRegression(X: number[][], y: number[], options: RegressionOptions = {}): RegressionResult {
    if (!Array.isArray(X) || !Array.isArray(y)) {
        throw new RegressionError('X and y must be arrays');
    }

    const n = X.length;
    if (n === 0) {
        throw new RegressionError('X is empty');
    }

    const p = X[0].length;
    if (p === 0) {
        throw new RegressionError('At least one predictor column is required');
    }

    if (y.length !== n) {
        throw new RegressionError('X and y must have the same number of rows');
    }

    const featureNames =
        options.featureNames && options.featureNames.length === p
            ? options.featureNames.slice()
            : Array.from({ length: p }, (_, i) => `x${i + 1}`);

    // Validate data contains only finite numbers
    for (let i = 0; i < n; i += 1) {
        if (!Number.isFinite(y[i])) {
            throw new RegressionError(`y[${i}] is not a finite number`);
        }
        for (let j = 0; j < p; j += 1) {
            if (!Number.isFinite(X[i][j])) {
                throw new RegressionError(`X[${i}][${j}] is not a finite number`);
            }
        }
    }

    const design = new Matrix(X.map(row => [1, ...row])); // [n, p + 1]
    const yVector = Matrix.columnVector(y); // [n, 1]

    // Beta = (X'X)^(-1) X'y (use pseudo inverse for numerical stability)
    const Xt = design.transpose();
    const XtX = Xt.mmul(design);
    const XtXInv = pseudoInverse(XtX);
    const betaVector = XtXInv.mmul(Xt).mmul(yVector); // (p + 1) x 1

    const predictionsMatrix = design.mmul(betaVector); // [n, 1]
    const residualsMatrix = yVector.sub(predictionsMatrix); // [n, 1]

    const predictions = Array.from({ length: n }, (_, i) => predictionsMatrix.get(i, 0));
    const residuals = Array.from({ length: n }, (_, i) => residualsMatrix.get(i, 0));

    const sse = residualsMatrix.transpose().mmul(residualsMatrix).get(0, 0);
    const yMean = y.reduce((acc, value) => acc + value, 0) / n;
    const sst = y.reduce((acc, value) => {
        const diff = value - yMean;
        return acc + diff * diff;
    }, 0);
    const ssr = sst - sse;

    const r2 = sst === 0 ? 1 : 1 - sse / sst;
    const dfModel = p;
    const dfResidual = n - (p + 1);
    const adjustedR2 = dfResidual > 0 ? 1 - (1 - r2) * ((n - 1) / dfResidual) : Number.NaN;
    const residualVariance = dfResidual > 0 ? sse / dfResidual : Number.NaN;
    const residualStandardError = Number.isFinite(residualVariance) ? Math.sqrt(residualVariance) : Number.NaN;

    // Variance-covariance matrix for coefficients
    const covarianceMatrix = XtXInv.mul(residualVariance); // (p + 1) x (p + 1)
    const standardErrors = Array.from({ length: p + 1 }, (_, i) => {
        const variance = covarianceMatrix.get(i, i);
        return variance >= 0 ? Math.sqrt(variance) : Number.NaN;
    });

    const tStatistics = standardErrors.map((se, idx) => {
        if (!Number.isFinite(se) || se === 0) {
            return Number.NaN;
        }
        return betaVector.get(idx, 0) / se;
    });

    const pValues = tStatistics.map(t => {
        if (!Number.isFinite(t) || !Number.isFinite(dfResidual) || dfResidual <= 0) {
            return Number.NaN;
        }
        const cdf = jStat.studentt.cdf(Math.abs(t), dfResidual);
        return 2 * (1 - cdf);
    });

    const betas = Array.from({ length: p }, (_, i) => betaVector.get(i + 1, 0));
    const intercept = betaVector.get(0, 0);

    const fStatistic =
        dfModel > 0 && dfResidual > 0 && residualVariance !== 0 ? ssr / dfModel / (sse / dfResidual) : Number.NaN;

    // Correlation between each predictor and target
    const correlations = featureNames.map((_, colIdx) => {
        const column = X.map(row => row[colIdx]);
        const columnMean = column.reduce((acc, value) => acc + value, 0) / n;
        const columnStd = Math.sqrt(column.reduce((acc, value) => acc + (value - columnMean) ** 2, 0));
        const targetStd = Math.sqrt(y.reduce((acc, value) => acc + (value - yMean) ** 2, 0));
        if (columnStd === 0 || targetStd === 0) {
            return Number.NaN;
        }

        const covariance = column.reduce((acc, value, rowIdx) => {
            return acc + (value - columnMean) * (y[rowIdx] - yMean);
        }, 0);

        return covariance / (columnStd * targetStd);
    });

    // Variance Inflation Factor (requires recursive regression)
    const vifs = featureNames.map((_, featureIdx) => {
        if (p === 1) {
            return 1;
        }

        const reducedX = X.map(row => row.filter((_, idx) => idx !== featureIdx));
        const targetFeature = X.map(row => row[featureIdx]);

        try {
            const result = olsRegression(reducedX, targetFeature, {
                featureNames: featureNames.filter((_, idx) => idx !== featureIdx),
                generatePlots: false,
            });
            if (!Number.isFinite(result.r2)) {
                return Number.NaN;
            }
            return result.r2 >= 1 ? Number.POSITIVE_INFINITY : 1 / (1 - result.r2);
        } catch {
            return Number.NaN;
        }
    });

    const metricsPerPredictor: RegressionMetricsPerPredictor[] = featureNames.map((name, idx) => ({
        name,
        beta: betas[idx],
        standardError: standardErrors[idx + 1],
        tStatistic: tStatistics[idx + 1],
        pValue: pValues[idx + 1],
        vif: vifs[idx],
        correlation: correlations[idx],
    }));

    // Optional plot series generation
    const plotSeries: RegressionPlotSeries[] = [];
    if (options.generatePlots !== false) {
        const sampleLimit = Math.min(n, DEFAULT_PLOT_SAMPLE_LIMIT);
        const sampleIndices =
            n <= sampleLimit
                ? Array.from({ length: n }, (_, i) => i)
                : // simple uniform sampling if dataset is large
                  Array.from({ length: sampleLimit }, (_, i) => Math.floor((i * n) / sampleLimit));

        featureNames.forEach((name, idx) => {
            const predictorValues = sampleIndices.map(rowIdx => X[rowIdx][idx]);
            const targetValues = sampleIndices.map(rowIdx => y[rowIdx]);

            const minX = Math.min(...predictorValues);
            const maxX = Math.max(...predictorValues);

            const slope = betas[idx];
            const line = [
                { x: minX, y: intercept + slope * minX },
                { x: maxX, y: intercept + slope * maxX },
            ];

            plotSeries.push({
                predictor: name,
                points: predictorValues.map((xValue, arrIdx) => ({
                    x: xValue,
                    y: targetValues[arrIdx],
                })),
                regressionLine: line,
                summary: {
                    minX,
                    maxX,
                    slope,
                    intercept,
                    correlation: correlations[idx],
                },
            });
        });
    }

    const equation = createEquationString(intercept, betas, featureNames);

    return {
        n,
        p,
        coefficients: {
            intercept,
            betas,
            names: featureNames,
        },
        equation,
        r2,
        adjustedR2,
        sse,
        ssr,
        sst,
        dfModel,
        dfResidual,
        fStatistic,
        residualStandardError,
        metricsPerPredictor,
        predictions,
        residuals,
        plotSeries,
    };
}

function createEquationString(intercept: number, betas: number[], names: string[]): string {
    const interceptTerm = formatNumber(intercept);

    const terms = betas.map((beta, idx) => {
        const coefficient = formatNumber(Math.abs(beta));
        const sign = beta >= 0 ? '+' : '-';
        return `${sign} ${coefficient}·${names[idx]}`;
    });

    return `y = ${[interceptTerm, ...terms].join(' ')}`;
}

function formatNumber(value: number, digits = 6): string {
    if (!Number.isFinite(value)) {
        return 'NaN';
    }

    const magnitude = Math.abs(value);

    if (magnitude !== 0 && (magnitude >= 10 ** digits || magnitude <= 10 ** -digits)) {
        return value.toExponential(4);
    }

    const factor = 10 ** digits;
    return (Math.round(value * factor) / factor).toString();
}
