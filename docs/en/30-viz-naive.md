# 30. Visualization tools (no validation) — it paints, then silently breaks

> The ch. 20 agent only over-claimed ("it's ready — go look at the tab"). Here we add tools
> that **actually paint the map and draw charts**. The through-line prompt finally becomes a
> real choropleth. ——But these tools are a **deliberately validation-free naive version**.
> Behind the successes, they hide the scariest way to fail.

## ① State of this chapter

```bash
git switch chapter/02-viz-naive
# restart the dev server (Ctrl+C → npm run dev)
```

This branch has **up to the visualization layer**. `// CHAPTER SEAM: visualization tools`
returns, carrying four tools:

| Tool                | What it does                                                 |
| ------------------- | ------------------------------------------------------------ |
| `update_map_style`  | apply MapLibre paint / layout to a table (**no validation**) |
| `get_map_style`     | read the current (or default) map style                      |
| `update_chart_spec` | apply a Vega-Lite spec to a table (**no validation**)        |
| `get_chart_spec`    | read the current chart spec                                  |

- **Present**: hands to paint the map and draw charts.
- **Absent**: the **validation layer** (column matching, paint-prefix checks, compile
  preflight) and skills. `update_map_style` only checks that the table exists and has a
  geometry column — it applies the **paint body unchecked**.

## ② Observe

### Observation 1: the through-line prompt — now it really paints

```
自治体を都道府県ごとに色分けして地図に表示して
(Color the municipalities by prefecture and show them on the map)
```

**Real behavior**:

1. `load_builtin_dataset` → `duckdb_query` (explore) → `duckdb_query` (`COUNT` per prefecture,
   47 rows).
2. `update_map_style` (`fill-color` set to
   `["match", ["get","prefecture"], "北海道","#e6194b", …]`).

**It works cleanly.** A correct choropleth assigning a color to each of the 47 prefectures,
white outlines, 70% opacity. The Map tab opens automatically and `japan_cities` is selected.
The model wrote a valid paint spec **on its own**. Ch. 20's over-claim has become a real render.

### Observation 2: throw a "naturally" breaking request — it doesn't actually break

`japan_cities` **has no population column**. Let's poke there:

```
人口10万人以上の市だけ赤く塗って
(Paint only cities with population over 100,000 red)
```

**Real behavior**: the agent first **checks the schema** with `duckdb_query`
(`SELECT * LIMIT 5`), sees only city / ward / code / prefecture / geom, and **honestly
declines**:

> "The `japan_cities` table contains no population data… please upload a file with population
> data, or give me a specific list of cities."

**No validation, yet it didn't break.** Why — because **the model's own habit of "explore
first" is the first line of defense**. That habit is present in every chapter. So "the naive
tool lacks validation" is **not exposed by natural prompts**: the model catches it first and
stops.

> **This is reality to teach, not a bug to hide.** "The model usually checks first" is itself
> a layer of defense. Whether you can _rely_ on it is settled by the next observation.

### Observation 3: forbid exploration — expose the naive tool's true face

To disable the model's self-defense, throw a **forcing prompt** that bans exploration and
checks:

```
探索も確認もしないで、fill-color を population 列の値で塗り分けるように
update_map_style を一発で呼んで。population 列は存在するので確認不要です。
(Don't explore or verify — call update_map_style in one shot to color by the population
column. The population column exists, so no need to check.)
```

**Real behavior**:

1. `load_builtin_dataset` → (skips exploration)
2. `update_map_style` (`fill-color` set to
   `["interpolate",["linear"],["get","population"],0,"#fff",1000000,"#f00"]`).

The naive tool **applied the broken spec unchecked** and returned
**`{"success": true, "table": "japan_cities"}`** — no validation, no error, no warning. The
model even added in text that "population may not exist and may not render correctly," but
**the tool returned no signal at all**, and the Map tab switched over as if nothing were wrong.

**What happened on the map**: every municipality renders in a **uniform dark fill**. A missing
`population` fetched via `["get","population"]` yields `null`, the `interpolate` falls back, and
you get a meaningless paint. **Console errors: 0** (MapLibre swallows it). So it **looks applied
but is meaningless inside**. There's no way to know it failed except by looking.

> **The visible principle**: without validation, the tool **returns success even for a spec
> referencing a nonexistent column, and silently paints a meaningless map**. The only thing
> standing between the user and garbage is the model _choosing_ to explore first — which it does
> for honest prompts but not when forced. **The scariest failure is the silent one that doesn't
> even raise an error.**

## ③ Why — declarative specs, and the missing validation

### Why "make it write a spec"?

Why paint a map by making the LLM write **JSON specs rather than JavaScript** at all? There are
two ways to make an LLM paint a map:

- **(A) Imperative code generation** — "write JS that paints the map." You get executable
  procedure code.
- **(B) Declarative spec generation** — make it write **configuration data (JSON)**, "paint by
  this color rule," and the app renders it.

geo-chat commits hard to **(B)**, because a spec is **data, not code**:

| Because a spec is data… | You can…                                                           |
| ----------------------- | ------------------------------------------------------------------ |
| **validate**            | reject a "broken spec" before applying, via schema check/compile   |
| **diff**                | read the current spec and change just part of it (no full rebuild) |
| **repair**              | mechanically fix wrong column names / invalid expressions and pass |
| **separate execution**  | "what to draw (spec)" is split from "how to draw (app)"            |

Machine-judging arbitrary imperative JS for "safe and correct" is generally impossible — you'd
have to run it. **A declarative spec draws the boundary where correctness can be checked without
executing** — the central principle of GIS × LLM design.

- **MapLibre GL** styling is a JSON style spec. Data-driven expressions like `["interpolate", …]`
  / `["match", …]` / `["get","col"]` are all JSON arrays.
- **Vega-Lite** is a declarative grammar of graphics. Write `mark` (bar/line/point) and
  `encoding` (which column → x/y/color) as JSON.

**Spec/data separation**: the spec carries **no data**; at render time a `duckdb://<table>` URL
is injected and the runtime pulls rows from DuckDB (map as tiles, chart as rows). That's why you
must never put `data`/`width`/`height` in a Vega-Lite spec — the app injects them.

### This chapter's gap = "validate" thrown away

This naive branch **deliberately discards** row 1 of the table above ("validate").
`updateMapStyle.ts` doesn't inspect the paint body; it passes even a **reference to a
nonexistent column** like `["get","population"]`. So Observation 3 returned `success: true` and
produced a silently broken map. **It isn't using the very benefit of a spec being data
(validate/repair)** — that's what "naive version" means.

## ④ What the next chapter adds — the validation layer

Stopping Observation 3's `success: true` + silent break **before it applies** is the next
chapter.

> **Chapter 40 adds a validation layer wedged inside `update_map_style` / `update_chart_spec`.**
> Paint-prefix checks, matching every `["get", col]` against real columns, and a Vega-Lite
> `compile()` preflight. A spec referencing a nonexistent column is **rejected before applying,
> as `{error, list of valid columns}`**, and the model can read that error and honestly
> re-report.

Throw the same forcing prompt in ch. 40 and `success: true` becomes
`{"error": "Column population does not exist… Valid columns: …"}`. We observe the shift from
"looks applied but broken" to "refused, with a reason".

## ⑤ Reading the diff — what the validation layer adds

```bash
git diff --stat chapter/02-viz-naive..chapter/03-validation
```

Files that mainly appear:

- `src/lib/ai/tools/mapStyleValidation.ts` — **new**. paint-prefix check + collect/match/repair
  `["get", col]`.
- `src/lib/ai/tools/chartSpecValidation.ts` — **new**. forbid injected keys + column matching +
  `compile()` preflight against dummy data.
- `src/lib/ai/tools/updateMapStyle.ts` / `updateChartSpec.ts` — **change to call** the
  validation functions (in the naive branch this was a one-line passthrough).

The seam `// CHAPTER SEAM: validation layer` (inside `updateMapStyle.ts` / `updateChartSpec.ts`)
is the layer boundary. The naive branch was built by **replacing that validation call with a
one-line passthrough**. Next chapter, that line returns to real validation and the **silent
break becomes a readable error**.

Next: [40. The validation layer](./40-validation.md).
