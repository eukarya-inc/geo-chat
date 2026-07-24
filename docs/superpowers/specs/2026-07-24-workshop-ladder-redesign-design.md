# Workshop redesign: the capability ladder

**Date**: 2026-07-24
**Status**: Draft for review
**Scope**: `docs/en/`, `docs/ja/`, plus two small app changes (`src/lib/ai/toolTiers.ts` new, `src/lib/ai/systemPrompt.ts` restructured)

## Motivation

The current curriculum is an _anatomical dissection_: each chapter owns one component of a
finished agent (loop, tools, specs, skills), and each break-it experiment is deliberate
sabotage of working code. It teaches well, but the chapters are organized around the app's
architecture rather than around the participant's question — _"how do I make an agent good
with my geospatial data?"_

This redesign restructures the workshop as a **failure-driven capability ladder**. The agent
starts bare and gains one tier of capability per chapter. Every chapter ends with a real
geospatial request that genuinely breaks the current tool stack — an organic failure, not
sabotage — and the next chapter adds the piece that fixes it. The workshop closes with a
transferable design theory: specialized vs. general-purpose tools, low floor / high ceiling,
and "start general, log behavior, then specialize."

All of the current material's strongest assets survive: the fail-first philosophy, the
DevTools archaeology, the statelessness surprise, the token-prediction framing, the
3-layers-of-prompt terminology, every hands-on exercise, and both appendices. They are
re-sequenced under a new spine, not discarded.

## Transfer goal (revised)

> The week after the workshop, a participant can **curate the right tool stack for their own
> geodata** — knowing when a general-purpose tool is enough, when a knowledge gap calls for a
> skill, and when a task deserves a specialized, validated tool — and can **explain and debug
> the agent's behavior at the level of API requests.**

Learning outcomes (README bullets):

- experimented with an agent at every tier of capability, from a bare model to a full
  geospatial tool stack, and watched each tier fail on a real geospatial request
- learned to extend an agent's capability with skills (one markdown file) and specialized
  tools (description + schema + validation), and to enforce conventions with a gate
- gained an intuition for the trade-offs: specialized vs. general-purpose tools,
  low floor vs. high ceiling, and how to evolve a tool stack from logged behavior

## The ladder: 5 chapters named by what the agent has

| Ch  | File                         | The agent has                                                                                   | Core experience                                                                                                                                                                                                                                                                                                                    | **Where this fails** (chapter-ending handoff)                                                                                                                                  |
| --- | ---------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `01-bare-model.md`           | LLM + loop, zero tools                                                                          | Finished-app demo as a preview of hour 3 → "same Claude as ChatGPT — so what's different?" → run the tier-0 agent: all talk, no hands → tool calling is a learned token format                                                                                                                                                     | It can describe the SQL it _would_ run, but cannot touch data, and sometimes leaks tool-call-shaped XML as prose                                                               |
| 2   | `02-general-purpose-tool.md` | + `duckdb_query`, `load_builtin_dataset`                                                        | Participants write SQL by hand first (know the substrate), then delegate: text-to-SQL, joins, aggregation pushed into the tool; DevTools archaeology — count round trips, statelessness proof; SQL error → self-correction                                                                                                         | Spatial request → **degrees-vs-meters garbage** (`ST_Area` on 4326, `ST_DWithin` with meters passed as degrees). High ceiling, but the model lacks _knowledge_, not capability |
| 3   | `03-skills.md`               | + `get_skill` + skill files                                                                     | Fatten-the-system-prompt band-aid vs. progressive disclosure; the same broken query now fetches `duckdb.spatial` and produces correct project → measure → 4326 SQL; hands-on: write your own skill md                                                                                                                              | The numbers are right but **trapped in text** — the agent has no way to draw a map or chart                                                                                    |
| 4   | `04-specialized-tools.md`    | + `update_map_style`, `get_map_style`, `update_chart_spec`, `get_chart_spec`, `geocode_address` | Tool anatomy (name / description / inputSchema / execute); empty-description experiment; declarative specs vs. imperative code; validation + auto-repair as the closed self-correction loop; the gate (prompts ask, gates _enforce_); hands-on: build `buffer_analysis` — the query that broke ch. 2 becomes your specialized tool | Occasional wrong-tool / wrong-parameter choices remain — motivating design theory rather than another mechanism                                                                |
| 5   | `05-curate-your-stack.md`    | everything                                                                                      | The 8 tools plotted on a specialized ↔ general-purpose axis; low floor / high ceiling; the failure-mode recap mapped to which mechanism fixes each; "start general → log → specialize"; challenge kickoff; closing: write your first tool's `description` in one sentence                                                         | —                                                                                                                                                                              |

`00-setup.md`, `appendix-prompts.md`, `appendix-troubleshooting.md` survive with edits only
where they reference old chapter numbers. The old `01`–`07` chapter files are removed.

### The repeating chapter skeleton

Every chapter follows the same six-part structure (replacing the current five-part one):

1. **The agent so far** — one mermaid stack diagram that grows chapter by chapter
   (designed to be lifted directly onto a slide)
2. **The new piece** — concept plus where to read the code in geo-chat
3. **Run it** — scripted prompts that demonstrably work at this tier
4. **Where this fails** — the organic break that ends the chapter and motivates the next
5. **Hands-on** — the participant exercise
6. **Development prompts** — links into `appendix-prompts.md`

The sabotage-style experiments that remain valuable (emptying a description, comparing
"write JS" vs. "write a spec", triggering the gate) become _in-chapter experiments_ inside
part 2/3 of the relevant chapter; the chapter-ending break is always an organic failure.

### Content mapping (old → new)

| Current                                                            | Lands in                                                                        |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 01 magic demo, GeoAI map, agent skeleton, token-prediction framing | Ch. 1 (the `tools: {}` state becomes the _starting_ state, not a sabotage)      |
| 02 DuckDB-WASM concept + hands-on SQL                              | Ch. 2 opening                                                                   |
| 03 DevTools round trips, statelessness, `agent.ts` close reading   | Ch. 2 (archaeology lands right when multi-round-trips first exist)              |
| 04 tool anatomy, `buffer_analysis` exercise                        | Ch. 4                                                                           |
| 05 declarative-spec boundary, validation/repair                    | Ch. 4                                                                           |
| 06 skills + progressive disclosure                                 | Ch. 3; the prerequisite gate moves to Ch. 4 (it needs the gated tools to exist) |
| 07 challenges + closing articulation                               | Ch. 5                                                                           |
| 3-layers-of-prompt terminology                                     | README + Ch. 1, unchanged                                                       |
| Appendices                                                         | Unchanged apart from chapter cross-references                                   |

## Staging mechanics (the app changes)

### 1. Tool tiers — `src/lib/ai/toolTiers.ts` (new, single source of truth)

A small module declaring the ladder, imported by both the tool registry and the system
prompt so they can never disagree:

```ts
export const TIER_1 = ['duckdb_query', 'load_builtin_dataset'] as const;
export const TIER_2 = ['get_skill'] as const;
export const TIER_3 = [
    'update_map_style',
    'get_map_style',
    'update_chart_spec',
    'get_chart_spec',
    'geocode_address',
] as const;

// The workshop ladder: each chapter enables one more tier.
// Chapter 1 sets this to [] — the bare model.
export const ENABLED_TOOLS = [...TIER_1, ...TIER_2, ...TIER_3];
```

- `createTools()` filters its registry to `ENABLED_TOOLS`. Default = all tiers, so the app
  behaves exactly as today for anyone not following the workshop.
- Participants stage each chapter by editing this one visible line (Vite hot-reloads).
  The edit itself teaches the lesson: _a tool exists only if it is handed to the loop._
- This also makes the ch. 2 failure reliable: without `get_skill` in the tier, the model
  cannot rescue itself by fetching `duckdb.spatial`. No skill files are moved or renamed.

### 2. Tier-aware system prompt — `src/lib/ai/systemPrompt.ts`

`BASE_PROMPT` is reassembled from sections conditioned on which tools are enabled
(role/environment always; "How to work" steps, built-in datasets, skills section, and
map/chart rules only when their tools are present). A tier-1 agent is not told about tools
it does not have. Side benefit: the docs can show the system prompt _growing_ across
chapters — a teachable, diffable artifact.

Existing unit tests that assert on `BASE_PROMPT` content or the tool registry shape are
updated alongside.

### 3. Break-prompt reliability

The ch. 2 break offers 2–3 candidate prompts, ordered by observed failure rate
(to be verified during implementation with live runs):

1. 「各都道府県の面積を km² で計算して」 — `ST_Area` on EPSG:4326 returns degrees²
2. 「東京駅から 30km 以内の市を探して」 — `ST_DWithin` with 30000 passed in degree units
3. 「〇〇市の周囲 2km をバッファして」 — `ST_Buffer` unit confusion

Each break section documents an honest fallback: if the model happens to get it right from
prior knowledge, the docs pivot to "look at everything it had to already know — now watch
the skill make that _reliable_ instead of lucky," and compare the two transcripts.
The ch. 3 → 4 break (no map tool exists) and ch. 1 break (no tools at all) are
deterministic and need no fallback.

## Documentation plan

- **Both languages**: English written first, Japanese rewritten to full parity in the same
  branch. The ja and en trees keep identical file names.
- **docs README**: new course-outline table (Chapter | The agent gains | Core experience |
  Where it fails), the revised transfer goal, the 3 learning-outcome bullets, the revised
  timetable, and the retained 3-layers-of-prompt table.
- **Root README / CLAUDE.md**: update any links or chapter references to the new file names;
  CLAUDE.md's one-line description of docs/ stays accurate.
- **Timetable (3h)**: Ch. 1 `0:00–0:30` → Ch. 2 `0:30–1:20` (incl. ~15 min hands-on SQL) →
  Ch. 3 `1:20–1:55` (incl. write-a-skill) → Ch. 4 `1:55–2:35` (incl. `buffer_analysis`
  build) → Ch. 5 `2:35–3:00` (theory, challenge kickoff, closing).
- **Out of scope**: slides (authored separately; the per-chapter stack diagrams are designed
  to be lifted onto them), screenshots in `docs/images/` (still valid), the challenge menu
  content (kept as-is inside ch. 5).

## Verification

- `npm run check` passes (format, lint, typecheck, unit tests — including updated
  systemPrompt/tools tests).
- Manual dry-run of the ladder by the presenter with a live API key: each chapter's
  "Run it" prompts succeed at that tier, each "Where this fails" prompt fails (or the
  documented fallback applies), and each fix demonstrably resolves the previous failure.
- All internal doc links resolve (chapter renames touch README, appendices, and
  cross-references).

## Explicitly not doing

- No workshop-mode UI, no settings dropdown, no per-chapter git tags or branches.
- No changes to the skill system, gate, validation logic, or agent loop — the ladder only
  changes _when_ each existing mechanism enters the story.
- No renaming of the repo, sample data, or tools.
