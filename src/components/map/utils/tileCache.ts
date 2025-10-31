/**
 * Tile cache manager with pre-rendering support and mutex control
 * Uses cost-weighted LRU eviction based on rendering time and access patterns
 */

interface CacheEntry {
    data: Uint8Array;
    timestamp: number;
    renderingCost: number; // milliseconds spent rendering
    accessCount: number; // number of times accessed
    lastAccessTime: number; // timestamp of last access
}

interface RenderingPromise {
    promise: Promise<Uint8Array>;
    abortController: AbortController;
    startTime: number; // track rendering start time
}

export class TileCacheManager {
    private cache: Map<string, CacheEntry> = new Map();
    private renderingTiles: Map<string, RenderingPromise> = new Map();
    private maxCacheSize: number;
    private maxAge: number; // milliseconds

    constructor(maxCacheSize = 5000, maxAge = 5 * 60 * 1000) {
        // Default: 5000 tiles, 5 minutes
        // MVT tiles are compressed, typically 5-50KB each
        // 5000 tiles ≈ 25-250MB memory usage
        this.maxCacheSize = maxCacheSize;
        this.maxAge = maxAge;
    }

    /**
     * Get tile from cache if available and not expired
     * Updates access count and last access time for LRU tracking
     */
    get(key: string): Uint8Array | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() - entry.timestamp > this.maxAge) {
            this.cache.delete(key);
            return null;
        }

        // Update access tracking
        entry.accessCount++;
        entry.lastAccessTime = Date.now();

        // Return a fresh copy to avoid ArrayBuffer detachment issues
        // Create a new Uint8Array with a new underlying buffer
        return new Uint8Array(entry.data);
    }

    /**
     * Set tile in cache with rendering cost
     * All tiles are cached including empty tiles to avoid re-rendering
     */
    set(key: string, data: Uint8Array, renderingCost = 0): void {
        // Enforce cache size limit with cost-weighted LRU eviction
        if (this.cache.size >= this.maxCacheSize) {
            this.evictLeastValuable();
        }

        const now = Date.now();
        this.cache.set(key, {
            data: new Uint8Array(data), // Store a copy with new buffer
            timestamp: now,
            renderingCost,
            accessCount: 1,
            lastAccessTime: now,
        });
    }

    /**
     * Evict the least valuable tile based on cost/benefit ratio
     * Formula: value = (accessCount / age) / renderingCost
     * Lower value = more likely to evict
     */
    private evictLeastValuable(): void {
        if (this.cache.size === 0) return;

        const now = Date.now();
        let minValue = Infinity;
        let keyToEvict: string | null = null;

        for (const [key, entry] of this.cache.entries()) {
            // Age in seconds (avoid division by zero)
            const age = Math.max(1, (now - entry.lastAccessTime) / 1000);

            // Access frequency (accesses per second of age)
            const frequency = entry.accessCount / age;

            // Rendering cost in seconds (avoid division by zero)
            const cost = Math.max(0.001, entry.renderingCost / 1000);

            // Value = benefit (frequency) / cost
            // Higher value = keep, lower value = evict
            const value = frequency / cost;

            if (value < minValue) {
                minValue = value;
                keyToEvict = key;
            }
        }

        if (keyToEvict) {
            this.cache.delete(keyToEvict);
        }
    }

    /**
     * Check if tile is currently being rendered
     */
    isRendering(key: string): boolean {
        return this.renderingTiles.has(key);
    }

    /**
     * Get or create a rendering promise for a tile (mutex control)
     * If the tile is already being rendered, returns the existing promise
     * Otherwise, starts a new rendering operation and tracks rendering time
     */
    async getOrRender(key: string, renderFn: (abortSignal: AbortSignal) => Promise<Uint8Array>): Promise<Uint8Array> {
        // Check cache first
        const cached = this.get(key);
        if (cached) {
            return cached;
        }

        // Check if already rendering
        const existing = this.renderingTiles.get(key);
        if (existing) {
            // Wait for the existing render to complete
            try {
                return await existing.promise;
            } catch (error) {
                // If the existing render failed, remove it and try again
                this.renderingTiles.delete(key);
                throw error;
            }
        }

        // Start new rendering
        const abortController = new AbortController();
        const startTime = Date.now();
        const promise = (async () => {
            try {
                const data = await renderFn(abortController.signal);
                // Calculate rendering cost
                const renderingCost = Date.now() - startTime;
                // Cache the result with cost
                this.set(key, data, renderingCost);
                return data;
            } catch (error) {
                // Don't cache aborted renders - they should be retried
                if (error instanceof Error && error.message === 'Aborted') {
                    throw error;
                }
                // For other errors, cache empty tile to avoid repeated failures
                const renderingCost = Date.now() - startTime;
                this.set(key, new Uint8Array(), renderingCost);
                throw error;
            } finally {
                // Clean up rendering entry
                this.renderingTiles.delete(key);
            }
        })();

        this.renderingTiles.set(key, { promise, abortController, startTime });

        return promise;
    }

    /**
     * Pre-render tiles in background
     * Returns immediately, rendering happens asynchronously
     * Tracks rendering time for each tile
     */
    preRender(keys: string[], renderFn: (key: string, abortSignal: AbortSignal) => Promise<Uint8Array>): void {
        for (const key of keys) {
            // Skip if already cached or rendering
            if (this.cache.has(key) || this.renderingTiles.has(key)) {
                continue;
            }

            // Start background rendering
            const abortController = new AbortController();
            const startTime = Date.now();
            const promise = (async () => {
                try {
                    const data = await renderFn(key, abortController.signal);
                    // Calculate rendering cost
                    const renderingCost = Date.now() - startTime;
                    // Cache with cost
                    this.set(key, data, renderingCost);
                    return data;
                } catch (error) {
                    // Don't cache aborted pre-renders
                    if (error instanceof Error && error.message === 'Aborted') {
                        return new Uint8Array();
                    }
                    // Silently ignore other pre-rendering errors
                    return new Uint8Array();
                } finally {
                    this.renderingTiles.delete(key);
                }
            })();

            this.renderingTiles.set(key, { promise, abortController, startTime });
        }
    }

    /**
     * Abort all in-flight rendering operations
     */
    abortAll(): void {
        for (const { abortController } of this.renderingTiles.values()) {
            abortController.abort();
        }
        this.renderingTiles.clear();
    }

    /**
     * Clear all cached tiles
     */
    clear(): void {
        this.abortAll();
        this.cache.clear();
    }

    /**
     * Get cache statistics including cost metrics
     */
    getStats(): {
        cacheSize: number;
        renderingCount: number;
        maxCacheSize: number;
        avgRenderingCost: number;
        totalAccessCount: number;
    } {
        let totalCost = 0;
        let totalAccess = 0;
        for (const entry of this.cache.values()) {
            totalCost += entry.renderingCost;
            totalAccess += entry.accessCount;
        }

        return {
            cacheSize: this.cache.size,
            renderingCount: this.renderingTiles.size,
            maxCacheSize: this.maxCacheSize,
            avgRenderingCost: this.cache.size > 0 ? totalCost / this.cache.size : 0,
            totalAccessCount: totalAccess,
        };
    }

    /**
     * Get list of currently rendering tiles with timing info
     */
    getRenderingTiles(): Array<{ key: string; elapsedTime: number }> {
        const now = Date.now();
        const result: Array<{ key: string; elapsedTime: number }> = [];

        for (const [key, entry] of this.renderingTiles.entries()) {
            result.push({
                key,
                elapsedTime: now - entry.startTime,
            });
        }

        // Sort by elapsed time (longest first)
        return result.sort((a, b) => b.elapsedTime - a.elapsedTime);
    }
}
