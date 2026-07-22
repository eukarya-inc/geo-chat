import { describe, expect, it } from 'vitest';

import {
    buildCatalog,
    buildSkills,
    domainOf,
    getAllSkills,
    getSkill,
    idFromPath,
    parseFrontmatter,
    resolveWithDeps,
} from './registry';

describe('parseFrontmatter', () => {
    it('extracts description, tasks, deps, and body', () => {
        const raw = `---\ndescription: A skill\ntasks: foo, bar, 日本語\ndeps: vega.basics, duckdb.basics\n---\n# Body\ntext`;
        const r = parseFrontmatter(raw);
        expect(r.description).toBe('A skill');
        expect(r.tasks).toEqual(['foo', 'bar', '日本語']);
        expect(r.deps).toEqual(['vega.basics', 'duckdb.basics']);
        expect(r.body).toBe('# Body\ntext');
    });

    it('defaults tasks and deps to empty when absent', () => {
        const r = parseFrontmatter(`---\ndescription: Only desc\n---\nBody`);
        expect(r.tasks).toEqual([]);
        expect(r.deps).toEqual([]);
        expect(r.description).toBe('Only desc');
    });

    it('returns the whole text as body when there is no frontmatter', () => {
        const r = parseFrontmatter('# No frontmatter\nbody');
        expect(r.description).toBe('');
        expect(r.body).toBe('# No frontmatter\nbody');
    });
});

describe('idFromPath / domainOf', () => {
    it('derives ids from glob paths', () => {
        expect(idFromPath('./duckdb/spatial.md')).toBe('duckdb.spatial');
        expect(idFromPath('./map/geospatial.md')).toBe('map.geospatial');
    });

    it('derives the domain from an id', () => {
        expect(domainOf('duckdb.spatial')).toBe('duckdb');
        expect(domainOf('map')).toBe('map');
    });
});

describe('buildSkills (injected raw map)', () => {
    const files = {
        './duckdb/basics.md': `---\ndescription: Base\ntasks: sql\n---\nbasics body`,
        './duckdb/spatial.md': `---\ndescription: Spatial\ntasks: spatial\ndeps: duckdb.basics\n---\nspatial body`,
    };
    it('parses each file into a Skill with id, domain, body', () => {
        const skills = buildSkills(files);
        const spatial = skills.find(s => s.id === 'duckdb.spatial')!;
        expect(spatial.domain).toBe('duckdb');
        expect(spatial.deps).toEqual(['duckdb.basics']);
        expect(spatial.body).toBe('spatial body');
    });
    it('sorts skills by id', () => {
        expect(buildSkills(files).map(s => s.id)).toEqual(['duckdb.basics', 'duckdb.spatial']);
    });
});

describe('real skill registry', () => {
    it('loads the seven curated skills', () => {
        const ids = getAllSkills()
            .map(s => s.id)
            .sort();
        expect(ids).toEqual([
            'duckdb.basics',
            'duckdb.file-import',
            'duckdb.spatial',
            'map.geospatial',
            'map.styling',
            'vega.basics',
            'vega.color',
        ]);
    });

    it('every skill has a non-empty description and body', () => {
        for (const s of getAllSkills()) {
            expect(s.description.length, `${s.id} description`).toBeGreaterThan(0);
            expect(s.body.length, `${s.id} body`).toBeGreaterThan(0);
        }
    });

    it('getSkill returns a skill by id and undefined for unknown ids', () => {
        expect(getSkill('map.styling')?.domain).toBe('map');
        expect(getSkill('nope.nope')).toBeUndefined();
    });
});

describe('resolveWithDeps', () => {
    it('places deps before the dependent and dedups', () => {
        const r = resolveWithDeps(['duckdb.spatial']);
        expect(r).toContain('duckdb.basics');
        expect(r.indexOf('duckdb.basics')).toBeLessThan(r.indexOf('duckdb.spatial'));
    });

    it('does not duplicate an explicitly requested dep', () => {
        const r = resolveWithDeps(['duckdb.basics', 'duckdb.spatial']);
        expect(r.filter(id => id === 'duckdb.basics')).toHaveLength(1);
    });

    it('resolves transitive deps (map.geospatial -> map.styling, duckdb.spatial -> duckdb.basics)', () => {
        const r = resolveWithDeps(['map.geospatial']);
        for (const id of ['map.styling', 'duckdb.basics', 'duckdb.spatial', 'map.geospatial']) {
            expect(r).toContain(id);
        }
        expect(r.indexOf('duckdb.basics')).toBeLessThan(r.indexOf('duckdb.spatial'));
        expect(r.indexOf('map.styling')).toBeLessThan(r.indexOf('map.geospatial'));
    });

    it('keeps unknown ids in place so callers can report them', () => {
        expect(resolveWithDeps(['ghost.skill'])).toEqual(['ghost.skill']);
    });
});

describe('buildCatalog', () => {
    it('lists every skill id with its description and tasks', () => {
        const catalog = buildCatalog();
        expect(catalog).toContain('duckdb.spatial —');
        expect(catalog).toContain('map.styling —');
        expect(catalog).toContain('vega.basics —');
        // tasks are shown in brackets for routing
        expect(catalog).toMatch(/map\.styling — .+\[.+\]/);
    });
});
