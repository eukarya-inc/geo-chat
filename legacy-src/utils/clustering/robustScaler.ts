/**
 * Result of robust scaling with inverse transform function
 */
export interface RobustScaleResult {
    X_scaled: number[][];
    inverseTransform: (scaledData: number[][]) => number[][];
}

/**
 * Apply robust scaling using median and IQR (Interquartile Range)
 * Provides standardization that is less sensitive to outliers
 *
 * @param dataMatrix - Data matrix [numSamples][numFeatures]
 * @returns Scaled data and inverse transform function
 */
export function robustScaleWithInverse(dataMatrix: number[][]): RobustScaleResult {
    if (!Array.isArray(dataMatrix) || dataMatrix.length === 0) {
        throw new Error('dataMatrix must be a non-empty array');
    }

    const numSamples = dataMatrix.length;
    const numFeatures = dataMatrix[0].length;

    // Compute median and IQR for each feature
    const medians = new Array<number>(numFeatures);
    const iqrs = new Array<number>(numFeatures);

    for (let j = 0; j < numFeatures; j += 1) {
        const column = dataMatrix.map(row => row[j]).sort((a, b) => a - b);

        // Compute median
        medians[j] = computeMedian(column);

        // Compute Q1 (25th percentile) and Q3 (75th percentile)
        const q1 = computeQuantile(column, 0.25);
        const q3 = computeQuantile(column, 0.75);

        // IQR = Q3 - Q1
        iqrs[j] = q3 - q1;

        // Set IQR to 1 if it's 0 (for constant columns)
        if (iqrs[j] === 0) {
            iqrs[j] = 1;
        }
    }

    // Apply scaling
    const X_scaled = Array.from({ length: numSamples }, () => new Array<number>(numFeatures));

    for (let i = 0; i < numSamples; i += 1) {
        for (let j = 0; j < numFeatures; j += 1) {
            X_scaled[i][j] = (dataMatrix[i][j] - medians[j]) / iqrs[j];
        }
    }

    // Return scaled data and closure for inverse transform
    return {
        X_scaled,
        inverseTransform: (scaledDataInput: number[][]): number[][] => {
            const numInputSamples = scaledDataInput.length;
            const numInputFeatures = scaledDataInput[0].length;

            if (numInputFeatures !== medians.length) {
                throw new Error(`Feature count mismatch: expected ${medians.length}, got ${numInputFeatures}`);
            }

            const restoredData = Array.from({ length: numInputSamples }, () => new Array<number>(numInputFeatures));

            for (let i = 0; i < numInputSamples; i += 1) {
                for (let j = 0; j < numInputFeatures; j += 1) {
                    restoredData[i][j] = scaledDataInput[i][j] * iqrs[j] + medians[j];
                }
            }

            return restoredData;
        },
    };
}

/**
 * Compute median of a sorted array
 * @param sortedArray - Sorted array
 * @returns Median value
 */
function computeMedian(sortedArray: number[]): number {
    const length = sortedArray.length;
    if (length % 2 === 0) {
        return (sortedArray[length / 2 - 1] + sortedArray[length / 2]) / 2;
    }
    return sortedArray[Math.floor(length / 2)];
}

/**
 * Compute quantile of a sorted array
 * @param sortedArray - Sorted array
 * @param quantile - Quantile (range 0-1)
 * @returns Quantile value
 */
function computeQuantile(sortedArray: number[], quantile: number): number {
    const length = sortedArray.length;
    const index = (length - 1) * quantile;
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
        return sortedArray[lower];
    }

    return sortedArray[lower] * (1 - weight) + sortedArray[upper] * weight;
}
