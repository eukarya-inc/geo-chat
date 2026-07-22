import { tool } from 'ai';
import { z } from 'zod';

import { buildCatalog, domainOf, getSkill, resolveWithDeps } from '../skills/registry';
import { markFetched } from '../skills/gate';

/**
 * get_skill — the model's progressive-disclosure entry point. It picks skills from
 * the catalog (embedded in this tool's description) and gets back their full
 * instruction bodies. Fetching also unlocks the prerequisite gate for those skills'
 * domains, which is what lets update_map_style / update_chart_spec run afterward.
 */
export function createGetSkillTool() {
    const description =
        'Fetch detailed, up-to-date instructions for one or more skills before you act. ' +
        'You MUST fetch the relevant skill before using update_map_style (map.* skills) or ' +
        'update_chart_spec (vega.* skills). Fetch DuckDB skills before non-trivial SQL. ' +
        'Dependencies are pulled in automatically.\n\nAvailable skills:\n' +
        buildCatalog();

    return tool({
        description,
        inputSchema: z.object({
            skills: z
                .array(z.string())
                .describe('Skill ids to fetch, e.g. ["map.styling", "duckdb.spatial"]. Multiple allowed.'),
        }),
        execute: async ({ skills }) => {
            const resolved = resolveWithDeps(skills);
            const instructions: Record<string, string> = {};
            const notFound: string[] = [];

            for (const id of resolved) {
                const skill = getSkill(id);
                if (skill) instructions[id] = skill.body;
                else notFound.push(id);
            }

            // Unlock the gate for every fetched skill's domain.
            const fetched = Object.keys(instructions);
            for (const id of fetched) markFetched(domainOf(id));

            return {
                fetched,
                instructions,
                ...(notFound.length > 0 ? { notFound } : {}),
            };
        },
    });
}
