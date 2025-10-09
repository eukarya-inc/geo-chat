import { describe, it, expect } from 'vitest';
import { generateVectorTileQuery } from './mvt';

const baseParams = {
    zxy: { z: 5, x: 10, y: 12 },
    selectedTable: 'public.cities',
    geometryColumnName: 'geom',
} as const;

describe('generateVectorTileQuery', () => {
    it('keeps primitive numeric columns without casting', () => {
        const query = generateVectorTileQuery({
            ...baseParams,
            selectedColumns: ['population', 'density'],
            columnTypes: {
                population: 'INTEGER',
                density: 'DOUBLE',
            },
        });

        expect(query).toContain(`'population': "population"`);
        expect(query).toContain(`'density': "density"`);
        expect(query).not.toContain(`TRY_CAST("population" AS VARCHAR)`);
        expect(query).not.toContain(`TRY_CAST("density" AS VARCHAR)`);
    });

    it('stringifies complex columns using TRY_CAST', () => {
        const query = generateVectorTileQuery({
            ...baseParams,
            selectedColumns: ['stats', 'tags'],
            columnTypes: {
                stats: 'STRUCT(min DOUBLE, max DOUBLE)',
                tags: 'VARCHAR[]',
            },
        });

        expect(query).toContain(`'stats': TRY_CAST("stats" AS VARCHAR)`);
        expect(query).toContain(`'tags': TRY_CAST("tags" AS VARCHAR)`);
    });

    it('defaults to no casting when column types are missing', () => {
        const query = generateVectorTileQuery({
            ...baseParams,
            selectedColumns: ['name'],
            columnTypes: undefined,
        });

        expect(query).toContain(`'name': "name"`);
        expect(query).not.toContain(`TRY_CAST("name" AS VARCHAR)`);
    });
});
