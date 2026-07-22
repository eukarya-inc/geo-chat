/**
 * K-means clustering benchmark tests
 * Run with: npm run test:browser -- benchmark.browser.test.ts
 *
 * These tests are excluded from normal test runs and require browser mode
 * to properly measure memory usage and Web Worker performance.
 */

import { describe, it, expect } from 'vitest';
import {
    benchmarkStandardKMeans,
    benchmarkScalableKMeans,
    formatBenchmarkResults,
    type BenchmarkResult,
} from './benchmark';

describe('K-means Clustering Benchmarks', () => {
    // Increase timeout for benchmark tests
    const BENCHMARK_TIMEOUT = 120000; // 2 minutes

    describe('Small datasets (1K points)', () => {
        it(
            'should benchmark standard k-means with 1K points',
            async () => {
                const result = await benchmarkStandardKMeans(1000, 2, 3);

                expect(result.error).toBeUndefined();
                expect(result.converged).toBe(true);
                expect(result.totalTimeMs).toBeGreaterThan(0);
                expect(result.silhouetteScore).toBeGreaterThan(-1);
                expect(result.silhouetteScore).toBeLessThanOrEqual(1);

                console.log('\n📊 Standard k-means (1K points):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
            },
            BENCHMARK_TIMEOUT
        );

        it(
            'should benchmark scalable k-means with 1K points ',
            async () => {
                const result = await benchmarkScalableKMeans(1000, 2, 3);

                expect(result.error).toBeUndefined();
                expect(result.converged).toBe(true);
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (1K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
            },
            BENCHMARK_TIMEOUT
        );
    });

    describe('Medium datasets (10K points)', () => {
        it(
            'should benchmark standard k-means with 10K points',
            async () => {
                const result = await benchmarkStandardKMeans(10000, 2, 3);

                expect(result.error).toBeUndefined();
                expect(result.converged).toBe(true);
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Standard k-means (10K points):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
            },
            BENCHMARK_TIMEOUT
        );

        it(
            'should benchmark scalable k-means with 10K points ',
            async () => {
                const result = await benchmarkScalableKMeans(10000, 2, 3);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (10K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
            },
            BENCHMARK_TIMEOUT
        );

        it(
            'should benchmark scalable k-means with 10K points ',
            async () => {
                const result = await benchmarkScalableKMeans(10000, 2, 3);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (10K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
            },
            BENCHMARK_TIMEOUT
        );
    });

    describe('Large datasets (50K points)', () => {
        it(
            'should benchmark scalable k-means with 50K points ',
            async () => {
                const result = await benchmarkScalableKMeans(50000, 2, 5);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (50K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
            },
            BENCHMARK_TIMEOUT
        );

        it(
            'should benchmark scalable k-means with 50K points ',
            async () => {
                const result = await benchmarkScalableKMeans(50000, 2, 5);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (50K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
            },
            BENCHMARK_TIMEOUT
        );
    });

    describe('Very large datasets (100K points)', () => {
        it(
            'should benchmark scalable k-means with 100K points ',
            async () => {
                const result = await benchmarkScalableKMeans(100000, 2, 5);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (100K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
                console.log(`   Inertia: ${result.inertia.toFixed(2)}`);
                console.log(`   Iterations: ${result.iterations}`);
            },
            BENCHMARK_TIMEOUT
        );

        it(
            'should benchmark scalable k-means with 100K points ',
            async () => {
                const result = await benchmarkScalableKMeans(100000, 2, 5);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (100K points, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
                console.log(`   Inertia: ${result.inertia.toFixed(2)}`);
                console.log(`   Iterations: ${result.iterations}`);
            },
            BENCHMARK_TIMEOUT
        );
    });

    describe('High-dimensional data', () => {
        it(
            'should benchmark scalable k-means with 10K points in 10D',
            async () => {
                const result = await benchmarkScalableKMeans(10000, 10, 5);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (10K points, 10D, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
            },
            BENCHMARK_TIMEOUT
        );

        it(
            'should benchmark scalable k-means with 50K points in 10D',
            async () => {
                const result = await benchmarkScalableKMeans(50000, 10, 5);

                expect(result.error).toBeUndefined();
                expect(result.totalTimeMs).toBeGreaterThan(0);

                console.log('\n📊 Scalable k-means (50K points, 10D, ):');
                console.log(`   Time: ${result.totalTimeMs.toFixed(2)}ms`);
                if (result.memoryUsedMB) {
                    console.log(`   Memory: ${result.memoryUsedMB.toFixed(2)}MB`);
                }
                console.log(`   Silhouette: ${result.silhouetteScore.toFixed(3)}`);
            },
            BENCHMARK_TIMEOUT
        );
    });

    describe('Comprehensive comparison', () => {
        it(
            'should run full benchmark suite and generate comparison table',
            async () => {
                const results: BenchmarkResult[] = [];

                console.log('\n\n🚀 Running comprehensive k-means benchmark suite...\n');

                // 1K points - compare all methods
                console.log('Testing 1K points (2D, k=3)...');
                results.push(await benchmarkStandardKMeans(1000, 2, 3));
                results.push(await benchmarkScalableKMeans(1000, 2, 3));
                results.push(await benchmarkScalableKMeans(1000, 2, 3));

                // 10K points - compare all methods
                console.log('Testing 10K points (2D, k=3)...');
                results.push(await benchmarkStandardKMeans(10000, 2, 3));
                results.push(await benchmarkScalableKMeans(10000, 2, 3));
                results.push(await benchmarkScalableKMeans(10000, 2, 3));

                // 50K points - scalable only
                console.log('Testing 50K points (2D, k=5)...');
                results.push(await benchmarkScalableKMeans(50000, 2, 5));
                results.push(await benchmarkScalableKMeans(50000, 2, 5));

                // 100K points - scalable only
                console.log('Testing 100K points (2D, k=5)...');
                results.push(await benchmarkScalableKMeans(100000, 2, 5));
                results.push(await benchmarkScalableKMeans(100000, 2, 5));

                // High-dimensional
                console.log('Testing 10K points (10D, k=5)...');
                results.push(await benchmarkScalableKMeans(10000, 10, 5));

                console.log('Testing 50K points (10D, k=5)...');
                results.push(await benchmarkScalableKMeans(50000, 10, 5));

                // Print formatted results
                const table = formatBenchmarkResults(results);
                console.log(table);

                // Find fastest implementation for each dataset size
                const groups = new Map<number, BenchmarkResult[]>();
                for (const result of results) {
                    const key = result.dataPoints;
                    if (!groups.has(key)) {
                        groups.set(key, []);
                    }
                    groups.get(key)!.push(result);
                }

                console.log('\n🏆 Performance Summary:\n');
                for (const [points, group] of groups) {
                    const fastest = group.reduce((a, b) => (a.totalTimeMs < b.totalTimeMs ? a : b));
                    console.log(
                        `${points.toLocaleString()} points: ${fastest.name} (${fastest.totalTimeMs.toFixed(2)}ms)`
                    );
                }

                // All tests should pass
                expect(results.every(r => !r.error)).toBe(true);
            },
            BENCHMARK_TIMEOUT * 10
        ); // Extra time for comprehensive suite
    });
});
