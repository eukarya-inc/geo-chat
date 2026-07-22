# 06. A skill = one md file

> In chapter 05 we learned that "there are conventions to the map and chart specs." The mechanism that hands those
> conventions to the model **only when needed** is a "skill." A skill is **a single Markdown file.**
> This chapter takes the mechanism apart and **has you write your own skill to make the agent smarter.**

## ① Concept — context is a finite resource, so: progressive disclosure

The context you can hand an LLM (system prompt + conversation + tool definitions) has an upper limit.
And it is not the case that "the more you hand it, the smarter it gets" — **piling on masses of irrelevant
information actually buries the important instructions and lowers quality.** Context is a scarce resource.

Here a contradiction arises. How to color a map, how to assign colors in Vega-Lite, the projection traps of spatial
functions… to have the agent do work **accurately**, each of these needs several hundred words of detailed
convention. But if you keep all of that piled into the system prompt permanently, the context saturates.

The solution is **progressive disclosure**:

> Keep the detailed knowledge outside, as **skills**, and have the model go fetch **only the ones relevant to the
> task, at the moment it's needed**, with the `get_skill` tool.

The system prompt says only "the detailed how-to is in the skills; fetch them if needed," and the catalog
(what skills exist) is embedded in the `description` of `get_skill`. The model judges for itself "fetch the map
skill before coloring a map" and fetches it. This is the knowledge version of chapter 03's tool round-trip loop.

## ② Where to read the code

### The skill file format — `src/lib/ai/skills/**/*.md`

A skill is Markdown with frontmatter. Example (the top of `src/lib/ai/skills/map/styling.md`):

```markdown
---
description: REQUIRED before styling the map — TableMapStyle shape, paint per geometry, ...
tasks: 地図, 地図スタイル, 色分け, スタイル, map, map style, choropleth, 塗り分け, ポイント, ...
---

## Styling the map with update_map_style

(the body starts below here: detailed conventions for using update_map_style)
```

The 3 frontmatter fields and **how the id is determined** are implemented in `src/lib/ai/skills/registry.ts`:

- **`description`** — the one-line description shown in the catalog. The trick is to write **when it is needed**, as in
  "REQUIRED before …".
- **`tasks`** — routing keywords (English + Japanese). Listed alongside in the catalog, they are the clue by which the
  model picks "this skill for this task."
- **`deps`** (optional) — the ids of prerequisite skills that should be fetched together with this one
  (e.g. `map.geospatial` has `deps: map.styling, duckdb.spatial`).
- **`body`** — the text below the frontmatter. This is the content handed to the model when fetched.

**The id is generated automatically from the file path.** `idFromPath()` in `registry.ts`:

```ts
// './duckdb/spatial.md' → 'duckdb.spatial'
export function idFromPath(path: string): string {
    return path.replace(/^\.\//, '').replace(/\.md$/, '').replace(/\//g, '.');
}
```

And the **first segment** of the id (the `duckdb` of `duckdb.spatial`) is the **domain**, which is the unit of the
prerequisite gate described below (`domainOf()`). The files are **bulk-loaded at build time** by
`import.meta.glob('./**/*.md', { eager, query: '?raw' })`.

> **In other words: drop in one `<domain>/<name>.md` and a skill is added. No code change needed.**
> This is the heart of this workshop's "extend the agent with one md file."

### The catalog and fetching — `src/lib/ai/tools/getSkill.ts`

The `description` of `get_skill` has **the catalog of all skills embedded in it**
(`buildCatalog()` generates `- <id> — <description> [tasks]` one line at a time).
The model reads the description, picks "the id needed for the current task," and calls `get_skill`.
`resolveWithDeps()` automatically traces the `deps` and returns the bodies together.

### The prerequisite gate — `src/lib/ai/skills/gate.ts` + `tools/index.ts`

What enforces "before coloring a map, read the conventions first" is the **prerequisite gate.** Its substance is a
**Set of just a few lines** in `gate.ts`:

```ts
const fetchedDomains = new Set<string>();
export function markFetched(domain: string) {
    fetchedDomains.add(domain);
}
export function hasFetched(domain: string) {
    return fetchedDomains.has(domain);
}
export function resetGate() {
    fetchedDomains.clear();
}
```

When `get_skill` succeeds, it `markFetched()`s the domain of the fetched skill (`getSkill.ts`). Then the thin
wrapper `requireSkill` in `tools/index.ts` **refuses the tool's `execute` with no side effects** until the gate opens:

```ts
function requireSkill(domain, suggestion, tool) {
    const inner = tool.execute;
    return {
        ...tool,
        execute: (input, options) => {
            if (!hasFetched(domain)) {
                return { error: `Fetch the '${suggestion}' skill with get_skill before using this tool. ...` };
            }
            return inner(input, options);
        },
    };
}
```

At the registration side, `update_map_style` requires `map` and `update_chart_spec` requires `vega`:

```ts
update_map_style:  requireSkill('map',  'map.styling',  createUpdateMapStyleTool(ctx)),
update_chart_spec: requireSkill('vega', 'vega.basics',  createUpdateChartSpecTool(ctx)),
```

The gate is per chat session. **Starting a New chat calls `resetGate()`** (the `reset` in `useAgentChat.ts`) and it
closes again.

## ③ Break-it experiment #6 — ask for a complex map without a skill

See with your own eyes "why the prerequisite gate raises quality."

1. Press **New chat** at the top right of the chat (the gate is reset, and `map` is in the not-yet-fetched state).
2. Right away, throw a complex request that requires conventions:

    ```
    japan_cities を人口で 5 段階に塗り分けて、凡例が分かるコロプレスにして
    ```

    (English: "shade japan_cities by population into 5 classes, as a choropleth with a legend.")

3. **Observation**: When the model (after exploring) calls `update_map_style`, the tool **returns an error and
   refuses** — "fetch the `map.styling` skill first." Open this `tool_result` in the tool card in the chat and read
   the refusal message.
4. The model reads it and **calls `get_skill(["map.styling"])` itself** (a skill-id badge appears on the tool card).
   Having fetched the conventions (paint prefix, direct `["get"]` access, `interpolate` color ramps, etc.), it
   **calls `update_map_style` again and succeeds.**

> **The principle you can see**: The gate enforces "read the correct conventions" before "writing knowledge from
> guesswork." Combined with chapter 05's validation (rejecting mistakes), **low-quality output becomes structurally
> less likely.** This is the effect of progressive disclosure under a finite context resource.

## ④ Hands-on exercise — write one skill of your own

Confirm with your own hands that **just adding one md file** makes the agent smarter.
As an example, we make a heatmap skill `map/heatmap.md` (a standard procedure from your own work is fine too).

### Template (save as `src/lib/ai/skills/map/heatmap.md`)

```markdown
---
description: Point-density heatmap representation — the paint for a heatmap layer and when to use it
tasks: heatmap, density, hotspot, ヒートマップ, 密度, ホットスポット
deps: map.styling
---

## Representing points as a heatmap

When you want to show the "density" of many points, use a heatmap rather than individual circles.
(This app's map layers are point→circle / line→line / polygon→fill by default, so the conventions for using
a heatmap are stated explicitly here. First confirm the target is points.)

- In zoom bands where you want to emphasize density, use the `heatmap-*` family of paint.
- To weight by value, use ["get", "<numeric column>"] for heatmap-weight.
- If you also want to show the raw points, consider a design that switches to circle display on zoom-in.

(Write here, concretely, the procedure / colors / threshold guidance you write every time in your own work.)
```

> Note: The template above is a minimal example for learning "how to write a skill." Actually drawing a heatmap
> requires the corresponding layer implementation, but the aim of this exercise is to **feel that "dropping in an md
> changes the catalog and the behavior."** The most instructive thing is to write one "analysis recipe you repeat in
> your own work" as `<domain>/<name>.md`.

### Applying and confirming

Since skills are loaded by a build-time glob, after adding a file **restart the dev server**
(`Ctrl+C` → `npm run dev`). Confirmation steps:

1. Start a New chat and type a request about density (e.g. "show me the hotspots of ◯◯").
2. Open the `get_skill` tool card and confirm that **your new skill id (e.g. `map.heatmap`) has been added to the
   catalog.**
3. Observe whether the model fetches that skill and behaves according to the conventions you wrote in the body.
   Confirm that the behavior changes before and after adding the skill.

## ⑤ Development prompt example

A prompt example for having the AI draft a skill that you then finish yourself:

```
Modeling it on the existing skills in src/lib/ai/skills/ (map/styling.md, duckdb/spatial.md),
write a new skill <domain>/<name>.md.
- The frontmatter is description / tasks (English + Japanese keywords) / deps if needed.
- The body includes "when to use it," "concrete SQL / spec shapes," and "common mistakes and how to fix them."
- Target task: <a description of an analysis you repeat in your work>
Output it as one Markdown file. No code change needed (it's auto-registered by the glob).
```

More on skill templates is also in [appendix-prompts.md](./appendix-prompts.md).

Next is [07. Challenge and articulation](./07-challenge.md). We apply the "tool design" and "skill design" learned so
far to **your own data and work problems.** The end is not an explanation but a question: "write, in one sentence,
the `description` of your first tool."
