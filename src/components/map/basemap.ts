import { layers, namedFlavor } from '@protomaps/basemaps';
import { type StyleSpecification } from 'maplibre-gl';

// A clean, near-white vector basemap so the data layers stay the star.
//
// Two ingredients:
//   1. Vector tiles (Protomaps schema) hosted by Re:Earth Papers. No API key,
//      no vendored tile file — the workshop runs out of the box.
//   2. The "white" flavor from @protomaps/basemaps, which turns those tiles
//      into ~70 MapLibre layers (land, water, roads, labels, …) all painted
//      in the near-white palette.

/** Keyless Protomaps-schema vector tiles hosted by Re:Earth Papers. */
const TILE_URL = 'https://papers.reearth.land/protomaps/{z}/{x}/{y}.mvt';

/** Fonts + icons for the Protomaps themes, served from Protomaps' public assets. */
const GLYPHS_URL = 'https://protomaps.github.io/basemaps-assets/fonts/{fontstack}/{range}.pbf';
const SPRITE_URL = 'https://protomaps.github.io/basemaps-assets/sprites/v4/white';

/** Credit the tile host, the cartography, and the underlying OpenStreetMap data. */
const ATTRIBUTION =
    '<a href="https://papers.reearth.land">Re:Earth Papers</a> · ' +
    '<a href="https://protomaps.com">Protomaps</a> · ' +
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/** Source id the basemap layers read from; must match the first arg to `layers()`. */
const SOURCE = 'basemap';

/** Protomaps "white" basemap style. Data layers are added on top of these. */
export const BASE_STYLE: StyleSpecification = {
    version: 8,
    glyphs: GLYPHS_URL,
    sprite: SPRITE_URL,
    sources: {
        [SOURCE]: {
            type: 'vector',
            tiles: [TILE_URL],
            maxzoom: 15,
            attribution: ATTRIBUTION,
        },
    },
    layers: layers(SOURCE, namedFlavor('white'), { lang: 'en' }) as StyleSpecification['layers'],
};
