import { compile } from 'vega-lite';

import { matchColumn } from './columnMatch';

/**
 * The self-correction / validation layer for update_chart_spec, pulled out of the
 * tool so it sits behind a single seam (see `// CHAPTER SEAM: validation layer` in
 * updateChartSpec.ts). A "naive" chapter branch swaps this whole module for a
 * passthrough:
 *
 *   export function validateChartSpecInput(input: ChartSpecValidationInput): ChartSpecValidationResult {
 *       return { ok: true, spec: input.spec, corrections: [] };
 *   }
 *
 * (the passthrough ignores `columns`; the seam shape stays the same)
 *
 * What lives here: fuzzy field correction (every encoding `field` must resolve to a
 * real column, auto-fixing case / Unicode near-misses) and a compile() pre-flight so
 * a broken spec fails here with a readable error instead of in the UI.
 */

export interface ChartSpecValidationInput {
    /** Table name, used only for clearer error messages. */
    table: string;
    /** The parsed Vega-Lite spec (data/width/height already guarded out by the tool). */
    spec: Record<string, unknown>;
    /** The table's real column names, used to validate/correct encoding fields. */
    columns: string[];
}

export type ChartSpecValidationResult =
    | { ok: false; error: string }
    | {
          ok: true;
          /** Spec with any near-miss encoding fields rewritten to real column names. */
          spec: Record<string, unknown>;
          /** Human-readable "from → to" notes for every auto-correction made. */
          corrections: string[];
      };

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

export function validateChartSpecInput(input: ChartSpecValidationInput): ChartSpecValidationResult {
    const { table, spec, columns } = input;

    // Encoding fields must reference real columns (auto-correcting near-misses).
    const corrections: string[] = [];
    let invalid: string | null = null;
    eachEncodingField(spec, channel => {
        const field = channel.field as string;
        const match = matchColumn(field, columns);
        if (!match.ok) invalid ??= field;
        else if (match.corrected) {
            channel.field = match.name;
            corrections.push(`"${field}" → "${match.name}"`);
        }
    });
    if (invalid) {
        return {
            ok: false,
            error: `Column "${invalid}" does not exist in "${table}". Valid columns: ${columns.join(', ')}.`,
        };
    }

    // Pre-flight: compile with dummy data so a broken spec fails here, not in the UI.
    try {
        compile({ ...spec, data: { values: [] }, width: 300, height: 200 } as never);
    } catch (e) {
        return { ok: false, error: `Vega-Lite compile failed: ${e instanceof Error ? e.message : String(e)}` };
    }

    return { ok: true, spec, corrections };
}
