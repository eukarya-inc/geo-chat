import { afterEach, describe, expect, it } from 'vitest';

import { hasFetched, markFetched, resetGate } from './gate';

describe('skill prerequisite gate', () => {
    afterEach(() => resetGate());

    it('reports a domain as not fetched initially', () => {
        expect(hasFetched('map')).toBe(false);
    });

    it('remembers a fetched domain', () => {
        markFetched('map');
        expect(hasFetched('map')).toBe(true);
        expect(hasFetched('vega')).toBe(false);
    });

    it('forgets everything on reset', () => {
        markFetched('map');
        markFetched('vega');
        resetGate();
        expect(hasFetched('map')).toBe(false);
        expect(hasFetched('vega')).toBe(false);
    });
});
