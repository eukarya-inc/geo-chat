import { afterEach, describe, expect, it } from 'vitest';

import { hasFetched, resetGate } from '../skills/gate';
import { createGetSkillTool } from './getSkill';

const run = async (input: unknown) =>
    (await createGetSkillTool().execute!(input as never, { toolCallId: 't', messages: [] } as never)) as {
        fetched: string[];
        instructions: Record<string, string>;
        notFound?: string[];
    };

describe('get_skill tool', () => {
    afterEach(() => resetGate());

    it('returns instruction bodies for the requested skills', async () => {
        const r = await run({ skills: ['map.styling'] });
        expect(r.fetched).toContain('map.styling');
        expect(r.instructions['map.styling'].length).toBeGreaterThan(0);
    });

    it('marks each fetched skill domain in the gate', async () => {
        expect(hasFetched('map')).toBe(false);
        await run({ skills: ['map.styling'] });
        expect(hasFetched('map')).toBe(true);
    });

    it('pulls in dependencies automatically', async () => {
        const r = await run({ skills: ['duckdb.spatial'] });
        expect(r.fetched).toContain('duckdb.basics'); // dep of duckdb.spatial
        expect(hasFetched('duckdb')).toBe(true);
    });

    it('reports unknown skill ids in notFound', async () => {
        const r = await run({ skills: ['ghost.skill'] });
        expect(r.notFound).toContain('ghost.skill');
        expect(r.fetched).toHaveLength(0);
    });

    it('embeds the catalog in its description', () => {
        expect(createGetSkillTool().description).toContain('map.styling');
    });
});
