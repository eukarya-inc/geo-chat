import { describe, expect, it } from 'vitest';

import { BASE_STYLE } from './basemap';

describe('BASE_STYLE (Protomaps white basemap)', () => {
    it('reads keyless Re:Earth Papers vector tiles', () => {
        const source = BASE_STYLE.sources.basemap;
        expect(source.type).toBe('vector');
        expect(source).toHaveProperty('tiles', ['https://papers.reearth.land/protomaps/{z}/{x}/{y}.mvt']);
    });

    it('credits the tile host, cartography, and OpenStreetMap', () => {
        const source = BASE_STYLE.sources.basemap;
        const attribution = 'attribution' in source ? source.attribution : '';
        expect(attribution).toContain('Re:Earth Papers');
        expect(attribution).toContain('Protomaps');
        expect(attribution).toContain('OpenStreetMap');
    });

    it('wires the Protomaps glyphs and sprite', () => {
        expect(BASE_STYLE.glyphs).toContain('protomaps.github.io');
        expect(BASE_STYLE.sprite).toContain('/sprites/v4/white');
    });

    it('builds a near-white basemap whose layers all read the vector source', () => {
        const background = BASE_STYLE.layers.find(l => l.type === 'background');
        expect(background && 'paint' in background && background.paint?.['background-color']).toBe('#ffffff');

        // Every non-background layer must read the one source we declared, or it
        // would render nothing (schema mismatch between the theme and the tiles).
        for (const layer of BASE_STYLE.layers) {
            if (layer.type === 'background') continue;
            expect('source' in layer && layer.source).toBe('basemap');
        }
    });
});
