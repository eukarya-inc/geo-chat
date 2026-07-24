# 60. Evals — evaluation as the product

> So far we've added one layer at a time and watched the through-line prompt become solvable.
> The last layer isn't a feature. It's the answer to "**how do you guarantee the solved state
> against a non-deterministic model?**" — evals (evaluation). Only with this in place does the
> agent go from a "piece" to a **maintainable product**.

## ① State of this chapter — `main` (everything)

```bash
git switch main
# The dev server isn't needed for evals (evals run the real loop under vitest).
```

`main` is all the layers so far (data, visualization, validation, skills) plus the **evals
harness** — the finished app.

- `src/evals/runEval.ts` — a small harness that runs the real agent loop N times and reports a
  **success rate**.
- `src/evals/basic.eval.browser.test.ts` — two eval cases (map, chart).
- `vitest.workspace.ts` — defines evals as a **separate vitest project**. It injects
  `ANTHROPIC_API_KEY` / `VITE_ANTHROPIC_API_KEY` from `.env` into the evals bundle only, and is
  **excluded from CI and `npm run check`**. With no key it **skips cleanly**.

Evals run in the same **webkit (Playwright)** environment as `npm run test:browser`, driving the
real DuckDB-WASM, MapLibre, and Anthropic calls **headlessly** — the same runtime as the app.

## ② Observe — run the evals

> **⚠️ Cost**: evals hit the real, paid Anthropic API (several tool round-trips per case ×
> `VITE_EVAL_RUNS` runs). Start with **one** run.

```bash
VITE_EVAL_RUNS=1 npm run test:evals
```

(`vitest.workspace.ts` auto-injects the key from `.env`'s `ANTHROPIC_API_KEY`. If you have no
`.env`, put a single line `ANTHROPIC_API_KEY=sk-ant-…` at the repo root.)

**Real result**: **PASS — 1 file, 2 tests, both green.**

- `「日本の自治体を地図に表示して」 loads japan_cities and styles the map` — successRate **1.0**.
  Checks: `loaded_dataset=1, japan_cities_exists=1, map_style_set=1`. (~16.7s)
- `「都道府県ごとの市区町村数をグラフにして」 aggregates per prefecture and charts it` —
  successRate **1.0**. Checks: `aggregation_table=1, chart_spec_set=1`. (~16.5s)
- Total ~34.9s.

Notice that **the assertions are not about "wording"**. They never look at the reply text
"the map is displayed." They look at:

- which tools were called (does `toolCalls` include `load_builtin_dataset`?),
- what tables exist in the DB (does `japan_cities` exist? is there a ~47-row aggregation table?),
- which specs were set (are `mapStyles` / `chartSpecs` non-empty?).

That is, they verify the **agent's END STATE**.

## ③ Why — evals _are_ the product

### Guard a non-deterministic agent by outcome

The model is non-deterministic. For the same prompt, the tool order and wording vary slightly
each time. So guarding it by "does the output equal string X" gives you tests that fail while the
thing works fine (flaky). Evals avoid that by measuring **"does it reach the desired end state
often enough?"**

Read `runEval.ts`. The core is this loop:

```ts
for (let i = 0; i < runs; i++) {
    await resetState(); // start clean each time
    const toolCalls = await runOnce(prompt); // the real loop once
    const checks = await evalCase.verify({ toolCalls, executeQuery, chartSpecs, mapStyles });
    if (Object.values(checks).every(Boolean)) successes++;
}
return { prompt, runs, successRate: successes / runs, checkPassCounts };
```

- `runOnce()` calls the **same `runAgent` / `createTools`** as the app — just without the UI; the
  thing under test is the real agent itself.
- `verify()` returns a **bundle of named boolean checks**, and **a run counts as a success only
  if all are true**. `successRate = successes / runs`. It also reports each check's pass count
  (`checkPassCounts`), so you can see **which check is flaky**.
- `EVAL_RUNS` (count) and `EVAL_THRESHOLD` (pass threshold, default 0.5) are env-tunable.

`verify` looks only at end state. Example (map case):

```ts
verify: async ({ toolCalls, executeQuery, mapStyles }) => ({
    loaded_dataset: toolCalls.includes('load_builtin_dataset'),
    japan_cities_exists: (await executeQuery("SELECT 1 FROM information_schema.tables WHERE table_name='japan_cities'")).rowCount > 0,
    map_style_set: Object.keys(mapStyles).length > 0,
}),
```

### Connecting to production practice

This harness is a **teaching-sized version** of what production agent teams do.

- **Regression testing**: after editing one skill in ch. 50, run `test:evals` to confirm
  **other prompts didn't break**. Prompts/tools/skills are "code", so changes need regression
  checks — that's what evals are.
- **Statistical success rates**: in production you raise `EVAL_RUNS` (say 20) and gate on a
  threshold like `successRate ≥ 0.9` to measure "does it work stably enough?" — treating
  non-determinism as **probability**.
- **Cost management**: evals cost money, so keep them out of CI and run them deliberately by
  hand. That design decision itself (separate vitest project in `vitest.workspace.ts`; skip when
  no key) is the real-world pattern.

> **The visible principle**: the "tests" for agent development aren't unit tests — they're
> **outcome-based success-rate evals**. What you define as "success", and how many of N runs must
> meet it, — **writing that definition is what it means to hold an agent as a product.**

## ④ Hands-on — write one eval of your own

Add a third case to `basic.eval.browser.test.ts`. Making the through-line prompt into an eval is
good practice:

```ts
test('through-line: color municipalities by prefecture', async () => {
    const report = await runEval({
        prompt: '自治体を都道府県ごとに色分けして地図に表示して',
        verify: async ({ toolCalls, mapStyles, executeQuery }) => {
            const cities = await executeQuery(
                "SELECT 1 FROM information_schema.tables WHERE table_schema='main' AND table_name='japan_cities'"
            );
            return {
                loaded: toolCalls.includes('load_builtin_dataset'),
                cities_exists: cities.rowCount > 0,
                map_styled: Object.keys(mapStyles).length > 0,
            };
        },
    });
    expect(report.successRate).toBeGreaterThanOrEqual(EVAL_THRESHOLD);
});
```

Run it with `VITE_EVAL_RUNS=2 npm run test:evals`. **Things to think about**:

1. **What did you define as "success"?** Is "the map was painted (`mapStyles` non-empty)"
   enough? Should you check "47 colors per prefecture"? The stricter you get, the flakier — feel
   that **tradeoff**.
2. **Which check is flaky?** Read `checkPassCounts` to identify the one that fails most.
3. **Change one word of the prompt** — how does the success rate move? Does swapping "color by"
   for "show" push `map_styled`'s pass rate up or down?

## ⑤ Looking back down the subtraction ladder

We've re-climbed, from the bottom, the branches built by subtracting one layer at a time from
`main`. Here's the whole picture on one page:

| Chapter / Branch             | Through-line outcome                         | In a line                                           |
| ---------------------------- | -------------------------------------------- | --------------------------------------------------- |
| 10 / `chapter/00-chat-only`  | only talks; confidently wrong                | a handless LLM can only guess                       |
| 20 / `chapter/01-data`       | SQL runs but can't paint; over-claims        | data alone = prepare + describe only                |
| 30 / `chapter/02-viz-naive`  | 47 colors work / forced, a silent break      | no validation = silently paints garbage when pushed |
| 40 / `chapter/03-validation` | forced → readable error → honest report      | validation turns garbage into a readable refusal    |
| 50 / `chapter/04-skills`     | best area choropleth; self-fixes the NaN bug | skills enforce etiquette _and_ raise accuracy       |
| 60 / `main`                  | both evals PASS (successRate 1.0)            | guard a non-deterministic agent by outcome          |

Each branch boundary is carved into the code as a **`// CHAPTER SEAM: <layer>`** comment.
`git diff --stat chapter/A..chapter/B` shows that one layer whole, as a diff — **because the
material was built by subtraction, addition reads cleanly in reverse.**

By now you should see the agent not as "magic" but as a stack of "tools + loop + context +
validation + skills + evals". Finally, turn it toward **your own data and work problems**.

Next: [70. Beyond — transferring to your own problem](./70-beyond.md).
