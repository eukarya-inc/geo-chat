import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TileCacheManager } from './tileCache';

describe('TileCacheManager', () => {
    let cache: TileCacheManager;

    beforeEach(() => {
        cache = new TileCacheManager(3, 100); // Small cache for testing
    });

    describe('get/set', () => {
        it('should store and retrieve tiles', () => {
            const key = 'tile-1';
            const data = new Uint8Array(100).fill(1); // 100 bytes, valid size

            cache.set(key, data);
            const retrieved = cache.get(key);

            expect(retrieved).toEqual(data);
        });

        it('should return null for non-existent keys', () => {
            expect(cache.get('non-existent')).toBe(null);
        });

        it('should enforce cache size limit with LRU eviction', () => {
            cache.set('tile-1', new Uint8Array(100).fill(1));
            cache.set('tile-2', new Uint8Array(100).fill(2));
            cache.set('tile-3', new Uint8Array(100).fill(3));
            cache.set('tile-4', new Uint8Array(100).fill(4)); // Should evict based on cost/value

            const stats = cache.getStats();
            expect(stats.cacheSize).toBe(3); // Cache size limit
        });

        it('should expire old entries', async () => {
            const key = 'tile-1';
            const data = new Uint8Array(100).fill(1);

            cache.set(key, data);
            expect(cache.get(key)).not.toBe(null);

            // Wait for expiration
            await new Promise(resolve => setTimeout(resolve, 150));

            expect(cache.get(key)).toBe(null);
        });

        it('should return a copy to avoid ArrayBuffer detachment', () => {
            const key = 'tile-1';
            const data = new Uint8Array(100).fill(1);

            cache.set(key, data);
            const retrieved1 = cache.get(key);
            const retrieved2 = cache.get(key);

            expect(retrieved1).toEqual(data);
            expect(retrieved2).toEqual(data);
            expect(retrieved1).not.toBe(retrieved2); // Different instances
        });
    });

    describe('getOrRender', () => {
        it('should render tile if not cached', async () => {
            const key = 'tile-1';
            const data = new Uint8Array(100).fill(1);
            const renderFn = vi.fn(async () => data);

            const result = await cache.getOrRender(key, renderFn);

            expect(result).toEqual(data);
            expect(renderFn).toHaveBeenCalledTimes(1);
        });

        it('should return cached tile without rendering', async () => {
            const key = 'tile-1';
            const data = new Uint8Array(100).fill(1);
            const renderFn = vi.fn(async () => data);

            // First call - should render
            await cache.getOrRender(key, renderFn);

            // Second call - should use cache
            const result = await cache.getOrRender(key, renderFn);

            expect(result).toEqual(data);
            expect(renderFn).toHaveBeenCalledTimes(1); // Only called once
        });

        it('should deduplicate concurrent renders (mutex control)', async () => {
            const key = 'tile-1';
            const data = new Uint8Array(100).fill(1);
            let renderCount = 0;

            const renderFn = vi.fn(async () => {
                renderCount++;
                await new Promise(resolve => setTimeout(resolve, 50));
                return data;
            });

            // Start multiple concurrent renders
            const promises = [
                cache.getOrRender(key, renderFn),
                cache.getOrRender(key, renderFn),
                cache.getOrRender(key, renderFn),
            ];

            const results = await Promise.all(promises);

            // All should return the same data
            expect(results[0]).toEqual(data);
            expect(results[1]).toEqual(data);
            expect(results[2]).toEqual(data);

            // Render function should only be called once
            expect(renderCount).toBe(1);
        });

        it('should handle render errors', async () => {
            const key = 'tile-1';
            const error = new Error('Render failed');
            const renderFn = vi.fn(async () => {
                throw error;
            });

            await expect(cache.getOrRender(key, renderFn)).rejects.toThrow('Render failed');
        });
    });

    describe('preRender', () => {
        it('should pre-render tiles in background', async () => {
            const keys = ['tile-1', 'tile-2', 'tile-3'];
            const renderFn = vi.fn(async (key: string) => {
                await new Promise(resolve => setTimeout(resolve, 10));
                const data = new Uint8Array(100);
                data.fill(parseInt(key.split('-')[1]));
                return data;
            });

            cache.preRender(keys, renderFn);

            // Pre-render is async, wait a bit
            await new Promise(resolve => setTimeout(resolve, 50));

            // Check that tiles were cached
            expect(cache.get('tile-1')?.[0]).toBe(1);
            expect(cache.get('tile-2')?.[0]).toBe(2);
            expect(cache.get('tile-3')?.[0]).toBe(3);

            expect(renderFn).toHaveBeenCalledTimes(3);
        });

        it('should skip already cached tiles', async () => {
            const key = 'tile-1';
            const originalData = new Uint8Array(100).fill(1);
            cache.set(key, originalData);

            const renderFn = vi.fn(async () => new Uint8Array(100).fill(2));

            cache.preRender([key], renderFn);

            await new Promise(resolve => setTimeout(resolve, 50));

            // Should not render
            expect(renderFn).not.toHaveBeenCalled();
            expect(cache.get(key)?.[0]).toBe(1); // Original value
        });

        it('should silently ignore pre-render errors', async () => {
            const renderFn = vi.fn(async () => {
                throw new Error('Pre-render failed');
            });

            // Should not throw
            cache.preRender(['tile-1'], renderFn);

            await new Promise(resolve => setTimeout(resolve, 50));

            expect(cache.get('tile-1')).toBe(null);
        });
    });

    describe('abortAll', () => {
        it('should abort all in-flight renders', async () => {
            const key = 'tile-1';
            const renderFn = vi.fn(async (signal: AbortSignal) => {
                await new Promise((resolve, reject) => {
                    setTimeout(resolve, 100);
                    signal.addEventListener('abort', () => reject(new Error('Aborted')));
                });
                return new Uint8Array([1]);
            });

            const promise = cache.getOrRender(key, renderFn);

            // Abort before render completes
            cache.abortAll();

            await expect(promise).rejects.toThrow();
        });
    });

    describe('clear', () => {
        it('should clear all cached tiles and abort renders', async () => {
            cache.set('tile-1', new Uint8Array(100).fill(1));
            cache.set('tile-2', new Uint8Array(100).fill(2));

            const renderFn = vi.fn(async () => {
                await new Promise(resolve => setTimeout(resolve, 100));
                return new Uint8Array(100).fill(3);
            });

            cache.getOrRender('tile-3', renderFn);

            cache.clear();

            expect(cache.get('tile-1')).toBe(null);
            expect(cache.get('tile-2')).toBe(null);
            expect(cache.getStats().cacheSize).toBe(0);
            expect(cache.getStats().renderingCount).toBe(0);
        });
    });

    describe('getStats', () => {
        it('should return cache statistics', () => {
            cache.set('tile-1', new Uint8Array(100).fill(1), 100);
            cache.set('tile-2', new Uint8Array(100).fill(2), 200);

            const stats = cache.getStats();

            expect(stats.cacheSize).toBe(2);
            expect(stats.renderingCount).toBe(0);
            expect(stats.maxCacheSize).toBe(3);
            expect(stats.avgRenderingCost).toBe(150); // (100 + 200) / 2
            expect(stats.totalAccessCount).toBe(2); // Each tile accessed once on set
        });

        it('should cache all tiles including empty tiles', () => {
            cache.set('tile-valid', new Uint8Array(100).fill(1), 100); // 100 bytes
            cache.set('tile-empty', new Uint8Array([]), 50); // 0 bytes (empty)
            cache.set('tile-tiny', new Uint8Array(30).fill(2), 50); // 30 bytes (small)

            const stats = cache.getStats();

            // All tiles should be cached including empty ones
            expect(stats.cacheSize).toBe(3);
            expect(cache.get('tile-valid')).not.toBe(null);
            expect(cache.get('tile-empty')).not.toBe(null); // Empty tiles are now cached
            expect(cache.get('tile-tiny')).not.toBe(null); // Small tiles are now cached
        });
    });

    describe('cost-weighted LRU eviction', () => {
        it('should evict tiles with low value (low access, high cost)', async () => {
            const cache = new TileCacheManager(3, 100000); // Large maxAge to avoid expiration

            // Tile 1: low cost, high access (high value - keep)
            cache.set('tile-1', new Uint8Array(100).fill(1), 10);
            cache.get('tile-1'); // Access 2 times
            cache.get('tile-1'); // Access 3 times

            // Tile 2: high cost, low access (low value - evict)
            cache.set('tile-2', new Uint8Array(100).fill(2), 1000);

            // Tile 3: medium cost, medium access
            cache.set('tile-3', new Uint8Array(100).fill(3), 100);
            cache.get('tile-3'); // Access 2 times

            // Wait a bit for age calculation
            await new Promise(resolve => setTimeout(resolve, 10));

            // Adding tile 4 should evict tile-2 (highest cost, lowest access)
            cache.set('tile-4', new Uint8Array(100).fill(4), 50);

            expect(cache.get('tile-1')).not.toBe(null); // High value, kept
            expect(cache.get('tile-2')).toBe(null); // Low value, evicted
            expect(cache.get('tile-3')).not.toBe(null); // Medium value, kept
            expect(cache.get('tile-4')).not.toBe(null); // Just added
        });

        it('should track access count correctly', () => {
            cache.set('tile-1', new Uint8Array(100).fill(1), 100);

            // Initial access count is 1 (from set)
            const stats1 = cache.getStats();
            expect(stats1.totalAccessCount).toBe(1);

            // Each get increments access count
            cache.get('tile-1');
            const stats2 = cache.getStats();
            expect(stats2.totalAccessCount).toBe(2);

            cache.get('tile-1');
            const stats3 = cache.getStats();
            expect(stats3.totalAccessCount).toBe(3);
        });

        it('should calculate average rendering cost', async () => {
            const renderFn = vi.fn(async () => {
                await new Promise(resolve => setTimeout(resolve, 50));
                return new Uint8Array(100).fill(1);
            });

            await cache.getOrRender('tile-1', renderFn);

            const stats = cache.getStats();
            expect(stats.avgRenderingCost).toBeGreaterThan(40); // At least 50ms
        });
    });
});
