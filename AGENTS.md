# AGENTS.md

Guidance for AI coding agents (Claude Code, claude.ai/code, etc.) working in this repository.

## What this project is

geo-chat is **FOSS4G workshop teaching material** for learning how AI agents work by
building a GIS agent. It is a fully client-side React SPA (no backend): DuckDB-WASM runs
SQL in the browser, MapLibre GL draws maps, Vega-Lite draws charts, and an Anthropic
Claude agent loop ties them together. The user supplies their own Anthropic API key,
which stays in the browser.

**Because this is teaching material, optimize for readability over cleverness.** Small,
well-named modules that a workshop participant can read on one screen beat compact
abstractions. Keep code generic (works for any dataset/JSON shape), never dataset-specific.
The workshop curriculum lives in docs/ (ja + en); the README Roadmap section tracks known gaps.

## Development Commands

- `npm run dev` — Vite dev server (host 0.0.0.0)
- `npm run build` — `tsc -b` then `vite build`
- `npm run check` — format (write) → lint (quiet) → typecheck → unit tests (silent). Run this after any change.
- `npm test` / `npm run test:unit` — unit tests only (jsdom, fast)
- `npm run test:browser` — browser tests (Playwright/webkit; DuckDB-WASM, MapLibre, MVT)
- `npm run test:full` — unit + browser (what CI runs)
- `npm run lint` / `npm run typecheck` / `npm run format` / `npm run format:check`

**Always run `npm run check` before considering a task complete.** It auto-formats with
Prettier, then fails on any ESLint error, type error, or failing unit test.

## Git Workflow

**Never push directly to `main`.** A pre-push hook rejects it.

1. Branch: `git checkout -b feature/your-feature`
2. Commit your changes
3. `git push origin feature/your-feature`
4. Open a PR for review

## Architecture

```
src/
  components/
    chat/        # ChatPanel + MessageView (renders AI SDK message parts + markdown)
    workspace/   # WorkspacePanel tabs: Table / Chart / Sql, TablePicker
    map/         # MapPanel (MapLibre) + mapLayers
    chart/       # VegaLiteChart
    settings/    # SettingsDialog (API key + model)
    ui/          # shadcn/ui primitives (new-york)
  lib/
    ai/          # agent loop, system prompt, tools, skills
    duckdb/      # single serialized connection + file/URL import
    map/         # MVT pipeline + duckdb:// tile protocol
  store/         # jotai atoms
public/data/     # sample Parquet (japan_cities, japan_prefectures)
docs/            # workshop curriculum (Japanese now, English later)
```

### DuckDB layer (`src/lib/duckdb`)

- `globalDB.ts` initializes DuckDB-WASM once with the **spatial extension** loaded.
- `db.ts` is the single point of DB access: **one shared connection**, and every
  statement is **serialized through a promise-chain queue** (`enqueue`) because
  DuckDB-WASM is effectively single-threaded. `executeQuery` returns rows/columns/timing;
  `getTileBytes` returns raw MVT bytes (bypassing Arrow→JS conversion). `createTableFromUrl`
  fetches a remote file, registers it as an in-memory virtual file (so any format works
  cross-origin without httpfs), and picks the reader by extension. `arrowConverter.ts` and
  `bomUtils.ts` handle Arrow value coercion and BOM-in-CSV-header cleanup.

### Map layer (`src/lib/map`)

- Browser-side vector tiles: `tileProtocol.ts` registers a MapLibre `duckdb://` protocol.
  When MapLibre requests `duckdb://<table>/{z}/{x}/{y}.mvt`, it runs a `ST_AsMVT` query
  (`mvtQuery.ts`) against DuckDB and returns the bytes, cached per-table (`tileCache.ts`).
- `geometry.ts` detects the geometry column and computes lon/lat bounds. `mapSpec.ts`
  defines `TableMapStyle` (the declarative paint/layout spec stored per table).
- Call `invalidateTable(table)` when a table's data changes to drop cached schema + tiles.

### AI layer (`src/lib/ai`)

- `agent.ts` — `runAgent` runs **one assistant turn** via AI SDK v6 `streamText` with
  `stopWhen: stepCountIs(30)`: the model calls tools, reads results, calls more, until it
  answers without a tool call. It uses `anthropic-dangerous-direct-browser-access` (only
  OK because the user brought their own key) and translates the rich stream into five
  simple `AgentEvent`s. `useAgentChat.ts` drives the loop from the UI.
- `systemPrompt.ts` — concise generic GIS-assistant prompt; live date + table schemas are
  appended each turn.
- `tools/index.ts` — the 8-tool registry: `duckdb_query`, `load_builtin_dataset`, `get_skill`,
  `update_map_style`, `get_map_style`, `update_chart_spec`, `get_chart_spec`, `geocode_address`.
  Built-in sample datasets are declared in `builtinDatasets.ts` (the system prompt lists them and
  the model loads one with `load_builtin_dataset`). Tools close
  over a `ToolContext` (`toolContext.ts`) so they touch app state without importing React.
- **Prerequisite gate** (`skills/gate.ts` + `requireSkill` in `tools/index.ts`): a tiny
  module-level `Set` of fetched skill _domains_. `update_map_style` needs a `map.*` skill
  and `update_chart_spec` needs a `vega.*` skill fetched first, or they short-circuit with
  an error telling the model which skill to `get_skill`. This is intentionally minimal —
  it's taught as "the whole gate is these few lines".

### Skill system (`src/lib/ai/skills`)

The workshop's centerpiece: **drop a `<domain>/<name>.md` file in this folder and the agent
gains a new skill — no code changes.** `registry.ts` loads every `*.md` at build time via
`import.meta.glob('./**/*.md', { query: '?raw' })`.

- **id** is derived from the path: `duckdb/spatial.md` → `duckdb.spatial`. The first
  segment (`duckdb`) is the **domain** used by the gate.
- **Frontmatter** (between `---` fences):
    - `description:` — one-line catalog text (shown in the `get_skill` tool description)
    - `tasks:` — comma-separated routing keywords (English + Japanese)
    - `deps:` — comma-separated skill ids fetched alongside this one (optional)
- The markdown **body** below the frontmatter is the instructions served to the model.

### State (`src/store`)

Plain **jotai** atoms, in-memory (nothing persists except API key + model in localStorage).
`atoms.ts`: `tablesAtom`, `selectedTableAtom`, `activeTabAtom` (AI tools switch tabs to
reveal output), `chartSpecsAtom`, `mapStylesAtom` (both keyed by table name, without
data/width/height which are injected at render), `refreshTablesAtom`. `settings.ts`:
`apiKeyAtom`, `modelAtom`, `MODEL_OPTIONS`, `DEFAULT_MODEL`.

## Critical gotchas (still apply)

### MapLibre property access

Feature properties are accessed with **direct** `["get", "column"]` only:

- CORRECT: `["get", "population"]`
- WRONG: `["get", "properties", ["get", "population"]]` — never wrap in a `properties` accessor

This rule is stated in the system prompt, the `map.styling` skill, and enforced by
`update_map_style` validation. Keep all three consistent if you touch it.

### Coordinate system

The map pipeline expects geometry in **WGS84 (EPSG:4326), lon/lat order**. `mvtQuery.ts`
transforms 4326→3857 for tiles. When building geometry from coordinates (e.g. points from
lon/lat columns, geocoding results), keep it in EPSG:4326 or the map places it wrong.

### Vector tiles need geometry

A table renders on the map only if it has a geometry column that `geometry.ts` can detect.
In Vega-Lite specs, never set `data`/`width`/`height` — the app injects them.

## Testing conventions

- `*.test.ts(x)` — **unit tests**, run in jsdom (Node). Pure logic, transforms, component
  logic without browser-only APIs. Setup: `src/test/setup.ts`.
- `*.browser.test.ts` — **browser tests**, run in Playwright/webkit. Use for anything that
  needs DuckDB-WASM, MapLibre GL, MVT processing, WebAssembly, or other browser-only APIs.
- Tests live alongside the source they cover. `npm test` runs unit only (fast loop);
  `npm run test:full` (CI) adds browser tests.
- `*.eval.browser.test.ts` — **evals** (see below), a separate vitest project that is
  excluded from `test:browser` and CI. Run only with `npm run test:evals`.

## Chapter branches & evals

The workshop is taught as an **observation** workshop: the curriculum walks through
chapter branches that are each `main` minus one capability layer, created by
**subtracting** features (deleting files + a few obvious lines), never by adding them.
`main` is the full app (all tools + the evals capstone). The exact branch set is
finalized in later tasks; the point here is that the code is structured so subtraction
is clean.

- **`// CHAPTER SEAM: <layer>` comments** mark where a chapter branch drops a whole
  capability. They live in `src/lib/ai/tools/index.ts` (`createTools` composes the tool
  registry from clearly grouped `dataTools` / `visualizationTools` / `skillSystem`
  sections), in `src/lib/ai/systemPrompt.ts` (the prompt is assembled from named CORE /
  DATA / VISUALIZATION / SKILLS sections), and — for the validation layer — as
  `// CHAPTER SEAM: validation layer` in `updateMapStyle.ts` / `updateChartSpec.ts`,
  where the fuzzy-column-correction + `compile()` preflight + paint-prefix checks are
  extracted into `mapStyleValidation.ts` / `chartSpecValidation.ts` so a "naive" branch
  can replace the call with a one-line passthrough. Keep seams and the registry comment
  table in sync when you touch these files.
- **`src/evals/`** is the ch6/main capstone: a small, readable harness (`runEval.ts`)
  that drives the **real** agent loop against the **real** Anthropic API headlessly in
  the browser test env, plus `basic.eval.browser.test.ts` (a couple of end-state
  assertions over N runs). Evals **cost real money**, so they are a separate vitest
  project run only via `npm run test:evals` — never in `npm run check`, `test:browser`,
  or CI. The key is read from `VITE_ANTHROPIC_API_KEY` / `ANTHROPIC_API_KEY` (the
  gitignored `.env` at the repo root; injected via `vitest.workspace.ts` `define`), and
  the suite **skips cleanly** when no key is present. Tune with `VITE_EVAL_RUNS` and
  `VITE_EVAL_THRESHOLD`.
