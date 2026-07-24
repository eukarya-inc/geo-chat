import { describe, expect, it } from 'vitest';

import { buildSystemPrompt } from './systemPrompt';

describe('buildSystemPrompt', () => {
    const now = new Date('2026-07-22T00:00:00Z');

    it('includes the current date and the core role', () => {
        const prompt = buildSystemPrompt({ now, tables: [] });
        expect(prompt).toContain('2026-07-22');
        expect(prompt).toContain('geospatial data assistant');
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

    it('omits the data, visualization, and skills sections (chat-only has no tools)', () => {
        const prompt = buildSystemPrompt({ now, tables: [] });
        expect(prompt).not.toContain('Working with data');
        expect(prompt).not.toContain('Built-in datasets');
        expect(prompt).not.toContain('duckdb_query');
        expect(prompt).not.toContain('Visualizing');
        expect(prompt).not.toContain('Skills');
    });

    it('caps the column list at 20 per table', () => {
        const columns = Array.from({ length: 25 }, (_, i) => ({ name: `c${i}`, type: 'INTEGER' }));
        const prompt = buildSystemPrompt({ now, tables: [{ name: 'wide', columns }] });
        expect(prompt).toContain('c19 INTEGER');
        expect(prompt).not.toContain('c20 INTEGER');
        expect(prompt).toContain('(+5 more)');
    });
});
