/**
 * Basic evals for the geo-chat agent — the ch6/main capstone.
 *
 * ⚠️ These make real, paid Anthropic API calls. They run ONLY via `npm run test:evals`
 * (never in `npm run check`, `npm run test:browser`, or CI) and skip themselves cleanly
 * when no API key is present. Cost per case ≈ VITE_EVAL_RUNS full agent turns (a few
 * tool round-trips each). Tune with `VITE_EVAL_RUNS=1 npm run test:evals`.
 *
 * The suite asserts on the agent's END STATE (which tools ran, what tables/specs exist),
 * not on exact wording — the model is non-deterministic, so we check outcomes and take a
 * success-rate over N runs rather than demanding every run pass.
 */
import { afterAll, describe, expect, test } from 'vitest';

import { terminateGlobalDB } from '@/lib/duckdb/globalDB';
import { EVAL_API_KEY, EVAL_THRESHOLD, runEval } from './runEval';

// Skip the whole suite cleanly when no key is present, so `npm run test:browser` and CI
// stay green without a key. (This project isn't even included there, but the guard also
// makes a keyless `npm run test:evals` a clean skip rather than a failure.)
const hasKey = EVAL_API_KEY.length > 0;

describe.skipIf(!hasKey)('agent evals (real Anthropic API)', () => {
    afterAll(() => terminateGlobalDB());

    test('「日本の自治体を地図に表示して」 loads japan_cities and styles the map', async () => {
        const report = await runEval({
            prompt: '日本の自治体を地図に表示して',
            verify: async ({ toolCalls, executeQuery, mapStyles }) => {
                const tables = await executeQuery(
                    "SELECT 1 FROM information_schema.tables WHERE table_schema = 'main' AND table_name = 'japan_cities'"
                );
                return {
                    loaded_dataset: toolCalls.includes('load_builtin_dataset'),
                    japan_cities_exists: tables.rowCount > 0,
                    map_style_set: Object.keys(mapStyles).length > 0,
                };
            },
        });
        // eslint-disable-next-line no-console
        console.log('[eval] map:', report.successRate, report.checkPassCounts);
        expect(report.successRate).toBeGreaterThanOrEqual(EVAL_THRESHOLD);
    });

    test('「都道府県ごとの市区町村数をグラフにして」 aggregates per prefecture and charts it', async () => {
        const report = await runEval({
            prompt: '都道府県ごとの市区町村数をグラフにして',
            verify: async ({ chartSpecs, executeQuery }) => {
                const chartSet = Object.keys(chartSpecs).length > 0;

                // Look for a per-prefecture aggregation: a table (other than the raw
                // built-ins) with ~47 rows, since Japan has 47 prefectures.
                const tables = await executeQuery(
                    "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'"
                );
                let aggregationTable = false;
                for (const row of tables.rows) {
                    const name = String(row.table_name);
                    if (name === 'japan_cities' || name === 'japan_prefectures') continue;
                    const count = await executeQuery(`SELECT count(*) AS n FROM "${name.replace(/"/g, '""')}"`);
                    const n = Number(count.rows[0].n);
                    if (n >= 40 && n <= 60) {
                        aggregationTable = true;
                        break;
                    }
                }
                return { chart_spec_set: chartSet, aggregation_table: aggregationTable };
            },
        });
        // eslint-disable-next-line no-console
        console.log('[eval] chart:', report.successRate, report.checkPassCounts);
        expect(report.successRate).toBeGreaterThanOrEqual(EVAL_THRESHOLD);
    });
});
