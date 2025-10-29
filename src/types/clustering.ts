export interface TimingInfo {
    scalingMs?: number; // Time spent on robust scaling (milliseconds)
    initializationMs: number; // Time spent on multiple initializations (milliseconds)
    outlierRemovalMs: number; // Time spent on outlier detection and trimming (milliseconds)
    reclusteringMs: number; // Time spent on re-clustering with trimmed data (milliseconds)
    totalMs: number; // Total execution time (milliseconds)
}

// Clustering metrics that AI uses for decision making
export interface ClusterMetrics {
    numClusters: number; // Number of clusters
    numSamples: number; // Number of data points
    numFeatures: number; // Number of features (dimensions)
    converged: boolean; // Whether the algorithm converged
    silhouetteScore: number; // Silhouette score (-1 to 1) - quality metric
    inertia: number; // Within-cluster sum of squares (WCSS)
    clusterSizes: number[]; // Size of each cluster
    featureNames: string[]; // Feature names
}

// Diagnostic information for debugging and performance analysis
// Only minimal data is passed to AI to prevent token overflow
export interface ClusterDiagnostics {
    timing: TimingInfo; // Execution time breakdown
    iterations: number; // Number of iterations executed
    // labels array is NOT included - too large for AI context (would cause token overflow)
    centroids: number[][]; // Centroid coordinates for each cluster [numClusters][numFeatures]
}

// Complete clustering result (for internal use)
export interface ClusterResult {
    k: number; // Number of clusters
    n: number; // Number of data points
    p: number; // Number of features (dimensions)
    labels: number[]; // Cluster label for each data point (0 to k-1)
    centroids: number[][]; // Centroid coordinates for each cluster [k][p]
    inertia: number; // Within-cluster sum of squares (WCSS)
    iterations: number; // Number of iterations executed
    converged: boolean; // Whether the algorithm converged
    silhouetteScore: number; // Silhouette score (-1 to 1)
    clusterSizes: number[]; // Size of each cluster
    featureNames: string[]; // Feature names
    timing: TimingInfo; // Execution time breakdown
}

export interface ClusterDataInfo {
    totalRows: number;
    usedRows: number;
    skippedRows: number;
}

export interface ClusterAnalysisSuccess {
    success: true;
    message: string;
    tableName: string;
    labelsTableName: string; // Name of the temporary table containing cluster labels
    featureColumns: string[];
    dataInfo: ClusterDataInfo;
    metrics: ClusterMetrics; // Clustering metrics for AI decision making
    diagnostics: ClusterDiagnostics; // Diagnostic info (not passed to AI)
    warnings?: string[];
    suggestions?: string[];
}

export interface ClusterAnalysisError {
    success: false;
    message: string;
    warnings?: string[];
}

export type ClusterAnalysisResponse = ClusterAnalysisSuccess | ClusterAnalysisError;
