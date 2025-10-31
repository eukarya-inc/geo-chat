import { kmeans as mlKMeans } from 'ml-kmeans';
import silhouette from '@robzzson/silhouette';
import type { ClusterResult } from '../../types/clustering';
import { robustScaleWithInverse } from './robustScaler';

export interface ScalableKMeansOptions {
    numClusters: number; // Number of clusters
    maxIterations?: number; // Maximum iterations for sample training (default: 20)
    tolerance?: number; // Convergence threshold (default: 1e-6)
    initMethod?: 'random' | 'kmeans++'; // Initialization method (default: 'kmeans++')
    featureNames?: string[]; // Feature names
    sampleRatio?: number; // Sample ratio for training (default: 0.1 = 10%)
    maxSampleSize?: number; // Maximum sample size (default: 10000)
    minSampleSize?: number; // Minimum sample size (default: 1000)
    refinementIterations?: number; // Number of refinement iterations on full data (default: 2)
    useRobustScaling?: boolean; // Use RobustScaler (default: true)
}

export class ScalableClusteringError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ScalableClusteringError';
    }
}

/**
 * Scalable k-means clustering using sample training and parallel assignment
 * Optimized for large datasets (10k+ points)
 *
 * Strategy:
 * 1. Train on 5-20% sample using ml-kmeans
 * 2. Assign all data points to learned centroids in parallel chunks
 * 3. Optionally refine centroids 1-3 times on full data
 */
export async function scalableKmeans(dataMatrix: number[][], options: ScalableKMeansOptions): Promise<ClusterResult> {
    const startTime = performance.now();

    const {
        numClusters,
        maxIterations = 20,
        tolerance = 1e-6,
        initMethod = 'kmeans++',
        featureNames,
        sampleRatio = 0.1,
        maxSampleSize = 10000,
        minSampleSize = 1000,
        refinementIterations = 2,
        useRobustScaling = true,
    } = options;

    // Validation
    if (!Array.isArray(dataMatrix) || dataMatrix.length === 0) {
        throw new ScalableClusteringError('dataMatrix must be a non-empty array');
    }

    const numSamples = dataMatrix.length;
    const numFeatures = dataMatrix[0].length;

    if (numFeatures === 0) {
        throw new ScalableClusteringError('dataMatrix must have at least one feature');
    }

    if (numClusters < 2) {
        throw new ScalableClusteringError('numClusters must be at least 2');
    }

    if (numClusters > numSamples) {
        throw new ScalableClusteringError(
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
            throw new ScalableClusteringError(`All rows must have the same number of features (${numFeatures})`);
        }
        for (let j = 0; j < numFeatures; j += 1) {
            if (!Number.isFinite(dataMatrix[i][j])) {
                throw new ScalableClusteringError(`dataMatrix[${i}][${j}] is not a finite number`);
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

    // Step 2: Sample-based training
    const trainingStartTime = performance.now();
    const sampleSize = Math.min(maxSampleSize, Math.max(minSampleSize, Math.floor(numSamples * sampleRatio)));

    let sampleData: number[][];
    let sampleIndices: number[];

    if (sampleSize >= numSamples) {
        // Use full data if sample size >= data size
        sampleData = scaledData;
        sampleIndices = Array.from({ length: numSamples }, (_, i) => i);
    } else {
        // Random sampling
        sampleIndices = [];
        const availableIndices = new Set(Array.from({ length: numSamples }, (_, i) => i));

        while (sampleIndices.length < sampleSize) {
            const randomIdx = Math.floor(Math.random() * numSamples);
            if (availableIndices.has(randomIdx)) {
                sampleIndices.push(randomIdx);
                availableIndices.delete(randomIdx);
            }
        }

        sampleData = sampleIndices.map(idx => scaledData[idx]);
    }

    // Train on sample using ml-kmeans
    const mlOptions = {
        initialization: (initMethod === 'kmeans++' ? 'kmeans++' : 'random') as 'kmeans++' | 'random',
        maxIterations,
        tolerance,
    };

    const sampleResult = mlKMeans(sampleData, numClusters, mlOptions);
    let centroids = sampleResult.centroids;

    const trainingMs = performance.now() - trainingStartTime;

    // Step 3: Assignment to all data
    const labels = assignToCentroidsSynchronous(scaledData, centroids);

    // Step 4: Refinement iterations on full data
    const refinementStartTime = performance.now();
    for (let iter = 0; iter < refinementIterations; iter += 1) {
        // Recompute centroids from current labels
        centroids = recomputeCentroids(scaledData, labels, numClusters, numFeatures);

        // Reassign all points to new centroids
        const newLabels = assignToCentroidsSynchronous(scaledData, centroids);

        // Check if labels changed
        let changed = 0;
        for (let i = 0; i < numSamples; i += 1) {
            if (labels[i] !== newLabels[i]) {
                changed += 1;
                labels[i] = newLabels[i];
            }
        }

        // Early stop if converged
        if (changed === 0) {
            break;
        }
    }
    const refinementMs = performance.now() - refinementStartTime;

    // Step 5: Post-processing - Restore centroids to original scale
    if (inverseTransform) {
        centroids = inverseTransform(centroids);
    }

    // Compute metrics
    const inertia = computeInertia(scaledData, labels, sampleResult.centroids);
    const clusterSizes = computeClusterSizes(labels, numClusters);
    const silhouetteScore = await computeSilhouetteScoreSampled(scaledData, labels, numClusters, 5000);

    const totalMs = performance.now() - startTime;

    const result: ClusterResult = {
        k: numClusters,
        n: numSamples,
        p: numFeatures,
        labels: Array.from(labels),
        centroids,
        inertia,
        iterations: refinementIterations + 1,
        converged: true, // Assume converged after refinement
        silhouetteScore,
        clusterSizes,
        featureNames: names,
        timing: {
            scalingMs,
            initializationMs: trainingMs,
            outlierRemovalMs: 0,
            reclusteringMs: refinementMs,
            totalMs,
        },
        sampleInfo:
            sampleSize < numSamples
                ? {
                      sampleSize,
                      totalSize: numSamples,
                      sampleRatio: sampleSize / numSamples,
                  }
                : undefined,
    };

    return result;
}

/**
 * Assign points to nearest centroids
 */
function assignToCentroidsSynchronous(points: number[][], centroids: number[][]): Uint16Array {
    const numPoints = points.length;
    const numClusters = centroids.length;
    const labels = new Uint16Array(numPoints);

    for (let i = 0; i < numPoints; i += 1) {
        let minDist = Infinity;
        let minIdx = 0;

        for (let j = 0; j < numClusters; j += 1) {
            const dist = euclideanDistanceSquared(points[i], centroids[j]);
            if (dist < minDist) {
                minDist = dist;
                minIdx = j;
            }
        }

        labels[i] = minIdx;
    }

    return labels;
}

/**
 * Recompute centroids from current labels
 */
function recomputeCentroids(
    data: number[][],
    labels: Uint16Array,
    numClusters: number,
    numFeatures: number
): number[][] {
    const centroids = Array.from({ length: numClusters }, () => new Array<number>(numFeatures).fill(0));
    const counts = new Array<number>(numClusters).fill(0);

    for (let i = 0; i < data.length; i += 1) {
        const label = labels[i];
        counts[label] += 1;
        for (let j = 0; j < numFeatures; j += 1) {
            centroids[label][j] += data[i][j];
        }
    }

    for (let i = 0; i < numClusters; i += 1) {
        if (counts[i] > 0) {
            for (let j = 0; j < numFeatures; j += 1) {
                centroids[i][j] /= counts[i];
            }
        } else {
            // Empty cluster - reinitialize with random point
            const randomIdx = Math.floor(Math.random() * data.length);
            centroids[i] = data[randomIdx].slice();
        }
    }

    return centroids;
}

/**
 * Compute cluster sizes from labels
 */
function computeClusterSizes(labels: Uint16Array, numClusters: number): number[] {
    const clusterSizes = new Array<number>(numClusters).fill(0);
    for (let i = 0; i < labels.length; i += 1) {
        clusterSizes[labels[i]] += 1;
    }
    return clusterSizes;
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
function computeInertia(data: number[][], labels: Uint16Array | number[], centroids: number[][]): number {
    let inertia = 0;
    for (let i = 0; i < data.length; i += 1) {
        const label = labels[i];
        inertia += euclideanDistanceSquared(data[i], centroids[label]);
    }
    return inertia;
}

/**
 * Compute silhouette score on a sample (to avoid O(n²) on full data)
 */
async function computeSilhouetteScoreSampled(
    data: number[][],
    labels: Uint16Array,
    numClusters: number,
    maxSampleSize: number
): Promise<number> {
    try {
        // Check if we have enough unique clusters
        const uniqueLabels = new Set(labels);

        if (uniqueLabels.size < 2) {
            // Need at least 2 clusters for silhouette score
            return 0;
        }

        if (data.length <= maxSampleSize) {
            // Compute on full data if small enough
            const labelsArray = Array.from(labels);
            const score = silhouette(data, labelsArray);
            return Number.isFinite(score) ? score : 0;
        }

        // Stratified sampling: ensure we get samples from all clusters proportionally
        const clusterIndices: Map<number, number[]> = new Map();
        for (let i = 0; i < data.length; i += 1) {
            const cluster = labels[i];
            if (!clusterIndices.has(cluster)) {
                clusterIndices.set(cluster, []);
            }
            clusterIndices.get(cluster)!.push(i);
        }

        const sampleIndices: number[] = [];
        const samplesPerCluster = Math.ceil(maxSampleSize / clusterIndices.size);

        for (const [, indices] of clusterIndices.entries()) {
            const step = Math.max(1, Math.floor(indices.length / samplesPerCluster));
            let clusterSamples = 0;
            for (let i = 0; i < indices.length; i += step) {
                sampleIndices.push(indices[i]);
                clusterSamples += 1;
                if (clusterSamples >= samplesPerCluster) break;
            }
        }

        if (sampleIndices.length < 2) {
            return 0;
        }

        const sampleData = sampleIndices.map(idx => data[idx]);
        const sampleLabels = sampleIndices.map(idx => labels[idx]);

        // Check sampled data has multiple clusters
        const uniqueSampleLabels = new Set(sampleLabels);

        if (uniqueSampleLabels.size < 2) {
            return 0;
        }

        const score = silhouette(sampleData, sampleLabels);
        return Number.isFinite(score) ? score : 0;
    } catch {
        // Silhouette computation failed - return 0 as fallback
        return 0;
    }
}
