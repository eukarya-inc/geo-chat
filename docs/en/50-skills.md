# 50. A skill = one .md file — inject etiquette only when needed

> Ch. 40's validation was a layer that "rejects mistakes." Here we add the layer that
> "**injects the right etiquette at the moment it's needed**" — the skill system. Skills are
> **one Markdown file each**. In this chapter's observation, a fetched skill **fixes a real bug
> mid-conversation** and produces the highest-quality map of any chapter.

## ① State of this chapter

```bash
git switch chapter/04-skills
# restart the dev server (Ctrl+C → npm run dev). Skills load at build time, so a restart is required.
```

This branch is `main` **minus only evals** — nearly finished. `// CHAPTER SEAM: skill system`
returns:

- **The skills** `src/lib/ai/skills/**/*.md` — seven etiquette files (`duckdb/basics`,
  `duckdb/spatial`, `duckdb/file-import`, `map/styling`, `map/geospatial`, `vega/basics`,
  `vega/color`).
- **The `get_skill` tool** — its description embeds the **catalog of all skills**; the model
  picks the id it needs and fetches.
- **The prerequisite gate** — `update_map_style` won't run until a `map.*` skill is fetched, and
  `update_chart_spec` won't until a `vega.*` skill is.

- **Present**: validation + skills + gate (everything that lifts quality).
- **Absent**: the evals harness (the mechanism that automatically guarantees this state; ch. 60).

## ② Observe

### Observation: throw a hard request that needs etiquette

An area choropleth needs etiquette — project before measuring area, round the legend breaks:

```
市区町村を面積が大きいほど濃い緑になるように塗って、凡例向けに区切りのいい値で
(Color municipalities darker green the larger their area, with round legend breaks)
```

**Real behavior** (order of the tool cards):

1. `load_builtin_dataset(japan_cities)`
2. `duckdb_query` — computes area with `ST_Transform(geom,'EPSG:4326','ESRI:54009')` — but
   **forgets `always_xy`, so `area_km2` comes out NaN** (the axis-order trap).
3. **`get_skill(["duckdb.spatial","map.styling"])`** — fetches skills **before** calling
   `update_map_style` (= the prerequisite gate). `deps` auto-resolve, so it returns three files:
   `duckdb.basics, duckdb.spatial, map.styling`.
4. `duckdb_query` — recomputes area **with `always_xy := true` → correct values** (max ≈ 2183 km²).
5. `duckdb_query` — `SUMMARIZE` the area distribution.
6. `duckdb_query` — **`CREATE TABLE city_areas`** (adds `area_km2`, renames geom → geometry).
7. `update_map_style(city_areas, fill-color interpolate 0→2000 km², pale→dark green)` → `{"success": true}`

**The best result of any chapter.** The fetched `duckdb.spatial` skill **directly fixed the NaN
bug in step 2** — after reading the skill, the model retried with `always_xy := true` and got
correct areas. The final map is a sequential green choropleth with **legend-friendly round
breaks (0/100/300/500/1000/2000 km²)**, opacity, white outline. The model even reported median
≈ 108 km², max ≈ 2183 km² (Takayama). Console errors: 0.

### How the gate behaves

Note that **`get_skill` is step 3, `update_map_style` is step 7**. Following the system prompt,
the model **went and fetched the skill first, on its own**, so the gate never had to return a
rejection. The gate acts less as "reject and complain" and more as **a nudge toward the right
order**.

> **You can observe the rejection too, if you want**: right after a New chat (which resets the
> gate), throw an etiquette-laden request like "make it a legend-clear 5-step choropleth". The
> moment the model calls `update_map_style` after exploring, the tool returns
> `{error: "Fetch the 'map.styling' skill…"}` and refuses. The model reads it, re-calls
> `get_skill`, gets the etiquette, and then succeeds.

## ③ Why — context is a finite resource, hence progressive disclosure

### The contradiction: etiquette is needed, but loading it all saturates

The context you can hand an LLM (system prompt + conversation + tool definitions) has a limit.
And **more isn't always smarter** — pile on irrelevant information and important instructions
get buried, dropping quality. Context is a scarce resource.

Yet doing the job **accurately** — styling a map, coloring Vega-Lite, the axis-order trap of
projection — needs hundreds of words of etiquette each. Keeping all of it in the system prompt
at all times saturates it.

### The solution = progressive disclosure

> Keep detailed knowledge outside, as **skills**, and have the model fetch **only what's
> relevant, at the moment it's needed**, with `get_skill`.

The system prompt just says "detailed how-to lives in skills; fetch when needed", and the
catalog (which skills exist) is embedded in `get_skill`'s description. The model decides "fetch
the map skill before styling the map" and does so. This is the **knowledge version** of the tool
round-trip loop from ch. 20. The observation's crux is that it's not mere enforcement — it
**actually improved accuracy** (fixed the NaN bug).

### Skill format — just drop one `<domain>/<name>.md`

A skill is Markdown with frontmatter (e.g. `map/styling.md`):

```markdown
---
description: REQUIRED before styling the map — TableMapStyle shape, paint per geometry, …
tasks: 地図, 地図スタイル, 色分け, スタイル, map, map style, choropleth, 塗り分け, …
---

## Styling the map with update_map_style

(below is the body — the content handed to the model when fetched)
```

- **`description`** — the one-line catalog text. Write **when it's needed**, e.g. "REQUIRED
  before …".
- **`tasks`** — routing keywords (English + Japanese); the model's cue for picking.
- **`deps`** (optional) — ids of prerequisite skills fetched alongside (e.g. `duckdb.spatial`
  has `deps: duckdb.basics`). Step 3's three-in-one return is thanks to this auto-resolution.
- **The id is derived from the file path** — `registry.ts`'s `idFromPath()` maps
  `./duckdb/spatial.md → duckdb.spatial`. **The first segment (`duckdb`) is the domain**, the
  unit the gate uses. Files are **loaded at build time** via `import.meta.glob('./**/*.md')` (so
  adding a skill requires a **dev-server restart**).

> **In short: drop one `<domain>/<name>.md` and the agent gains a skill. No code change.** This
> is the core of the workshop's "extend the agent with one md file."

### The prerequisite gate — just a few-line Set

Forcing "read the etiquette before styling the map" is the prerequisite gate. It's just the Set
in `gate.ts` and the thin wrapper `requireSkill` in `tools/index.ts`:

```ts
function requireSkill(domain, suggestion, tool) {
    const inner = tool.execute;
    return {
        ...tool,
        execute: (input, options) => {
            if (!hasFetched(domain)) {
                return { error: `Fetch the '${suggestion}' skill with get_skill before using this tool. …` };
            }
            return inner(input, options);
        },
    };
}
```

When `get_skill` succeeds it `markFetched()`s that domain. Until the gate opens,
`update_map_style` / `update_chart_spec` **refuse with no side effects**. The gate is per chat
session — **New chat calls `resetGate()`** and it closes again.

> **The visible principle**: the gate (read the right etiquette first) combined with validation
> (reject mistakes; ch. 40) makes low-quality output **structurally hard to produce**. And
> skills don't only enforce — they **inject knowledge and raise accuracy itself** (the NaN fix
> in the observation). That's the effect of progressive disclosure under a finite context budget.

## ④ What the next chapter adds — evals (auto-guaranteeing this state)

By now the through-line prompt solves cleanly. But how do you **guarantee** it stays "solved"?
When you edit one skill, how do you **confirm** another prompt didn't break? The model is
non-deterministic, so a single eyeball pass isn't enough.

> **Chapter 60 (`main`) adds the evals harness.** Run the **real agent N times** on a fixed
> prompt and measure, as a **success rate**, whether it reaches the right end state (which tools
> ran, which tables/specs got built) every time. It verifies the **outcome**, not exact wording —
> the correct way to guard a non-deterministic agent.

## ⑤ Reading the diff — what the evals layer adds

```bash
git diff --stat chapter/04-skills..main
```

Files that mainly appear (this layer is small and self-contained):

- `src/evals/runEval.ts` — **new**. a harness that runs the real agent loop N times and reports
  a success rate.
- `src/evals/basic.eval.browser.test.ts` — **new**. two end-state assertions.
- `vitest.workspace.ts` — defines evals as a **separate vitest project** (injects the `.env` key,
  excluded from CI).
- `package.json` — adds the `test:evals` script.

Evals hit the real, paid Anthropic API, so they're kept out of `npm run check` and CI and only
run via `npm run test:evals`. Next chapter we actually run them and read the internals.

Next: [60. Evals — evaluation as the product](./60-evals.md).
