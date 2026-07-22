/**
 * Small insertion-order LRU cache for rendered MVT tiles. Copies bytes in and
 * out so MapLibre transferring a buffer to a worker (which detaches it) never
 * corrupts a cached entry.
 */
export class TileCache {
    private readonly cache = new Map<string, Uint8Array>();

    constructor(private readonly maxSize = 512) {}

    get(key: string): Uint8Array | null {
        const entry = this.cache.get(key);
        if (!entry) return null;
        // Refresh recency.
        this.cache.delete(key);
        this.cache.set(key, entry);
        return new Uint8Array(entry);
    }

    set(key: string, data: Uint8Array): void {
        if (this.cache.has(key)) {
            this.cache.delete(key);
        } else if (this.cache.size >= this.maxSize) {
            const oldest = this.cache.keys().next().value;
            if (oldest !== undefined) this.cache.delete(oldest);
        }
        this.cache.set(key, new Uint8Array(data));
    }

    clear(): void {
        this.cache.clear();
    }

    get size(): number {
        return this.cache.size;
    }
}
