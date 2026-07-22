import { describe, expect, it } from 'vitest';

import { TileCache } from './tileCache';

describe('TileCache', () => {
    it('stores and returns a copy of the bytes', () => {
        const cache = new TileCache();
        const data = new Uint8Array([1, 2, 3]);
        cache.set('a', data);
        const out = cache.get('a');
        expect(out).not.toBeNull();
        expect(Array.from(out!)).toEqual([1, 2, 3]);
        // Mutating the returned copy must not affect the cached entry.
        out![0] = 99;
        expect(Array.from(cache.get('a')!)).toEqual([1, 2, 3]);
    });

    it('returns null for missing keys', () => {
        expect(new TileCache().get('nope')).toBeNull();
    });

    it('evicts the least-recently-used entry past capacity', () => {
        const cache = new TileCache(2);
        cache.set('a', new Uint8Array([1]));
        cache.set('b', new Uint8Array([2]));
        // Touch 'a' so 'b' becomes the LRU.
        cache.get('a');
        cache.set('c', new Uint8Array([3]));
        expect(cache.get('b')).toBeNull();
        expect(cache.get('a')).not.toBeNull();
        expect(cache.get('c')).not.toBeNull();
        expect(cache.size).toBe(2);
    });

    it('clears all entries', () => {
        const cache = new TileCache();
        cache.set('a', new Uint8Array([1]));
        cache.clear();
        expect(cache.size).toBe(0);
        expect(cache.get('a')).toBeNull();
    });
});
