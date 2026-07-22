import { tool } from 'ai';
import { z } from 'zod';

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const THROTTLE_MS = 1000; // Nominatim usage policy: at most 1 request per second.

/** Builds the Nominatim search URL for a free-text query. */
export function buildGeocodeUrl(query: string, limit: number): string {
    const params = new URLSearchParams({
        format: 'jsonv2',
        q: query,
        limit: String(limit),
    });
    return `${NOMINATIM_URL}?${params.toString()}`;
}

// Module-level throttle: chain each call one second after the previous one so we
// never exceed Nominatim's rate limit, even with concurrent tool calls.
let lastRequest = Promise.resolve(0);
function throttle(): Promise<void> {
    lastRequest = lastRequest.then(async prev => {
        const wait = prev + THROTTLE_MS - Date.now();
        if (wait > 0) await new Promise(r => setTimeout(r, wait));
        return Date.now();
    });
    return lastRequest.then(() => undefined);
}

interface NominatimResult {
    display_name: string;
    lat: string;
    lon: string;
    type: string;
    importance: number;
}

export function createGeocodeTool() {
    return tool({
        description:
            'Geocode a place name or address to coordinates using OpenStreetMap Nominatim. ' +
            'Returns matches with name, latitude, longitude, type, and importance. Rate-limited to 1 request/second.',
        inputSchema: z.object({
            query: z.string().describe('Free-text place name or address, e.g. "Tokyo Station".'),
            limit: z.number().int().min(1).max(5).optional().describe('Maximum matches to return (default 5).'),
        }),
        execute: async ({ query, limit = 5 }) => {
            await throttle();
            try {
                const res = await fetch(buildGeocodeUrl(query, limit), {
                    headers: { 'Accept-Language': navigator.language },
                });
                if (!res.ok) return { error: `Nominatim returned ${res.status} ${res.statusText}` };
                const data = (await res.json()) as NominatimResult[];
                const results = data.map(r => ({
                    name: r.display_name,
                    lat: parseFloat(r.lat),
                    lon: parseFloat(r.lon),
                    type: r.type,
                    importance: r.importance,
                }));
                return { query, results };
            } catch (e) {
                return { error: e instanceof Error ? e.message : String(e) };
            }
        },
    });
}
