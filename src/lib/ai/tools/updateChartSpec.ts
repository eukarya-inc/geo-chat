import { tool } from 'ai';
import { compile } from 'vega-lite';
import { z } from 'zod';

import { getTableSchema } from '@/lib/duckdb/db';
import type { ToolContext } from '../toolContext';
import { matchColumn } from './columnMatch';

/** Keys the app injects at render time; the model must not set them. */
const INJECTED_KEYS = ['data', 'width', 'height'];

/**
 * Walks a Vega-Lite spec collecting `field` names from every `encoding` block
 * (top-level and inside layer/concat sub-specs), and applies corrections in place.
 */
function eachEncodingField(spec: unknown, visit: (channel: Record<string, unknown>) => void): void {
    if (!spec || typeof spec !== 'object') return;
    const obj = spec as Record<string, unknown>;
    for (const [key, value] of Object.entries(obj)) {
        if (key === 'encoding' && value && typeof value === 'object') {
            for (const channel of Object.values(value as Record<string, unknown>)) {
                if (
                    channel &&
                    typeof channel === 'object' &&
                    typeof (channel as Record<string, unknown>).field === 'string'
                ) {
                    visit(channel as Record<string, unknown>);
                }
            }
        } else {
            eachEncodingField(value, visit); // recurse into arrays and nested specs
        }
    }
}

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

            // Encoding fields must reference real columns (auto-correcting near-misses).
            const schema = await getTableSchema(table).catch(() => null);
            if (!schema) return { error: `Table "${table}" not found.` };
            const columnNames = schema.map(c => c.name);
            const corrections: string[] = [];
            let invalid: string | null = null;
            eachEncodingField(parsed, channel => {
                const field = channel.field as string;
                const match = matchColumn(field, columnNames);
                if (!match.ok) invalid ??= field;
                else if (match.corrected) {
                    channel.field = match.name;
                    corrections.push(`"${field}" → "${match.name}"`);
                }
            });
            if (invalid) {
                return {
                    error: `Column "${invalid}" does not exist in "${table}". Valid columns: ${columnNames.join(', ')}.`,
                };
            }

            // Pre-flight: compile with dummy data so a broken spec fails here, not in the UI.
            try {
                compile({ ...parsed, data: { values: [] }, width: 300, height: 200 } as never);
            } catch (e) {
                return { error: `Vega-Lite compile failed: ${e instanceof Error ? e.message : String(e)}` };
            }

            ctx.setChartSpec(table, parsed);
            ctx.setSelectedTable(table);
            ctx.setActiveTab('chart');
            return { success: true, table, ...(corrections.length > 0 ? { corrected: corrections } : {}) };
        },
    });
}
