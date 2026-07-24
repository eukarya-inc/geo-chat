/**
 * Mini-evals harness — a teachable, cut-down version of the pattern a production
 * agent team uses to guard against regressions: run the REAL agent loop against a
 * fixed prompt several times and assert it reaches the right end state often enough.
 *
 * ⚠️ COST: every run makes real, paid Anthropic API calls (one full agent turn, which
 * is usually several tool round-trips). Total calls ≈ runs × cases. Keep VITE_EVAL_RUNS
 * small. These tests are NOT part of `npm run check`, `npm run test:browser`, or CI —
 * they run only via `npm run test:evals`, and only when an API key is present.
 *
 * The harness runs headlessly in the vitest browser (webkit) env, where the real
 * DuckDB-WASM, MapLibre and Anthropic browser calls all work — the same runtime the
 * app uses. See vitest.workspace.ts for how the key + config reach `import.meta.env`.
 */
import { getDefaultStore } from 'jotai';

import { runAgent } from '@/lib/ai/agent';
import { resetGate } from '@/lib/ai/skills/gate';
import type { PromptContext } from '@/lib/ai/systemPrompt';
import { defaultToolContext } from '@/lib/ai/toolContext';
import { createTools } from '@/lib/ai/tools';
import { executeQuery, getTables, getTableSchema } from '@/lib/duckdb/db';
import type { TableMapStyle } from '@/lib/map/mapSpec';
import { activeTabAtom, chartSpecsAtom, mapStylesAtom, selectedTableAtom, tablesAtom } from '@/store/atoms';

// Config injected by the evals vitest project (vitest.workspace.ts `define`).
/** The API key; empty when no key was found — callers should skip the suite then. */
export const EVAL_API_KEY = import.meta.env.VITE_ANTHROPIC_API_KEY ?? '';
/** Model to eval against; defaults to the app's default model. */
export const EVAL_MODEL = import.meta.env.VITE_EVAL_MODEL || 'claude-sonnet-4-5';
/** How many times to run each case (default 2 to keep cost low). */
export const EVAL_RUNS = Number(import.meta.env.VITE_EVAL_RUNS) || 2;
/** Minimum successRate a case must reach to pass (default 0.5 → ≥1 of 2 runs). */
export const EVAL_THRESHOLD = Number(import.meta.env.VITE_EVAL_THRESHOLD) || 0.5;

/** What a `verify` function may inspect after one agent run. */
export interface EvalContext {
    /** Names of the tools the model executed this run, in call order. */
    toolCalls: string[];
    /** Run SQL against the resulting DB (e.g. assert a table/aggregation exists). */
    executeQuery: typeof executeQuery;
    /** Vega-Lite specs the agent set, keyed by table (from the shared jotai store). */
    chartSpecs: Record<string, object>;
    /** Map styles the agent set, keyed by table (from the shared jotai store). */
    mapStyles: Record<string, TableMapStyle>;
}

export interface EvalCase {
    /** The user message to send to the agent. */
    prompt: string;
    /** Override the run count for this case (defaults to EVAL_RUNS). */
    runs?: number;
    /** Inspects the end state and returns named boolean checks. */
    verify: (ctx: EvalContext) => Promise<Record<string, boolean>> | Record<string, boolean>;
}

export interface EvalReport {
    prompt: string;
    runs: number;
    /** Fraction of runs where EVERY check passed. */
    successRate: number;
    /** Per-check pass counts across all runs — shows which check is flaky. */
    checkPassCounts: Record<string, number>;
}

const store = getDefaultStore();

/** Drops every user table and clears in-memory app state so each run starts clean. */
async function resetState(): Promise<void> {
    for (const table of await getTables()) {
        await executeQuery(`DROP TABLE IF EXISTS "${table.replace(/"/g, '""')}"`);
    }
    resetGate();
    store.set(chartSpecsAtom, {});
    store.set(mapStylesAtom, {});
    store.set(tablesAtom, []);
    store.set(selectedTableAtom, null);
    store.set(activeTabAtom, 'table');
}

/** Builds the live schema context the system prompt needs (mirrors the UI's helper). */
async function buildPromptContext(): Promise<PromptContext> {
    const names = await getTables();
    const tables = await Promise.all(names.map(async name => ({ name, columns: await getTableSchema(name) })));
    return { now: new Date(), tables };
}

/** Runs the real agent loop once and returns the tool-call names it executed, in order. */
async function runOnce(prompt: string): Promise<string[]> {
    const toolCalls: string[] = [];
    await runAgent({
        apiKey: EVAL_API_KEY,
        model: EVAL_MODEL,
        messages: [{ role: 'user', content: prompt }],
        tools: createTools(defaultToolContext()),
        promptContext: await buildPromptContext(),
        onEvent: event => {
            if (event.type === 'tool-call') toolCalls.push(event.name);
        },
        abortSignal: new AbortController().signal,
    });
    return toolCalls;
}

/**
 * Runs one eval case `runs` times and reports how often the model reached the desired
 * end state. A single run counts as a success only if EVERY check in its verify()
 * result is true; successRate is successes / runs.
 */
export async function runEval(evalCase: EvalCase): Promise<EvalReport> {
    const runs = evalCase.runs ?? EVAL_RUNS;
    let successes = 0;
    const checkPassCounts: Record<string, number> = {};

    for (let i = 0; i < runs; i++) {
        await resetState();
        const toolCalls = await runOnce(evalCase.prompt);
        const checks = await evalCase.verify({
            toolCalls,
            executeQuery,
            chartSpecs: store.get(chartSpecsAtom),
            mapStyles: store.get(mapStylesAtom),
        });
        const entries = Object.entries(checks);
        for (const [name, passed] of entries) {
            checkPassCounts[name] = (checkPassCounts[name] ?? 0) + (passed ? 1 : 0);
        }
        if (entries.every(([, passed]) => passed)) successes++;
    }

    return { prompt: evalCase.prompt, runs, successRate: successes / runs, checkPassCounts };
}
