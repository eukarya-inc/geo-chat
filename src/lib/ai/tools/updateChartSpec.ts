import { tool } from 'ai';
import { z } from 'zod';

import { getTableSchema } from '@/lib/duckdb/db';
import type { ToolContext } from '../toolContext';

/** Keys the app injects at render time; the model must not set them. */
const INJECTED_KEYS = ['data', 'width', 'height'];

export function createUpdateChartSpecTool(ctx: ToolContext) {
    return tool({
        description:
            'Set the Vega-Lite chart spec for a table. Omit `data`, `width`, and `height` — they are injected at render time. ' +
            'Encoding `field` names must be real columns of the table. The spec is compiled before it is applied, and compile errors are returned to you. ' +
            'On success the chart tab opens showing the chart.',
        inputSchema: z.object({
            table: z.string(),
            spec: z
                .union([z.record(z.string(), z.any()), z.string()])
                .describe('A Vega-Lite spec as an object or JSON string (without data/width/height).'),
        }),
        execute: async ({ table, spec }) => {
            // Parse if a JSON string was passed.
            let parsed: Record<string, unknown>;
            try {
                parsed = typeof spec === 'string' ? JSON.parse(spec) : spec;
            } catch (e) {
                return { error: `spec is not valid JSON: ${e instanceof Error ? e.message : String(e)}` };
            }

            const present = INJECTED_KEYS.filter(k => k in parsed);
            if (present.length > 0) {
                return { error: `Remove [${present.join(', ')}] from the spec — they are injected automatically.` };
            }

            const schema = await getTableSchema(table).catch(() => null);
            if (!schema) return { error: `Table "${table}" not found.` };

            // CHAPTER SEAM: validation layer (removed) — the naive branch trusts the
            // model's spec blindly: no fuzzy field correction, no compile() pre-flight.
            // A mistyped encoding field or a spec that won't compile now sails through
            // and breaks in the chart instead of being caught here. That fragility is
            // this chapter's lesson.
            ctx.setChartSpec(table, parsed);
            ctx.setSelectedTable(table);
            ctx.setActiveTab('chart');
            return { success: true, table };
        },
    });
}
