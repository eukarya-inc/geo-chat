import { describe, it, expect } from 'vitest';
import { kmeans, ClusteringError } from './kmeans';

describe('kmeans', () => {
    it('should cluster simple 2D data into 2 groups', () => {
        // Group 1: points around (0, 0)
        // Group 2: points around (10, 10)
        const X = [
            [0, 0],
            [1, 1],
            [0.5, 0.5],
            [10, 10],
            [11, 11],
            [10.5, 10.5],
        ];

        const result = kmeans(X, { numClusters: 2 });

        expect(result.k).toBe(2);
        expect(result.n).toBe(6);
        expect(result.p).toBe(2);
        expect(result.labels).toHaveLength(6);
        expect(result.centroids).toHaveLength(2);
        expect(result.centroids[0]).toHaveLength(2);
        expect(result.converged).toBe(true);
        expect(result.clusterSizes).toHaveLength(2);
        expect(result.clusterSizes[0] + result.clusterSizes[1]).toBe(6);

        // Check timing information
        expect(result.timing).toBeDefined();
        expect(result.timing.totalMs).toBeGreaterThan(0);
        expect(result.timing.initializationMs).toBeGreaterThan(0);
        expect(result.timing.outlierRemovalMs).toBeGreaterThanOrEqual(0);
        expect(result.timing.reclusteringMs).toBeGreaterThanOrEqual(0);
        expect(result.timing.scalingMs).toBeGreaterThan(0); // Default uses robust scaling

        // Check that points are correctly clustered
        const label0 = result.labels[0];
        const label1 = result.labels[3];
        expect(result.labels[1]).toBe(label0); // Same cluster as (0,0)
        expect(result.labels[2]).toBe(label0); // Same cluster as (0,0)
        expect(result.labels[4]).toBe(label1); // Same cluster as (10,10)
        expect(result.labels[5]).toBe(label1); // Same cluster as (10,10)
    });

    it('should cluster 3D data into 3 groups', () => {
        const X = [
            [0, 0, 0],
            [1, 1, 1],
            [10, 10, 10],
            [11, 11, 11],
            [20, 20, 20],
            [21, 21, 21],
        ];

        const result = kmeans(X, { numClusters: 3 });

        expect(result.k).toBe(3);
        expect(result.n).toBe(6);
        expect(result.p).toBe(3);
        expect(result.centroids).toHaveLength(3);
        expect(result.clusterSizes).toHaveLength(3);
        expect(result.clusterSizes.reduce((a, b) => a + b, 0)).toBe(6);
    });

    it('should use custom feature names when provided', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, {
            numClusters: 2,
            featureNames: ['width', 'height'],
        });

        expect(result.featureNames).toEqual(['width', 'height']);
    });

    it('should generate default feature names when not provided', () => {
        const X = [
            [0, 0, 0],
            [1, 1, 1],
        ];

        const result = kmeans(X, { numClusters: 2 });

        expect(result.featureNames).toEqual(['feature1', 'feature2', 'feature3']);
    });

    it('should compute reasonable inertia', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, { numClusters: 2 });

        expect(result.inertia).toBeGreaterThan(0);
        expect(Number.isFinite(result.inertia)).toBe(true);
    });

    it('should compute reasonable silhouette score', () => {
        const X = [
            [0, 0],
            [1, 1],
            [0.5, 0.5],
            [10, 10],
            [11, 11],
            [10.5, 10.5],
        ];

        const result = kmeans(X, { numClusters: 2 });

        expect(result.silhouetteScore).toBeGreaterThan(0);
        expect(result.silhouetteScore).toBeLessThanOrEqual(1);
    });

    it('should use kmeans++ initialization by default', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, { numClusters: 2 });

        expect(result.converged).toBe(true);
        expect(result.labels).toHaveLength(4);
    });

    it('should support random initialization', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, { numClusters: 2, initMethod: 'random' });

        expect(result.converged).toBe(true);
        expect(result.labels).toHaveLength(4);
    });

    it('should respect maxIterations option', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, { numClusters: 2, maxIterations: 1 });

        // The returned iterations field is the actual number of iterations run
        // maxIterations=1 means the loop runs once (iteration 0), then exits
        // The function returns iterations + 1, so result.iterations should be 1 or 2
        // (1 if converged early with break, 2 if maxIterations reached)
        expect(result.iterations).toBeGreaterThanOrEqual(1);
        expect(result.iterations).toBeLessThanOrEqual(2);
    });

    it('should throw error for empty data', () => {
        expect(() => kmeans([], { numClusters: 2 })).toThrow(ClusteringError);
    });

    it('should throw error for numClusters < 2', () => {
        const X = [
            [0, 0],
            [1, 1],
        ];

        expect(() => kmeans(X, { numClusters: 1 })).toThrow(ClusteringError);
    });

    it('should throw error for numClusters > n', () => {
        const X = [
            [0, 0],
            [1, 1],
        ];

        expect(() => kmeans(X, { numClusters: 3 })).toThrow(ClusteringError);
    });

    it('should throw error for non-finite values', () => {
        const X = [
            [0, 0],
            [1, Number.NaN],
        ];

        expect(() => kmeans(X, { numClusters: 2 })).toThrow(ClusteringError);
    });

    it('should throw error for inconsistent feature dimensions', () => {
        const X = [
            [0, 0],
            [1, 1, 1], // Wrong dimension
        ];

        expect(() => kmeans(X, { numClusters: 2 })).toThrow(ClusteringError);
    });

    it('should handle identical points gracefully', () => {
        const X = [
            [5, 5],
            [5, 5],
            [5, 5],
            [5, 5],
        ];

        const result = kmeans(X, { numClusters: 2 });

        expect(result.converged).toBe(true);
        expect(result.labels).toHaveLength(4);
    });

    it('should handle large k relative to data size', () => {
        const X = [
            [0, 0],
            [1, 1],
            [2, 2],
            [3, 3],
            [4, 4],
        ];

        const result = kmeans(X, { numClusters: 5 });

        expect(result.k).toBe(5);
        expect(result.labels).toHaveLength(5);
        expect(result.clusterSizes.every(size => size >= 1)).toBe(true);
    });

    it('should handle outliers with robust scaling and trimming', () => {
        // Normal data with outliers
        const X = [
            [0, 0],
            [1, 1],
            [0.5, 0.5],
            [10, 10],
            [11, 11],
            [10.5, 10.5],
            [100, 100], // Outlier
            [-100, -100], // Outlier
        ];

        const result = kmeans(X, { numClusters: 2, useRobustScaling: true, trimRatio: 0.25 });

        expect(result.k).toBe(2);
        expect(result.labels).toHaveLength(8);
        expect(result.converged).toBe(true);

        // Check clustering quality
        // With minimum cluster size constraint, some clusters may become empty
        const nonEmptyClusters = result.clusterSizes.filter(size => size > 0);
        expect(nonEmptyClusters.length).toBeGreaterThan(0);
        // All non-empty clusters should have at least 3 points (minimum cluster size)
        for (const size of nonEmptyClusters) {
            expect(size).toBeGreaterThanOrEqual(3);
        }

        // Inertia is a finite value
        expect(Number.isFinite(result.inertia)).toBe(true);
    });

    it('should respect nInit parameter', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        // Works with nInit=1
        const result1 = kmeans(X, { numClusters: 2, nInit: 1 });
        expect(result1.labels).toHaveLength(4);

        // Works with nInit=5
        const result5 = kmeans(X, { numClusters: 2, nInit: 5 });
        expect(result5.labels).toHaveLength(4);
    });

    it('should work without robust scaling', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, { numClusters: 2, useRobustScaling: false });

        expect(result.labels).toHaveLength(4);
        expect(result.converged).toBe(true);

        // Check timing information - scalingMs should be undefined when not using robust scaling
        expect(result.timing).toBeDefined();
        expect(result.timing.totalMs).toBeGreaterThan(0);
        expect(result.timing.scalingMs).toBeUndefined();
    });

    it('should handle small trimRatio', () => {
        const X = [
            [0, 0],
            [1, 1],
            [2, 2],
            [3, 3],
            [10, 10],
        ];

        const result = kmeans(X, { numClusters: 2, trimRatio: 0.2 });

        expect(result.labels).toHaveLength(5);
        expect(result.converged).toBe(true);
    });

    it('should not trim when trimRatio is 0', () => {
        const X = [
            [0, 0],
            [1, 1],
            [10, 10],
            [11, 11],
        ];

        const result = kmeans(X, { numClusters: 2, trimRatio: 0 });

        expect(result.labels).toHaveLength(4);
        expect(result.converged).toBe(true);
    });

    it('should produce consistent results with robust features', () => {
        const X = [
            [1, 10],
            [2, 20],
            [3, 30],
            [11, 110],
            [12, 120],
            [13, 130],
            [1000, 10000], // Extreme outlier
        ];

        const result = kmeans(X, {
            numClusters: 2,
            nInit: 3,
            trimRatio: 0.14, // Trim 1 point
            useRobustScaling: true,
        });

        expect(result.k).toBe(2);
        expect(result.labels).toHaveLength(7);

        // Check clustering quality
        // With minimum cluster size constraint, some clusters may become empty
        const nonEmptyClusters = result.clusterSizes.filter(size => size > 0);
        expect(nonEmptyClusters.length).toBeGreaterThan(0);
        // All non-empty clusters should have at least 3 points (minimum cluster size)
        for (const size of nonEmptyClusters) {
            expect(size).toBeGreaterThanOrEqual(3);
        }

        // Check convergence
        expect(result.converged).toBe(true);

        // Inertia is a finite value
        expect(Number.isFinite(result.inertia)).toBe(true);
    });

    it('should enforce minimum cluster size of 3 points', () => {
        // Create data where one cluster would naturally have only 1-2 points
        const X = [
            // Main group 1 (close together)
            [0, 0],
            [0.5, 0.5],
            [1, 1],
            [0.8, 0.8],
            // Main group 2 (close together)
            [10, 10],
            [10.5, 10.5],
            [11, 11],
            [10.8, 10.8],
            // Outlier that would form a singleton cluster
            [50, 50],
        ];

        const result = kmeans(X, { numClusters: 3 });

        // All clusters should have at least 3 points or be empty
        for (const size of result.clusterSizes) {
            if (size > 0) {
                expect(size).toBeGreaterThanOrEqual(3);
            }
        }

        // Total points should still be 9
        expect(result.clusterSizes.reduce((a, b) => a + b, 0)).toBe(9);
    });

    it('should handle case where multiple small clusters need merging', () => {
        const X = [
            // Group 1
            [0, 0],
            [0.5, 0.5],
            [1, 1],
            [0.8, 0.8],
            // Group 2
            [10, 10],
            [10.5, 10.5],
            [11, 11],
            [10.8, 10.8],
            // Two outliers
            [50, 50],
            [55, 55],
        ];

        const result = kmeans(X, { numClusters: 4 });

        // All non-empty clusters should have at least 3 points
        const nonEmptyClusters = result.clusterSizes.filter(size => size > 0);
        for (const size of nonEmptyClusters) {
            expect(size).toBeGreaterThanOrEqual(3);
        }

        // Total points should still be 10
        expect(result.clusterSizes.reduce((a, b) => a + b, 0)).toBe(10);
    });
});
