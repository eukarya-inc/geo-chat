/**
 * Simple LRU (Least Recently Used) Cache implementation
 */
export class LRUCache<K, V> {
    private cache: Map<K, V>;
    private readonly maxSize: number;

    constructor(maxSize: number) {
        this.cache = new Map();
        this.maxSize = maxSize;
    }

    get(key: K): V | undefined {
        if (!this.cache.has(key)) {
            return undefined;
        }
        // Move to end (most recently used)
        const value = this.cache.get(key)!;
        this.cache.delete(key);
        this.cache.set(key, value);
        return value;
    }

    set(key: K, value: V): void {
        // Remove key if it exists (to update position)
        if (this.cache.has(key)) {
            this.cache.delete(key);
        }
        // Add to end (most recently used)
        this.cache.set(key, value);

        // Remove least recently used if over capacity
        if (this.cache.size > this.maxSize) {
            const firstKey = this.cache.keys().next().value;
            if (firstKey !== undefined) {
                this.cache.delete(firstKey);
            }
        }
    }

    has(key: K): boolean {
        return this.cache.has(key);
    }

    clear(): void {
        this.cache.clear();
    }

    // For compatibility with existing code
    entries(): IterableIterator<[K, V]> {
        return this.cache.entries();
    }

    forEach(callbackfn: (value: V, key: K, map: Map<K, V>) => void): void {
        this.cache.forEach(callbackfn);
    }

    get size(): number {
        return this.cache.size;
    }
}
