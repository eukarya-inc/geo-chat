/**
 * Benchmark for k-means clustering implementations
 * Tests performance and memory usage with large datasets
 */

import { kmeans } from './kmeans';
import { scalableKmeans } from './scalableKmeans';

export interface BenchmarkResult {
    name: string;
    dataPoints: number;
    features: number;
    clusters: number;
    totalTimeMs: number;
    initTimeMs?: number;
    assignTimeMs?: number;
    refineTimeMs?: number;
    memoryUsedMB?: number;
    peakMemoryMB?: number;
    silhouetteScore: number;
    inertia: number;
    converged: boolean;
    iterations: number;
    clusterSizes: number[];
    error?: string;
}

/**
 * Generate synthetic clustered data for benchmarking
 */
function generateClusteredData(numPoints: number, numFeatures: number, numClusters: number): number[][] {
    const data: number[][] = [];
    const pointsPerCluster = Math.floor(numPoints / numClusters);

    for (let c = 0; c < numClusters; c++) {
        // Random cluster center
        const center = Array.from({ length: numFeatures }, () => Math.random() * 100);

        // Generate points around this center
        const pointsInThisCluster = c === numClusters - 1 ? numPoints - data.length : pointsPerCluster;

        for (let i = 0; i < pointsInThisCluster; i++) {
            const point = center.map(val => val + (Math.random() - 0.5) * 10);
            data.push(point);
        }
    }

    // Shuffle to avoid ordered data
    for (let i = data.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [data[i], data[j]] = [data[j], data[i]];
    }

    return data;
}

/**
 * Measure memory usage (if performance.memory is available)
 */
function getMemoryUsage(): number | undefined {
    if (typeof performance !== 'undefined' && 'memory' in performance) {
        const memory = (performance as { memory?: { usedJSHeapSize: number } }).memory;
        return memory ? memory.usedJSHeapSize / (1024 * 1024) : undefined; // Convert to MB
    }
    return undefined;
}

/**
 * Run benchmark for standard k-means
 */
export async function benchmarkStandardKMeans(
    numPoints: number,
    numFeatures: number,
    numClusters: number
): Promise<BenchmarkResult> {
    const name = 'Standard k-means';
    const data = generateClusteredData(numPoints, numFeatures, numClusters);

    const memoryBefore = getMemoryUsage();
    const startTime = performance.now();

    try {
        const result = kmeans(data, {
            numClusters,
            maxIterations: 100,
            useRobustScaling: false, // Disable for fair comparison
            trimRatio: 0, // Disable trimming
        });

        const totalTimeMs = performance.now() - startTime;
        const memoryAfter = getMemoryUsage();
        const memoryUsedMB =
            memoryBefore !== undefined && memoryAfter !== undefined ? memoryAfter - memoryBefore : undefined;

        return {
            name,
            dataPoints: numPoints,
            features: numFeatures,
            clusters: numClusters,
            totalTimeMs,
            initTimeMs: result.timing.initializationMs,
            memoryUsedMB,
            silhouetteScore: result.silhouetteScore,
            inertia: result.inertia,
            converged: result.converged,
            iterations: result.iterations,
            clusterSizes: result.clusterSizes,
        };
    } catch (error) {
        const totalTimeMs = performance.now() - startTime;
        return {
            name,
            dataPoints: numPoints,
            features: numFeatures,
            clusters: numClusters,
            totalTimeMs,
            silhouetteScore: 0,
            inertia: 0,
            converged: false,
            iterations: 0,
            clusterSizes: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Run benchmark for scalable k-means
 */
export async function benchmarkScalableKMeans(
    numPoints: number,
    numFeatures: number,
    numClusters: number
): Promise<BenchmarkResult> {
    const name = 'Scalable k-means';
    const data = generateClusteredData(numPoints, numFeatures, numClusters);

    const memoryBefore = getMemoryUsage();
    const startTime = performance.now();

    try {
        const result = await scalableKmeans(data, {
            numClusters,
            maxIterations: 20,
            refinementIterations: 2,
            sampleRatio: 0.1,
            maxSampleSize: 10000,
            useRobustScaling: false, // Disable for fair comparison
        });

        const totalTimeMs = performance.now() - startTime;
        const memoryAfter = getMemoryUsage();
        const memoryUsedMB =
            memoryBefore !== undefined && memoryAfter !== undefined ? memoryAfter - memoryBefore : undefined;

        return {
            name,
            dataPoints: numPoints,
            features: numFeatures,
            clusters: numClusters,
            totalTimeMs,
            initTimeMs: result.timing.initializationMs,
            refineTimeMs: result.timing.reclusteringMs,
            memoryUsedMB,
            silhouetteScore: result.silhouetteScore,
            inertia: result.inertia,
            converged: result.converged,
            iterations: result.iterations,
            clusterSizes: result.clusterSizes,
        };
    } catch (error) {
        const totalTimeMs = performance.now() - startTime;
        return {
            name,
            dataPoints: numPoints,
            features: numFeatures,
            clusters: numClusters,
            totalTimeMs,
            silhouetteScore: 0,
            inertia: 0,
            converged: false,
            iterations: 0,
            clusterSizes: [],
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

/**
 * Run comprehensive benchmark suite
 */
export async function runBenchmarkSuite(): Promise<BenchmarkResult[]> {
    const results: BenchmarkResult[] = [];

    console.log('Starting k-means benchmark suite...\n');

    // Test configurations
    const configs = [
        { points: 1000, features: 2, clusters: 3, name: 'Small (1K points, 2D)' },
        { points: 10000, features: 2, clusters: 3, name: 'Medium (10K points, 2D)' },
        { points: 50000, features: 2, clusters: 5, name: 'Large (50K points, 2D)' },
        { points: 100000, features: 2, clusters: 5, name: 'Very Large (100K points, 2D)' },
        { points: 10000, features: 10, clusters: 5, name: 'Medium (10K points, 10D)' },
        { points: 50000, features: 10, clusters: 5, name: 'Large (50K points, 10D)' },
    ];

    for (const config of configs) {
        console.log(`\nTesting: ${config.name}`);
        console.log(`Points: ${config.points}, Features: ${config.features}, Clusters: ${config.clusters}`);

        // For small datasets, test standard k-means
        if (config.points <= 10000) {
            console.log('  Running standard k-means...');
            const stdResult = await benchmarkStandardKMeans(config.points, config.features, config.clusters);
            results.push(stdResult);
            console.log(`    Time: ${stdResult.totalTimeMs.toFixed(2)}ms`);
            if (stdResult.memoryUsedMB) {
                console.log(`    Memory: ${stdResult.memoryUsedMB.toFixed(2)}MB`);
            }
            if (stdResult.error) {
                console.log(`    Error: ${stdResult.error}`);
            }
        }

        // Test scalable k-means
        console.log('  Running scalable k-means...');
        const scalableResult = await benchmarkScalableKMeans(config.points, config.features, config.clusters);
        results.push(scalableResult);
        console.log(`    Time: ${scalableResult.totalTimeMs.toFixed(2)}ms`);
        if (scalableResult.memoryUsedMB) {
            console.log(`    Memory: ${scalableResult.memoryUsedMB.toFixed(2)}MB`);
        }
        if (scalableResult.error) {
            console.log(`    Error: ${scalableResult.error}`);
        }
    }

    console.log('\n=== Benchmark Complete ===\n');
    return results;
}

/**
 * Format benchmark results as a table
 */
export function formatBenchmarkResults(results: BenchmarkResult[]): string {
    let output = '\n=== K-Means Benchmark Results ===\n\n';

    output += '| Implementation | Data Points | Features | Clusters | Time (ms) | Memory (MB) | Silhouette | Error |\n';
    output += '|----------------|-------------|----------|----------|-----------|-------------|------------|-------|\n';

    for (const result of results) {
        const time = result.totalTimeMs.toFixed(2);
        const memory = result.memoryUsedMB?.toFixed(2) ?? 'N/A';
        const silhouette = result.silhouetteScore.toFixed(3);
        const error = result.error ? 'ERROR' : 'OK';

        output += `| ${result.name.padEnd(14)} | ${result.dataPoints.toString().padStart(11)} | ${result.features.toString().padStart(8)} | ${result.clusters.toString().padStart(8)} | ${time.padStart(9)} | ${memory.padStart(11)} | ${silhouette.padStart(10)} | ${error.padEnd(5)} |\n`;
    }

    return output;
}
