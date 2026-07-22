import { describe, it, expect } from 'vitest';
import { olsRegression, RegressionError } from './ols';

describe('olsRegression', () => {
    it('performs simple linear regression with perfect fit', () => {
        const X = [[1], [2], [3], [4], [5]];
        const y = [2, 4, 6, 8, 10];

        const result = olsRegression(X, y, { featureNames: ['x1'] });

        expect(result.n).toBe(5);
        expect(result.p).toBe(1);
        expect(result.coefficients.betas[0]).toBeCloseTo(2, 6);
        expect(result.coefficients.intercept).toBeCloseTo(0, 6);
        expect(result.r2).toBeCloseTo(1, 6);
        expect(result.adjustedR2).toBeCloseTo(1, 6);
        expect(result.metricsPerPredictor).toHaveLength(1);
        expect(result.metricsPerPredictor[0].pValue).toBeLessThan(0.0001);
        expect(result.metricsPerPredictor[0].vif).toBe(1);
        expect(result.equation).toContain('x1');
    });

    it('supports multiple predictors and returns VIF', () => {
        const X = [
            [1, 2],
            [2, 3],
            [3, 4],
            [4, 5],
            [5, 6],
            [6, 7],
        ];
        const y = [3, 5, 7, 9, 11, 13];

        const result = olsRegression(X, y, { featureNames: ['x1', 'x2'] });

        expect(result.p).toBe(2);
        expect(result.metricsPerPredictor).toHaveLength(2);
        const [metric1, metric2] = result.metricsPerPredictor;
        // Both predictors are collinear, so VIF should be high
        expect(metric1.vif).toBeGreaterThan(10);
        expect(metric2.vif).toBeGreaterThan(10);
        expect(result.fStatistic).toBeGreaterThan(10);
        expect(result.residualStandardError).toBeLessThan(2);
    });

    it('handles constant target values by returning zero slope and NaN inferential stats', () => {
        const X = [[1], [2], [3], [4]];
        const y = [3, 3, 3, 3];

        const result = olsRegression(X, y, { featureNames: ['x1'] });

        expect(result.coefficients.intercept).toBeCloseTo(3, 6);
        expect(result.coefficients.betas[0]).toBeCloseTo(0, 6);
        expect(result.r2).toBe(1);
        expect(result.adjustedR2).toBe(1);
        expect(result.residualStandardError).toBeCloseTo(0, 10);

        const predictorMetrics = result.metricsPerPredictor[0];
        expect(predictorMetrics.standardError).toBeCloseTo(0, 10);
        expect(Number.isFinite(predictorMetrics.tStatistic)).toBe(true);
        expect(predictorMetrics.pValue).toBeGreaterThanOrEqual(0);
        expect(predictorMetrics.pValue).toBeLessThanOrEqual(1);
    });

    it('returns NaN statistics when degrees of freedom are exhausted', () => {
        const X = [[1], [2]];
        const y = [3, 4];

        const result = olsRegression(X, y, { featureNames: ['x1'] });

        expect(result.dfResidual).toBe(0);
        expect(Number.isNaN(result.adjustedR2)).toBe(true);
        expect(Number.isNaN(result.residualStandardError)).toBe(true);
        const predictorMetrics = result.metricsPerPredictor[0];
        expect(Number.isNaN(predictorMetrics.standardError)).toBe(true);
        expect(Number.isNaN(predictorMetrics.tStatistic)).toBe(true);
        expect(Number.isNaN(predictorMetrics.pValue)).toBe(true);
    });

    it('throws when inputs are invalid', () => {
        expect(() => olsRegression([], [])).toThrow(RegressionError);
        expect(() => olsRegression([[1, 2]], [1, 2])).toThrow(RegressionError);
        expect(() => olsRegression([[1], [2]], [1])).toThrow(RegressionError);
    });
});
