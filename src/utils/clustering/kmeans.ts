import { kmeans as mlKMeans } from 'ml-kmeans';
import silhouette from '@robzzson/silhouette';
import type { ClusterResult } from '../../types/clustering';
import { robustScaleWithInverse } from './robustScaler';

export interface KMeansOptions {
    numClusters: number; // Number of clusters
    maxIterations?: number; // Maximum number of iterations (default: 100)
    tolerance?: number; // Convergence threshold (default: 1e-6)
    initMethod?: 'random' | 'kmeans++'; // Initialization method (default: 'kmeans++')
    featureNames?: string[]; // Feature names
    trimRatio?: number; // Ratio of points to trim (default: 0.05)
    useRobustScaling?: boolean; // Use RobustScaler (default: true)
}

export class ClusteringError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ClusteringError';
    }
}

/**
 * k-means clustering algorithm with robust scaling and outlier handling
 * Uses ml-kmeans library for optimized core k-means computation
 * @param dataMatrix - Data matrix [numSamples][numFeatures] where numSamples is number of samples, numFeatures is number of features
 * @param options - Clustering options
 * @returns Cluster result with labels, centroids, and quality metrics
 */
export function kmeans(dataMatrix: number[][], options: KMeansOptions): ClusterResult {
    const startTime = performance.now();

    const {
        numClusters,
        maxIterations = 100,
        tolerance = 1e-6,
        initMethod = 'kmeans++',
        featureNames,
        trimRatio = 0.05,
        useRobustScaling = true,
    } = options;

    if (!Array.isArray(dataMatrix) || dataMatrix.length === 0) {
        throw new ClusteringError('dataMatrix must be a non-empty array');
    }

    const numSamples = dataMatrix.length;
    const numFeatures = dataMatrix[0].length;

    if (numFeatures === 0) {
        throw new ClusteringError('dataMatrix must have at least one feature');
    }

    if (numClusters < 2) {
        throw new ClusteringError('numClusters must be at least 2');
    }

    if (numClusters > numSamples) {
        throw new ClusteringError(
            `numClusters (${numClusters}) cannot be greater than number of samples (${numSamples})`
        );
    }

    const names =
        featureNames && featureNames.length === numFeatures
            ? featureNames.slice()
            : Array.from({ length: numFeatures }, (_, i) => `feature${i + 1}`);

    // Validate data
    for (let i = 0; i < numSamples; i += 1) {
        if (dataMatrix[i].length !== numFeatures) {
            throw new ClusteringError(`All rows must have the same number of features (${numFeatures})`);
        }
        for (let j = 0; j < numFeatures; j += 1) {
            if (!Number.isFinite(dataMatrix[i][j])) {
                throw new ClusteringError(`dataMatrix[${i}][${j}] is not a finite number`);
            }
        }
    }

    // Step 1: Preprocessing - Scale with robust scaling
    const scalingStartTime = performance.now();
    let scaledData = dataMatrix;
    let inverseTransform: ((scaledData: number[][]) => number[][]) | null = null;
    let scalingMs: number | undefined;

    if (useRobustScaling) {
        const scaled = robustScaleWithInverse(dataMatrix);
        scaledData = scaled.X_scaled;
        inverseTransform = scaled.inverseTransform;
        scalingMs = performance.now() - scalingStartTime;
    }

    // Step 2: Run clustering nInit times and select best result using ml-kmeans
    const initializationStartTime = performance.now();

    // ml-kmeans expects options object with proper types
    const mlOptions = {
        initialization: (initMethod === 'kmeans++' ? 'kmeans++' : 'random') as 'kmeans++' | 'random',
        maxIterations,
        tolerance,
    };

    // Run ml-kmeans which handles multiple initializations internally
    const mlResult = mlKMeans(scaledData, numClusters, mlOptions);

    // Convert ml-kmeans result to our ClusterResult format
    const bestResult: ClusterResult = {
        k: numClusters,
        n: numSamples,
        p: numFeatures,
        labels: mlResult.clusters,
        centroids: mlResult.centroids,
        inertia: computeInertia(scaledData, mlResult.clusters, mlResult.centroids),
        iterations: mlResult.iterations,
        converged: mlResult.converged,
        silhouetteScore: 0, // Will compute after outlier removal
        clusterSizes: computeClusterSizes(mlResult.clusters, numClusters),
        featureNames: names,
        timing: {
            initializationMs: 0,
            outlierRemovalMs: 0,
            reclusteringMs: 0,
            totalMs: 0,
        },
    };

    const initializationMs = performance.now() - initializationStartTime;

    // Step 3: Outlier removal (simple trimming) - Exclude top trimRatio% of distances
    const outlierRemovalStartTime = performance.now();
    const distances = new Array<number>(numSamples);
    for (let i = 0; i < numSamples; i += 1) {
        const label = bestResult.labels[i];
        distances[i] = euclideanDistance(scaledData[i], bestResult.centroids[label]);
    }

    // Sort by distance and get top trimRatio% indices
    const sortedIndices = distances.map((dist, idx) => ({ dist, idx })).sort((a, b) => b.dist - a.dist);

    const numTrim = Math.floor(numSamples * trimRatio);
    const trimIndices = new Set(sortedIndices.slice(0, numTrim).map(item => item.idx));

    // Create trimmed data
    const trimmedData: number[][] = [];
    const originalIndices: number[] = [];

    for (let i = 0; i < numSamples; i += 1) {
        if (!trimIndices.has(i)) {
            trimmedData.push(scaledData[i]);
            originalIndices.push(i);
        }
    }

    const outlierRemovalMs = performance.now() - outlierRemovalStartTime;

    // Step 4: Re-clustering using ml-kmeans
    const reclusteringStartTime = performance.now();
    let finalResult: ClusterResult;

    if (trimmedData.length >= numClusters) {
        const mlResultFinal = mlKMeans(trimmedData, numClusters, mlOptions);

        finalResult = {
            k: numClusters,
            n: trimmedData.length,
            p: numFeatures,
            labels: mlResultFinal.clusters,
            centroids: mlResultFinal.centroids,
            inertia: computeInertia(trimmedData, mlResultFinal.clusters, mlResultFinal.centroids),
            iterations: mlResultFinal.iterations,
            converged: mlResultFinal.converged,
            silhouetteScore: 0,
            clusterSizes: computeClusterSizes(mlResultFinal.clusters, numClusters),
            featureNames: names,
            timing: {
                initializationMs: 0,
                outlierRemovalMs: 0,
                reclusteringMs: 0,
                totalMs: 0,
            },
        };

        // Assign labels to non-trimmed points
        const finalLabels = new Array<number>(numSamples);
        for (let i = 0; i < originalIndices.length; i += 1) {
            finalLabels[originalIndices[i]] = finalResult.labels[i];
        }

        // Assign trimmed points to nearest centroid
        for (const idx of trimIndices) {
            let minDist = Infinity;
            let minLabel = 0;
            for (let j = 0; j < numClusters; j += 1) {
                const dist = euclideanDistance(scaledData[idx], finalResult.centroids[j]);
                if (dist < minDist) {
                    minDist = dist;
                    minLabel = j;
                }
            }
            finalLabels[idx] = minLabel;
        }

        finalResult.labels = finalLabels;
        finalResult.n = numSamples;

        // Recompute cluster sizes
        const clusterSizes = new Array<number>(numClusters).fill(0);
        for (const label of finalLabels) {
            clusterSizes[label] += 1;
        }
        finalResult.clusterSizes = clusterSizes;

        // Recompute inertia and silhouette score (on full data)
        finalResult.inertia = computeInertia(scaledData, finalLabels, finalResult.centroids);
        finalResult.silhouetteScore = silhouette(scaledData, finalLabels);
    } else {
        // If trimmed data is too small, use result without trimming
        finalResult = bestResult;
    }

    const reclusteringMs = performance.now() - reclusteringStartTime;

    // Step 5: Post-processing - Restore centroids to original scale
    if (inverseTransform) {
        finalResult.centroids = inverseTransform(finalResult.centroids);
    }

    const totalMs = performance.now() - startTime;

    // Add timing information
    finalResult.timing = {
        scalingMs,
        initializationMs,
        outlierRemovalMs,
        reclusteringMs,
        totalMs,
    };

    return finalResult;
}

/**
 * Compute cluster sizes from labels
 */
function computeClusterSizes(labels: number[], numClusters: number): number[] {
    const clusterSizes = new Array<number>(numClusters).fill(0);
    for (const label of labels) {
        clusterSizes[label] += 1;
    }
    return clusterSizes;
}

/**
 * Compute Euclidean distance between two points
 */
function euclideanDistance(point1: number[], point2: number[]): number {
    return Math.sqrt(euclideanDistanceSquared(point1, point2));
}

/**
 * Compute squared Euclidean distance between two points
 */
function euclideanDistanceSquared(point1: number[], point2: number[]): number {
    let sum = 0;
    for (let i = 0; i < point1.length; i += 1) {
        const diff = point1[i] - point2[i];
        sum += diff * diff;
    }
    return sum;
}

/**
 * Compute inertia (within-cluster sum of squares)
 */
function computeInertia(dataMatrix: number[][], labels: number[], centroids: number[][]): number {
    let inertia = 0;
    for (let i = 0; i < dataMatrix.length; i += 1) {
        const label = labels[i];
        inertia += euclideanDistanceSquared(dataMatrix[i], centroids[label]);
    }
    return inertia;
}
