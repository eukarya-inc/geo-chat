import { describe, expect, it } from 'vitest';

import { collectGetColumns, matchColumn, rewriteGetColumns } from './columnMatch';

describe('matchColumn', () => {
    const columns = ['population', 'ガス', 'CityName'];

    it('matches exact names without correction', () => {
        expect(matchColumn('population', columns)).toEqual({ ok: true, name: 'population', corrected: false });
    });

    it('auto-corrects a case-insensitive near-miss', () => {
        expect(matchColumn('cityname', columns)).toEqual({ ok: true, name: 'CityName', corrected: true });
    });

    it('auto-corrects an NFC-normalized near-miss', () => {
        // 'ガ' (U+30AC) decomposes under NFD to 'カ' + combining dakuten; matching
        // must re-compose it (NFC) to resolve to the stored column name.
        const nfd = 'ガス'.normalize('NFD');
        expect(nfd).not.toBe('ガス'); // sanity: the NFD form really differs
        expect(matchColumn(nfd, columns)).toEqual({ ok: true, name: 'ガス', corrected: true });
    });

    it('fails on unknown columns', () => {
        expect(matchColumn('nope', columns)).toEqual({ ok: false });
    });
});

describe('collectGetColumns / rewriteGetColumns', () => {
    const expr = ['interpolate', ['linear'], ['get', 'pop'], 0, '#eee', 100, ['get', 'Pop']];

    it('collects every ["get", col] reference', () => {
        expect(collectGetColumns(expr)).toEqual(new Set(['pop', 'Pop']));
    });

    it('rewrites only the renamed references', () => {
        const rewritten = rewriteGetColumns(expr, new Map([['Pop', 'population']]));
        expect(collectGetColumns(rewritten)).toEqual(new Set(['pop', 'population']));
    });
});
