# Taking an AI Agent Apart — watching GIS × LLM assemble itself layer by layer

Participant curriculum for a 3-hour FOSS4G workshop.

This workshop uses `geo-chat`, a fully client-side SPA, to understand what an "AI agent"
actually is — **taken apart down to the level of API requests**. This time, though, you
don't _build_ the finished app. Instead, we ship **chapter branches** that each strip one
capability layer away, and you `git switch` between them to **watch the same GIS task
become progressively more solvable as each layer is added back**.

geo-chat combines browser-native DuckDB-WASM (SQL analytics), MapLibre GL (maps), and
Vega-Lite (charts) with Anthropic Claude as the agent. Ask in plain language —
"color the municipalities by prefecture and show them on the map" — and SQL runs and the
map is painted.

## The one problem running through every chapter (the through-line)

Across all chapters we throw the same single request at the agent:

```
自治体を都道府県ごとに色分けして地図に表示して
(Color the municipalities by prefecture and show them on the map)
```

- On **`chapter/00-chat-only`** (ch. 10) the agent only _talks_ about this — it paints nothing.
- Add layers and the same task becomes gradually solvable: **SQL runs but the map can't be
  painted → it paints but silently breaks → the break becomes a readable error → skills lift
  the quality.**
- On `main` (ch. 60) that "solved" state is guarded by **automated tests (evals)**.

**Same task, same model, same API key.** The only thing that changes is _which layers the
agent has_. So every difference you see is thanks to (or the fault of) a layer.

## Transfer goal

> The week after the workshop, a participant can **design their own "tools" and "skills"
> for their own data and work problems, wire them into an agent, and explain and debug its
> behavior at the level of API requests — not as magic.**

The goal is _transfer_ (applying it to a novel problem), not memorizing mechanics. This
material is trimmed to serve that one sentence. It is not an exhaustive API reference.

## Chapter map — doc × branch × the layer added × the observed change

Each chapter corresponds to a branch built by **subtracting** one layer at a time from
`main`. The numbers **line up with the branch names** (`00→10`, `01→20`, …) to prevent
off-by-one confusion.

| Chapter doc                         | Branch                  | The layer "still missing / added here"    | Observed change                                                                  |
| ----------------------------------- | ----------------------- | ----------------------------------------- | -------------------------------------------------------------------------------- |
| [10-chat-only](./10-chat-only.md)   | `chapter/00-chat-only`  | no tools at all                           | only talks; answers **confidently but wrong** from memory                        |
| [20-data](./20-data.md)             | `chapter/01-data`       | + data tools (SQL, built-in datasets)     | SQL runs and tables get built, but the **map can't be painted — it over-claims** |
| [30-viz-naive](./30-viz-naive.md)   | `chapter/02-viz-naive`  | + visualization tools (**no validation**) | 47-color choropleth works; but forced, a **silently broken map**                 |
| [40-validation](./40-validation.md) | `chapter/03-validation` | + validation layer                        | the same forcing returns a **readable error**, honestly reported                 |
| [50-skills](./50-skills.md)         | `chapter/04-skills`     | + skills + prerequisite gate              | a skill **fixes a real axis-order NaN bug**, legend-ready area choropleth        |
| [60-evals](./60-evals.md)           | `main`                  | + evals harness                           | the agent's **end state is auto-verified by success rate**                       |

> **About the number offset**: docs step by 10, branches start at 00. Match them by the
> **trailing name** — "10-chat-only ↔ `chapter/00-chat-only`". Each chapter opens with its
> exact `git switch` command.

## Timetable (3 hours)

Each chapter is 25 minutes. We open by showing the finished app (`main`), then **deliberately
strip every capability away** and add them back one layer at a time, observing as we go.

| Time      | Step / Chapter                                        | Focus                                                              |
| --------- | ----------------------------------------------------- | ------------------------------------------------------------------ |
| (prep)    | [00-setup](./00-setup.md)                             | clone / `npm i` / API key / practice switching branches            |
| 0:00–0:15 | Intro + finished demo (`main`)                        | See the "magic" first. Locate today within GeoAI                   |
| 0:15–0:40 | [10. The talk-only AI](./10-chat-only.md)             | No tools. Token prediction, statelessness, confident wrong answers |
| 0:40–1:05 | [20. The first tool and the loop](./20-data.md)       | Read `agent.ts`; narrate the API round-trips in DevTools; DuckDB   |
| 1:05–1:30 | [30. Visualization, no validation](./30-viz-naive.md) | Declarative specs. A forcing prompt exposes the "silent break"     |
| 1:30–1:55 | [40. The validation layer](./40-validation.md)        | The same break becomes a readable error. Validation = repair loop  |
| 1:55–2:20 | [50. A skill = one .md file](./50-skills.md)          | Progressive disclosure, the gate. A skill fixes a real bug         |
| 2:20–2:45 | [60. Evals — the product](./60-evals.md)              | `npm run test:evals`, read `runEval.ts`, write your own eval       |
| 2:45–3:00 | Closing + [70-beyond](./70-beyond.md) preview         | Transfer to your own work. Write your first tool's description     |

> **About 70-beyond**: the last 15 minutes are not for _finishing_ a challenge but for
> **choosing one, taking the first step, and writing a one-line closing**. The challenges
> themselves are deliberately large — meant to be **finished afterward at your own pace**.

### Appendices

- [appendix-prompts.md](./appendix-prompts.md) — a collection of development prompts for
  letting a coding AI implement the 70-beyond challenges (add a tool, add a skill, debug
  the agent).
- [appendix-troubleshooting.md](./appendix-troubleshooting.md) — API-key errors, CORS, the
  app not starting, a blank map, and **branch-switching gotchas**.

## Audience and prerequisites

- **Audience**: GIS engineers fluent in QGIS / PostGIS / GDAL who also write Python or JS.
  People who use ChatGPT or Copilot but feel that the insides of an "AI agent" are a black box.
- **Prerequisites**: SQL (SELECT / JOIN / GROUP BY), basics of spatial data (projections,
  geometry types), the command line, and basic **Git (especially `git switch` / `git diff`)**.
  No LLM internals required — that's what you're here to learn.
- **What you need**: a laptop that runs Node.js 20+, a modern browser (latest Chrome / Edge /
  Firefox), and an Anthropic API key (you'll get one in [00-setup.md](./00-setup.md)).

## The three layers of "prompt"

"Prompt" in this workshop splits into three layers. Distinguishing them up front keeps you
from getting lost.

| Layer                | What string it goes into                                                 | Example                                     | Where it shows up                              |
| -------------------- | ------------------------------------------------------------------------ | ------------------------------------------- | ---------------------------------------------- |
| ① Usage prompt       | typed into the finished geo-chat **chat box**                            | "color the municipalities by prefecture"    | the "② Observe" section of every chapter       |
| ② In-agent prompt    | **built into the app**: system prompt / tool descriptions / skill md     | "this tool runs exactly one SQL statement…" | **the main event.** Unpacked from ch. 20 on    |
| ③ Development prompt | given to a **coding AI** like Claude Code as implementation instructions | "add tool X to this repository"             | implementation for 70-beyond (in the appendix) |

Almost everything each chapter strips or adds is **layer ②** (system-prompt sections, tool
descriptions, skill md). _How you design ② so that ① works_ — that connection is the
subject of this workshop.

When you're ready, head to [00. Setup](./00-setup.md).
