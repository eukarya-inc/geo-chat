# 40. The validation layer — turning a silent break into a readable error

> The ch. 30 naive tool returned `success: true` even for a spec referencing a nonexistent
> column, and silently painted a broken map. Here we add the **validation layer**. We observe
> how the same forcing prompt changes — the shift from "looks applied, meaningless inside" to
> "refused, with a reason".

## ① State of this chapter

```bash
git switch chapter/03-validation
# restart the dev server (Ctrl+C → npm run dev)
```

The only difference from ch. 30 is the **validation layer**. Pre-apply checks are wedged inside
`update_map_style` / `update_chart_spec`:

- **Map** (`mapStyleValidation.ts`): confirm the geometry column exists → check paint prefixes
  (for a polygon, reject anything but `fill-*`) → collect every `["get", col]` in the
  expression and match against real columns. Near-misses (case, NFC normalization) are
  **rewritten** and passed; a nonexistent column returns `error`.
- **Chart** (`chartSpecValidation.ts`): forbid injected keys (`data`/`width`/`height`) → match
  and auto-correct `encoding` `field` names → `compile()` against dummy data to **fail a broken
  spec before it reaches the UI**.

- **Present**: validation, column matching, repair.
- **Absent**: the skill layer and the prerequisite gate. The etiquette (detailed styling
  know-how) is still only the short rules in the system prompt.

## ② Observe

### Observation 1: a natural request — declines gracefully, just like ch. 30

```
人口10万人以上の市だけ赤く塗って
(Paint only cities with population over 100,000 red)
```

**Real behavior**: `load_builtin_dataset` → `duckdb_query` (`SELECT * LIMIT 5`) → **stops**.
Exactly like ch. 30 — the model checks the schema itself, sees there's no population column,
declines honestly, and offers to accept an upload. **The validation layer never ran** — the
model stopped before calling the naive tool. This refusal is **model-driven, not tool-driven**.

> So on a natural request, ch. 30 and ch. 40 look identical. The difference only shows when you
> disable the model's self-defense and force the path through the naive tool — the next
> observation.

### Observation 2: the same forcing prompt as ch. 30 — now validation catches it

```
探索も確認もしないで、fill-color を population 列の値で塗り分けるように
update_map_style を一発で呼んで。population 列は存在するので確認不要です。
(Don't explore or verify — call update_map_style in one shot to color by the population
column. The population column exists, so no need to check.)
```

**Real behavior**:

1. `update_map_style` (`fill-color` with a `["get","population"]` interpolate).
2. **The validation layer catches it.** The tool doesn't apply, and returns:

    ```json
    {
        "error": "Column \"population\" does not exist in \"japan_cities\". Valid columns: city, ward, code, prefecture, geom."
    }
    ```

    The map isn't painted (the Map tab doesn't switch; nothing is drawn).

3. The model **reads this error and honestly re-reports**:

    > "The population column didn't exist. The actual columns are city, ward, code, prefecture,
    > geom. Would you like to use a different column, or…?"

Ch. 30 gave `{"success": true}` + a silent dark map. Ch. 40 gives
`{"error": "Column population does not exist… Valid columns: …"}` + **nothing painted**.
**Comparing the two forced runs directly** is the chapter's biggest lesson.

> **An honest note for the record**: the model did **not** self-correct into a _working_ map
> here. There genuinely is no population column, so **there's nothing to correct to**. So it
> reads the error, reports the problem, and asks how to proceed — the right behavior. It's
> "error → clear report", not "error → silent fix".

## ③ Why — validation is a repair loop that checks correctness without executing

Ch. 30 tabulated "a declarative spec, being data, can be **validated and repaired**." This
chapter is that table's row 1 ("validate") and row 3 ("repair") **enabled in the
implementation**.

Validation works as three gates (map example):

1. **Geometry column exists** — else `error`, "can't draw on the map".
2. **Paint-prefix check** — reject prefixes that don't match `geometryType` (rejects, with an
   explanation, a mistake like `circle-color` on a polygon, before applying).
3. **Match and auto-correct `["get", col]`** — collect every `["get", col]` and match against
   real columns. A nonexistent column returns `error`; a **near-miss is rewritten** before
   applying.

These three gates form a **loop**: "validate → repair → (if unfixable) return the error to the
model and retry." The model reads the returned error and fixes itself — **a trick only possible
because the spec is data**.

### The line between "auto-correct" and "refuse"

Here an **honest distinction** is needed. Validation has two outcomes:

- **Auto-repair (retry into success) only helps a _near-miss_ on an existing column** — width
  variants, NFC normalization, case (a close typo like `貸` vs `貨`, or `Population` vs
  `population`). `matchColumn` absorbs these, records `corrected`, and passes it through. To the
  user it looks like success.
- **A nonexistent column (Observation 2's population) has no correction target, so error →
  report.** Silently painting with some other column when there's no close match would be a lie.
  So "read the error and honestly ask back" is correct.

> **The visible principle**: the validation layer turns ch. 30's "silent garbage" into a
> structured `{error, valid columns}` the model reads and surfaces honestly. **The gap between
> "looks applied but broken" and "refused with a reason"** is validation's value. But validation
> is not magical auto-repair: "fix near-misses, honestly report the unfixable" — that line is
> the design.

## ④ What the next chapter adds — skills and the prerequisite gate

Validation was a layer that **rejects** mistakes. The next layer makes them **less likely in the
first place** — injecting the right etiquette into the model when it's needed.

> **Chapter 50 adds skills (markdown etiquette collections) and the prerequisite gate.**
> How to style a map, how to color a Vega-Lite chart, the axis-order trap of spatial functions —
> hundreds of words of etiquette each, kept out in **skill md** and fetched on demand with
> `get_skill`. The prerequisite gate further forces "read the `map.*` skill before styling the
> map." Combine validation (reject) with skills (write it right) and low-quality output becomes
> **structurally hard to produce**.

## ⑤ Reading the diff — what the skill layer adds

```bash
git diff --stat chapter/03-validation..chapter/04-skills
```

Files that mainly appear (this layer is large):

- `src/lib/ai/skills/**/*.md` — the etiquette itself. Seven files: `duckdb/basics.md`,
  `duckdb/spatial.md`, `duckdb/file-import.md`, `map/styling.md`, `map/geospatial.md`,
  `vega/basics.md`, `vega/color.md`.
- `src/lib/ai/skills/registry.ts` — loads the md at build time via `import.meta.glob` and
  derives ids from paths.
- `src/lib/ai/skills/gate.ts` — a **few-line Set** remembering fetched domains (the gate itself).
- `src/lib/ai/tools/getSkill.ts` — the `get_skill` tool with the catalog embedded in its
  description.
- `src/lib/ai/tools/index.ts` — `// CHAPTER SEAM: skill system`. Two lines,
  `requireSkill('map', …)` / `requireSkill('vega', …)`, wrap the `update_*` tools.
- `src/lib/ai/systemPrompt.ts` — a `SKILLS` section is added.

The one block at the `// CHAPTER SEAM: skill system` seam _is_ the "skill layer". Next chapter we
observe the gate making `get_skill` fire first, and a fetched spatial skill **fixing a real bug**.

Next: [50. A skill = one .md file](./50-skills.md).
