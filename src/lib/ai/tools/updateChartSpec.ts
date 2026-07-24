import { tool } from 'ai';
import { z } from 'zod';

import { getTableSchema } from '@/lib/duckdb/db';
import type { ToolContext } from '../toolContext';
import { validateChartSpecInput } from './chartSpecValidation';

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

            // CHAPTER SEAM: validation layer — fuzzy field correction + compile() preflight.
            // A "naive" chapter branch replaces this call with a passthrough returning
            // { ok: true, spec: parsed, corrections: [] } (see chartSpecValidation.ts).
            const validated = validateChartSpecInput({ table, spec: parsed, columns: schema.map(c => c.name) });
            if (!validated.ok) return { error: validated.error };

            ctx.setChartSpec(table, validated.spec);
            ctx.setSelectedTable(table);
            ctx.setActiveTab('chart');
            return {
                success: true,
                table,
                ...(validated.corrections.length > 0 ? { corrected: validated.corrections } : {}),
            };
        },
    });
}
