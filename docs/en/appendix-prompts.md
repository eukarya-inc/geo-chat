# Appendix: Development prompt collection (the ③ layer)

This is where **③ development prompts** live — instructions for a coding AI like Claude Code to
"extend geo-chat". Instead of hand-coding the [70-beyond](./70-beyond.md) challenges, paste these.

**Three principles of a good development prompt** (each template follows them):

1. **Name a model file** — "match the existing X" puts it on the project's conventions.
2. **State the constraints** — input schema, single responsibility, result truncation, where to
   register, **validation**.
3. **Require verification** — down to "`npm run check` passes" and "write when-to-use into the
   description".

The quality of ② (descriptions, skill bodies) decides whether what ③ builds gets used well. So
include "write the description carefully" in the ③ prompt too.

> **Which branch**: do extensions on **`main`** (all layers present, so validation, skills, and
> evals are available). `git switch main` first.

---

## 1. "Add a tool" template

An example that implements `buffer_analysis` ([70-beyond](./70-beyond.md) challenge 4) **with
validation**. Swap the `<…>` placeholders for general use.

```
Add a new AI tool <tool_name> (e.g. buffer_analysis) to this repository.

■ Purpose: <one sentence on what the tool does. e.g. create a new table by ST_Buffer-ing a target
           table's geometry, and make it drawable on the map>

■ Models:
  - src/lib/ai/tools/duckdbQuery.ts (the tool's four parts = description / inputSchema(zod) / execute)
  - src/lib/ai/tools/updateMapStyle.ts (how input validation is wedged in at the top of execute)
  Both return a createXxxTool(ctx: ToolContext) function.

■ Input schema (zod, .describe() on each arg):
  - <arg1>: <type> — <meaning / unit>
  - <arg2>: <type> — <meaning>
  (e.g. table: string, distanceMeters: number, outputTable: string)

■ Behavior:
  - Validate prerequisites (target table exists / has a geometry column / distance is positive /
    output name valid). If not, return { error: "…" } with no side effects.
  - Do the work as a single SQL statement via executeQuery. For metric spatial ops, transform
    EPSG:4326 to a projected CRS (e.g. EPSG:6677, always_xy := true) → operate → convert back to
    4326 → store as GEOMETRY.
  - If UI reflection is needed, ctx.refreshTables / setSelectedTable(<out>) / setActiveTab('map').
  - The return value to the model is a short summary (created table name, row count). Don't return
    all rows or huge JSON.

■ Register: add one line to createTools in src/lib/ai/tools/index.ts
   (unregistered = not in the tools array = invisible to the model).
   To require a skill first, wrap with requireSkill('<domain>', '<suggestion>', ...).

■ description (prompt ②): state when to use it, argument meanings and units, and what it returns,
   in 2–3 sentences.

After implementing, confirm npm run check passes.
```

**Why this shape**: not naming the `index.ts` registration causes "implemented but invisible to the
model" (not in ch. 20's `tools` array). **Stating validation explicitly** is to prevent, with your
own hands, the "naive tool silently breaks" seen in ch. 30. Return truncation keeps the context from
overflowing.

---

## 2. "Add an eval" template

Guard your own tool against regressions ([70-beyond](./70-beyond.md) challenge 4, second half;
ch. 60):

```
Add one eval case to src/evals/basic.eval.browser.test.ts that guards <feature>.

■ Models: the two existing cases in that file, and the EvalCase / verify shape in src/evals/runEval.ts.

■ The case to add:
  - prompt: <one sentence sent to chat. e.g. buffer japan_cities by 2km and show it on the map>
  - verify: return named booleans that inspect the agent's END STATE.
    e.g. the output table exists in information_schema.tables / its row count > 0 /
         toolCalls includes '<tool_name>' / mapStyles is non-empty.
  - Look only at result state (tables, specs, toolCalls), not at reply wording.

■ Run: VITE_EVAL_RUNS=2 npm run test:evals to check the success rate (mind the cost).

These do NOT run in npm run check or CI (separate vitest project). Don't change that design.
```

**Why this shape**: the agent is non-deterministic, so the right approach is **measuring the
outcome N times, not string equality** (ch. 60). Too strict = flaky, so start from the minimal end
state.

---

## 3. "Add a skill" template

Turn a work procedure into a skill ([70-beyond](./70-beyond.md) challenge 3; ch. 50):

```
Add a new skill <domain>/<name>.md under src/lib/ai/skills/.
Model it on an existing src/lib/ai/skills/<nearest skill>.md (e.g. map/styling.md, duckdb/spatial.md),
same granularity, same frontmatter format.

■ frontmatter
  description: <one catalog line. Write "when it's needed", e.g. "REQUIRED before ...">
  tasks: <English and Japanese routing keywords, comma-separated>
  deps: <ids of prerequisite skills. Omit if none>

■ body
  - when to use / prerequisites
  - the concrete SQL or spec "shape" (a minimal, copy-pasteable example)
  - common mistakes and how to fix them

The id is derived from the path (<domain>.<name>). No code change. Reflected after a dev-server restart.
```

**Why this shape**: writing "when it's needed" into `description` lets the model pick correctly from
the `get_skill` catalog. Japanese in `tasks` improves routing from Japanese prompts. "Common
mistakes and fixes" helps the model avoid the same failures.

---

## 4. "Add a built-in dataset" template

[70-beyond](./70-beyond.md) challenge 1; ch. 20:

```
Add one dataset to the BUILTIN_DATASETS array in src/lib/ai/builtinDatasets.ts.
  - table: <table name created in DuckDB>
  - url: <same-origin is safest. If placed under public/data/, use ${import.meta.env.BASE_URL}data/<file>>
  - description: <what the data is + column names and types + CRS. Be specific so the model explores less>
This one spot is the only code change (the system prompt reads this array and teaches the model).
After adding, ask in chat "show <data name> on the map" and confirm the agent calls
load_builtin_dataset by itself.
```

---

## 5. "Debug the agent" template

```
The geo-chat agent isn't behaving as expected. I want to isolate the cause.

■ Symptom: <what I asked, what happened, what I expected>
■ Reproduction prompt: <what I typed into chat>
■ Observations: <the tool card's input/output, the number of messages requests in DevTools Network,
                 the error message returned — be specific>
■ Branch: <which chapter branch / main. Required, since behavior varies by which layers exist>

Isolate the cause in this order:
1. Is the model choosing the right tool (a description problem)?
   → check src/lib/ai/tools/<the tool>.ts description and propose improvements.
2. Is a tool returning an error (rejected by input validation / the prerequisite gate / column match)?
   → check requireSkill in tools/index.ts, mapStyleValidation.ts / chartSpecValidation.ts, and
     the matching in columnMatch.ts.
3. Is system-prompt / skill etiquette missing?
   → check src/lib/ai/systemPrompt.ts and the relevant skill md.
After reading the relevant files, propose the smallest fix.
```

**Why this shape**: agent problems almost always fall into "the model's choice (② description)",
"rejected by a tool's validation", or "missing etiquette (skill)". Triaging by these three lets you
inspect the ② prompt layer before suspecting `agent.ts` (most problems are there). **Always include
which branch** — normal behavior differs by which layers exist.

---

## Notes on writing prompts

- **Files worth mentioning**: naming at least these each time improves accuracy —
  `src/lib/ai/tools/index.ts` (registration), `src/lib/ai/toolContext.ts` (the window to UI state),
  the nearest existing tool to model on, and the relevant skill md.
- **Constraints to state**: single responsibility, single-statement SQL, result truncation,
  **validation**, projection and axis order (`always_xy`), column names as per `DESCRIBE`.
- **Verification to require**: `npm run check` passes, registration in `index.ts`, when-to-use
  written into the description, and guarding with an eval where appropriate.
