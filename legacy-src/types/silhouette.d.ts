declare module '@robzzson/silhouette' {
    /**
     * Calculate silhouette coefficient for clustering evaluation
     * @param data - Data points in format [[x1, y1, ...], [x2, y2, ...], ...]
     * @param labels - Cluster labels for each data point
     * @returns Silhouette score between -1 and 1 (higher is better)
     */
    function silhouette(data: number[][], labels: number[]): number;
    export default silhouette;
}
