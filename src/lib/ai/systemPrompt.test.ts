import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from './systemPrompt';

describe('buildSystemPrompt', () => {
    const now = new Date('2026-07-22T00:00:00Z');

    it('includes the current date and the MapLibre direct-access rule', () => {
        const prompt = buildSystemPrompt({ now, tables: [] });
        expect(prompt).toContain('2026-07-22');
        expect(prompt).toContain('["get", "column_name"]');
    });

    it('lists each table with its columns and types', () => {
        const prompt = buildSystemPrompt({
            now,
            tables: [
                {
                    name: 'cities',
                    columns: [
                        { name: 'pop', type: 'INTEGER' },
                        { name: 'geom', type: 'GEOMETRY' },
                    ],
                },
            ],
        });
        expect(prompt).toContain('cities(pop INTEGER, geom GEOMETRY)');
    });

    it('lists the built-in datasets and how to load them', () => {
        const prompt = buildSystemPrompt({ now, tables: [] });
        expect(prompt).toContain('Built-in datasets');
        expect(prompt).toContain('japan_cities');
        expect(prompt).toContain('japan_prefectures');
        // Tells the model to load a dataset itself via the dedicated tool.
        expect(prompt).toContain('load_builtin_dataset');
    });

    it('caps the column list at 20 per table', () => {
        const columns = Array.from({ length: 25 }, (_, i) => ({ name: `c${i}`, type: 'INTEGER' }));
        const prompt = buildSystemPrompt({ now, tables: [{ name: 'wide', columns }] });
        expect(prompt).toContain('c19 INTEGER');
        expect(prompt).not.toContain('c20 INTEGER');
        expect(prompt).toContain('(+5 more)');
    });
});
