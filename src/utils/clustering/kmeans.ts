import type { ClusterResult } from '../../types/clustering';
import { robustScaleWithInverse } from './robustScaler';

export interface KMeansOptions {
    numClusters: number; // Number of clusters
    maxIterations?: number; // Maximum number of iterations (default: 100)
    tolerance?: number; // Convergence threshold (default: 1e-6)
    initMethod?: 'random' | 'kmeans++'; // Initialization method (default: 'kmeans++')
    featureNames?: string[]; // Feature names
    nInit?: number; // Number of initialization attempts (default: 3)
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
        nInit = 3,
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

    // Step 2: Run clustering nInit times and select best result
    const initializationStartTime = performance.now();
    let bestResult: ClusterResult | null = null;
    let bestInertia = Infinity;

    for (let init = 0; init < nInit; init += 1) {
        const result = kmeansCore(scaledData, {
            numClusters,
            maxIterations,
            tolerance,
            initMethod,
            featureNames: names,
        });

        if (result.inertia < bestInertia) {
            bestInertia = result.inertia;
            bestResult = result;
        }
    }

    if (!bestResult) {
        throw new ClusteringError('Failed to obtain valid clustering result');
    }

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

    // Step 4: Re-clustering (nInit=1)
    const reclusteringStartTime = performance.now();
    let finalResult: ClusterResult;

    if (trimmedData.length >= numClusters) {
        finalResult = kmeansCore(trimmedData, {
            numClusters,
            maxIterations,
            tolerance,
            initMethod,
            featureNames: names,
        });

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
        finalResult.silhouetteScore = computeSilhouetteScore(scaledData, finalLabels, numClusters);
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

    // Step 6: Enforce minimum cluster size (default: 3 points)
    const minClusterSize = 3;
    if (finalResult.clusterSizes.some(size => size < minClusterSize && size > 0)) {
        mergeSingletonClusters(finalResult, scaledData, numClusters, numFeatures, minClusterSize);
    }

    return finalResult;
}

/**
 * Core k-means algorithm without scaling or trimming
 */
function kmeansCore(
    dataMatrix: number[][],
    options: {
        numClusters: number;
        maxIterations: number;
        tolerance: number;
        initMethod: 'random' | 'kmeans++';
        featureNames: string[];
    }
): ClusterResult {
    const { numClusters, maxIterations, tolerance, initMethod, featureNames } = options;

    const numSamples = dataMatrix.length;
    const numFeatures = dataMatrix[0].length;

    // Initialize centroids
    let centroids =
        initMethod === 'kmeans++'
            ? initializeKMeansPlusPlus(dataMatrix, numClusters)
            : initializeRandom(dataMatrix, numClusters);

    const labels = new Array<number>(numSamples).fill(0);
    let converged = false;
    let iterations = 0;

    // Main k-means loop
    for (iterations = 0; iterations < maxIterations; iterations += 1) {
        // Assignment step: assign each point to nearest centroid
        for (let i = 0; i < numSamples; i += 1) {
            let minDist = Infinity;
            let minIdx = 0;
            for (let j = 0; j < numClusters; j += 1) {
                const dist = euclideanDistance(dataMatrix[i], centroids[j]);
                if (dist < minDist) {
                    minDist = dist;
                    minIdx = j;
                }
            }
            labels[i] = minIdx;
        }

        // Update step: recompute centroids
        const newCentroids = computeCentroids(dataMatrix, labels, numClusters, numFeatures);

        // Check for empty clusters
        for (let j = 0; j < numClusters; j += 1) {
            if (newCentroids[j].every(val => !Number.isFinite(val))) {
                // Reinitialize empty cluster with a random point
                const randomIdx = Math.floor(Math.random() * numSamples);
                newCentroids[j] = dataMatrix[randomIdx].slice();
            }
        }

        // Check convergence
        const maxCentroidShift = computeMaxCentroidShift(centroids, newCentroids);
        centroids = newCentroids;

        if (maxCentroidShift < tolerance) {
            converged = true;
            break;
        }
    }

    // Compute inertia (within-cluster sum of squares)
    const inertia = computeInertia(dataMatrix, labels, centroids);

    // Compute silhouette score
    const silhouetteScore = computeSilhouetteScore(dataMatrix, labels, numClusters);

    // Compute cluster sizes
    const clusterSizes = new Array<number>(numClusters).fill(0);
    for (const label of labels) {
        clusterSizes[label] += 1;
    }

    return {
        k: numClusters,
        n: numSamples,
        p: numFeatures,
        labels,
        centroids,
        inertia,
        iterations: iterations + 1,
        converged,
        silhouetteScore,
        clusterSizes,
        featureNames,
        timing: {
            initializationMs: 0,
            outlierRemovalMs: 0,
            reclusteringMs: 0,
            totalMs: 0,
        },
    };
}

/**
 * Initialize centroids using k-means++ algorithm for better initialization
 */
function initializeKMeansPlusPlus(dataMatrix: number[][], numClusters: number): number[][] {
    const numSamples = dataMatrix.length;
    const centroids: number[][] = [];

    // Choose first centroid randomly
    const firstIdx = Math.floor(Math.random() * numSamples);
    centroids.push(dataMatrix[firstIdx].slice());

    // Choose remaining centroids
    for (let i = 1; i < numClusters; i += 1) {
        const distances = new Array<number>(numSamples);

        // Compute distance to nearest centroid for each point
        for (let j = 0; j < numSamples; j += 1) {
            let minDist = Infinity;
            for (const centroid of centroids) {
                const dist = euclideanDistanceSquared(dataMatrix[j], centroid);
                if (dist < minDist) {
                    minDist = dist;
                }
            }
            distances[j] = minDist;
        }

        // Choose next centroid with probability proportional to distance squared
        const totalDist = distances.reduce((acc, d) => acc + d, 0);
        if (totalDist === 0) {
            // All remaining points are duplicates, choose randomly
            const randomIdx = Math.floor(Math.random() * numSamples);
            centroids.push(dataMatrix[randomIdx].slice());
        } else {
            let random = Math.random() * totalDist;
            let nextIdx = 0;
            for (let j = 0; j < numSamples; j += 1) {
                random -= distances[j];
                if (random <= 0) {
                    nextIdx = j;
                    break;
                }
            }
            centroids.push(dataMatrix[nextIdx].slice());
        }
    }

    return centroids;
}

/**
 * Initialize centroids randomly
 */
function initializeRandom(dataMatrix: number[][], numClusters: number): number[][] {
    const numSamples = dataMatrix.length;
    const indices = new Set<number>();

    // Select numClusters unique random indices
    while (indices.size < numClusters) {
        indices.add(Math.floor(Math.random() * numSamples));
    }

    return Array.from(indices).map(idx => dataMatrix[idx].slice());
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
 * Compute centroids from current assignments
 */
function computeCentroids(
    dataMatrix: number[][],
    labels: number[],
    numClusters: number,
    numFeatures: number
): number[][] {
    const centroids = Array.from({ length: numClusters }, () => new Array<number>(numFeatures).fill(0));
    const counts = new Array<number>(numClusters).fill(0);

    for (let i = 0; i < dataMatrix.length; i += 1) {
        const label = labels[i];
        counts[label] += 1;
        for (let j = 0; j < numFeatures; j += 1) {
            centroids[label][j] += dataMatrix[i][j];
        }
    }

    for (let i = 0; i < numClusters; i += 1) {
        if (counts[i] > 0) {
            for (let j = 0; j < numFeatures; j += 1) {
                centroids[i][j] /= counts[i];
            }
        } else {
            // Empty cluster - will be handled by caller
            centroids[i].fill(Number.NaN);
        }
    }

    return centroids;
}

/**
 * Compute maximum centroid shift between iterations
 */
function computeMaxCentroidShift(oldCentroids: number[][], newCentroids: number[][]): number {
    let maxShift = 0;
    for (let i = 0; i < oldCentroids.length; i += 1) {
        const shift = euclideanDistance(oldCentroids[i], newCentroids[i]);
        if (shift > maxShift) {
            maxShift = shift;
        }
    }
    return maxShift;
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

/**
 * Merge small clusters into nearest larger clusters
 * @param result - Cluster result to modify in-place
 * @param dataMatrix - Scaled data matrix
 * @param numClusters - Number of clusters
 * @param numFeatures - Number of features
 * @param minClusterSize - Minimum cluster size threshold
 */
function mergeSingletonClusters(
    result: ClusterResult,
    dataMatrix: number[][],
    numClusters: number,
    numFeatures: number,
    minClusterSize: number
): void {
    const { labels, centroids } = result;
    const numSamples = labels.length;

    // Identify clusters that are too small
    const smallClusters = new Set<number>();
    for (let clusterIdx = 0; clusterIdx < numClusters; clusterIdx += 1) {
        if (result.clusterSizes[clusterIdx] < minClusterSize && result.clusterSizes[clusterIdx] > 0) {
            smallClusters.add(clusterIdx);
        }
    }

    if (smallClusters.size === 0) {
        return; // No small clusters to merge
    }

    // Reassign points from small clusters to nearest large cluster
    for (let i = 0; i < numSamples; i += 1) {
        const currentCluster = labels[i];

        if (smallClusters.has(currentCluster)) {
            // Find nearest cluster that is large enough
            let nearestCluster = currentCluster;
            let minDist = Infinity;

            for (let clusterIdx = 0; clusterIdx < numClusters; clusterIdx += 1) {
                // Skip small clusters and current cluster
                if (smallClusters.has(clusterIdx)) {
                    continue;
                }

                const dist = euclideanDistance(dataMatrix[i], centroids[clusterIdx]);
                if (dist < minDist) {
                    minDist = dist;
                    nearestCluster = clusterIdx;
                }
            }

            // Reassign to nearest large cluster
            labels[i] = nearestCluster;
        }
    }

    // Recompute cluster sizes
    const newClusterSizes = new Array<number>(numClusters).fill(0);
    for (const label of labels) {
        newClusterSizes[label] += 1;
    }
    result.clusterSizes = newClusterSizes;

    // Recompute centroids for affected clusters
    result.centroids = computeCentroids(dataMatrix, labels, numClusters, numFeatures);

    // Recompute inertia and silhouette score
    result.inertia = computeInertia(dataMatrix, labels, result.centroids);
    result.silhouetteScore = computeSilhouetteScore(dataMatrix, labels, numClusters);
}

/**
 * Compute silhouette score for clustering quality assessment
 */
function computeSilhouetteScore(dataMatrix: number[][], labels: number[], numClusters: number): number {
    const numSamples = dataMatrix.length;

    // Compute pairwise distances
    const distances = Array.from({ length: numSamples }, () => new Array<number>(numSamples).fill(0));
    for (let i = 0; i < numSamples; i += 1) {
        for (let j = i + 1; j < numSamples; j += 1) {
            const dist = euclideanDistance(dataMatrix[i], dataMatrix[j]);
            distances[i][j] = dist;
            distances[j][i] = dist;
        }
    }

    let totalScore = 0;
    let validPoints = 0;

    for (let i = 0; i < numSamples; i += 1) {
        const ownCluster = labels[i];

        // Compute a(i): mean distance to points in same cluster
        const sameClusterIndices = labels
            .map((label, idx) => (label === ownCluster && idx !== i ? idx : -1))
            .filter(idx => idx !== -1);

        if (sameClusterIndices.length === 0) {
            // Singleton cluster - silhouette is 0
            continue;
        }

        const avgIntraClusterDist =
            sameClusterIndices.reduce((sum, idx) => sum + distances[i][idx], 0) / sameClusterIndices.length;

        // Compute b(i): mean distance to points in nearest other cluster
        let minAvgInterClusterDist = Infinity;
        for (let otherCluster = 0; otherCluster < numClusters; otherCluster += 1) {
            if (otherCluster === ownCluster) continue;

            const otherClusterIndices = labels
                .map((label, idx) => (label === otherCluster ? idx : -1))
                .filter(idx => idx !== -1);

            if (otherClusterIndices.length === 0) continue;

            const avgInterClusterDist =
                otherClusterIndices.reduce((sum, idx) => sum + distances[i][idx], 0) / otherClusterIndices.length;
            if (avgInterClusterDist < minAvgInterClusterDist) {
                minAvgInterClusterDist = avgInterClusterDist;
            }
        }

        if (!Number.isFinite(minAvgInterClusterDist)) {
            continue;
        }

        // Silhouette for point i
        const silhouette =
            (minAvgInterClusterDist - avgIntraClusterDist) / Math.max(avgIntraClusterDist, minAvgInterClusterDist);
        totalScore += silhouette;
        validPoints += 1;
    }

    return validPoints > 0 ? totalScore / validPoints : 0;
}
