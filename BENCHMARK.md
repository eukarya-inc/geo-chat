# K-means Clustering Benchmark

This document describes how to run performance benchmarks for k-means clustering implementations.

## Overview

The benchmark suite compares two k-means implementations:

1. **Standard k-means** - Direct implementation using ml-kmeans library
2. **Scalable k-means** - Optimized implementation using sample training + parallel assignment

## Running Benchmarks

### Quick Start

Run the full benchmark suite:

```bash
npm run test:benchmark
```

**Note**: Benchmarks run in a separate test project and are excluded from:

- `npm test` (unit tests)
- `npm run test:browser` (browser tests)
- `npm run test:full` (all regular tests)

This ensures benchmarks don't slow down normal test runs.

The benchmark will:

- Test datasets from 1K to 100K points
- Test 2D and 10D feature spaces
- Compare standard vs scalable implementations
- Compare Worker vs non-Worker performance
- Display timing, memory usage, and clustering quality metrics

### Individual Tests

Run specific benchmark categories:

```bash
# Small datasets (1K points)
npm run test:benchmark -- -t "Small datasets"

# Medium datasets (10K points)
npm run test:benchmark -- -t "Medium datasets"

# Large datasets (50K points)
npm run test:benchmark -- -t "Large datasets"

# Very large datasets (100K points)
npm run test:benchmark -- -t "Very large datasets"

# High-dimensional data
npm run test:benchmark -- -t "High-dimensional"

# Full comparison table
npm run test:benchmark -- -t "Comprehensive comparison"
```

## Benchmark Results

The benchmarks measure:

- **Time (ms)**: Total execution time
- **Memory (MB)**: Heap memory usage (when available)
- **Silhouette Score**: Clustering quality (-1 to 1, higher is better)
- **Inertia**: Within-cluster sum of squares (lower is better)
- **Iterations**: Number of refinement iterations
- **Convergence**: Whether the algorithm converged

## Test Configurations

| Dataset    | Points  | Features | Clusters | Implementations Tested        |
| ---------- | ------- | -------- | -------- | ----------------------------- |
| Small      | 1,000   | 2        | 3        | Standard, Scalable (±Workers) |
| Medium     | 10,000  | 2        | 3        | Standard, Scalable (±Workers) |
| Large      | 50,000  | 2        | 5        | Scalable (±Workers)           |
| Very Large | 100,000 | 2        | 5        | Scalable (±Workers)           |
| Medium 10D | 10,000  | 10       | 5        | Scalable (+Workers)           |
| Large 10D  | 50,000  | 10       | 5        | Scalable (+Workers)           |

## Expected Performance

### Standard k-means

- **Best for**: Small datasets (<10K points)
- **Pros**: Simple, accurate
- **Cons**: Slow on large datasets, blocks UI

### Scalable k-means (no Workers)

- **Best for**: Medium to large datasets (10K-100K points)
- **Pros**: Fast, memory efficient
- **Cons**: Still blocks UI during computation

### Scalable k-means (with Workers)

- **Best for**: Large datasets (50K+ points)
- **Pros**: Fast, non-blocking UI, memory efficient
- **Cons**: Slight overhead for small datasets

## Implementation Details

### Scalable K-means Strategy

1. **Sample Training** (10% of data, max 10K points)
    - Train k-means on representative sample
    - Use kmeans++ initialization
    - Limited to 20 iterations

2. **Parallel Assignment**
    - Split data into 4K-point chunks
    - Assign points to learned centroids in parallel
    - Use Web Workers for parallel processing

3. **Refinement** (2 iterations)
    - Recompute centroids from full data
    - Reassign all points
    - Early stop if converged

### Memory Optimization

- Uses `Uint16Array` for cluster labels (2 bytes per point)
- Transferable objects for zero-copy Worker communication
- Sample-based Silhouette Score (max 5K points)

## Browser Mode

Benchmarks run in Vitest browser mode (WebKit/Playwright) to:

- Access Web Workers
- Measure actual browser memory usage
- Test real-world performance

## Troubleshooting

### Benchmark fails with timeout

Increase timeout in `benchmark.browser.test.ts`:

```typescript
const BENCHMARK_TIMEOUT = 240000; // 4 minutes
```

### Web Workers not working

Check browser support:

- Workers require secure context (https or localhost)
- SharedArrayBuffer requires specific headers

### Memory measurements unavailable

Memory API (`performance.memory`) is:

- Only available in Chrome/Chromium
- Disabled in some browsers for privacy
- Not available in Firefox/Safari

## Adding New Benchmarks

Add new test cases to `benchmark.browser.test.ts`:

```typescript
it(
    'should benchmark custom configuration',
    async () => {
        const result = await benchmarkScalableKMeans(
            20000, // points
            5, // features
            4, // clusters
            true // use workers
        );

        expect(result.error).toBeUndefined();
        console.log(`Time: ${result.totalTimeMs.toFixed(2)}ms`);
    },
    BENCHMARK_TIMEOUT
);
```
