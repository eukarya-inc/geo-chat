import { describe, expect, it } from 'vitest';

import { buildGeocodeUrl } from './geocode';

describe('buildGeocodeUrl', () => {
    it('builds a Nominatim jsonv2 search URL', () => {
        const url = new URL(buildGeocodeUrl('Tokyo Station', 3));
        expect(url.origin + url.pathname).toBe('https://nominatim.openstreetmap.org/search');
        expect(url.searchParams.get('format')).toBe('jsonv2');
        expect(url.searchParams.get('q')).toBe('Tokyo Station');
        expect(url.searchParams.get('limit')).toBe('3');
    });

    it('encodes special characters in the query', () => {
        const url = buildGeocodeUrl('Café & Bar, Paris', 1);
        expect(url).toContain('q=Caf%C3%A9+%26+Bar%2C+Paris');
    });
});
