# Building a Geospatial Agent, One Failure at a Time — GIS × LLM from the inside

Participant curriculum for a 3-hour FOSS4G workshop.

Using `geo-chat` — a fully client-side SPA — as its subject, this workshop aims to
**take the "AI agent" apart down to the level of raw API requests and understand how it works.**
geo-chat combines DuckDB-WASM (SQL analysis), MapLibre GL (maps), and Vega-Lite (charts),
all running inside the browser, with Anthropic Claude wired in as the agent.
Ask it in natural language — "color the municipalities by prefecture and show them on the map" — and SQL runs and the map gets colored.

The agent starts bare and gains one tier of capability per chapter, and every chapter ends
with a real geospatial request that breaks the current stack.

## Transfer Goal

> The week after the workshop, a participant can **curate the right tool stack for their own
> geodata** — knowing when a general-purpose tool is enough, when a knowledge gap calls for a
> skill, and when a task deserves a specialized, validated tool — and can **explain and debug
> the agent's behavior at the level of API requests.**

The goal is not "memorized how it works" but "can apply it to a problem never seen before (transfer)."
This material is narrowed down to only what serves the sentence above. It is not a comprehensive API reference.

## Learning Outcomes

By the end of the workshop, you will have:

- experimented with an agent at every tier of capability, from a bare model to a full
  geospatial tool stack, and watched each tier fail on a real geospatial request
- learned to extend an agent's capability with skills (one markdown file) and specialized
  tools (description + schema + validation), and to enforce conventions with a gate
- gained an intuition for the trade-offs: specialized vs. general-purpose tools,
  low floor vs. high ceiling, and how to evolve a tool stack from logged behavior

## Audience and Prerequisites

- **Audience**: GIS engineers who are fluent with QGIS / PostGIS / GDAL and can also write Python or JS.
  People who use ChatGPT or Copilot but feel that the inside of an "AI agent" is a black box.
- **Prerequisites**: SQL (SELECT / JOIN / GROUP BY), the basics of spatial data (projections, geometry types),
  and basic command-line and Git use. No prior LLM internals required (that is what you came here to learn).
- **What you need**: A laptop that can run Node.js 20 or newer, a modern browser (latest Chrome / Edge / Firefox),
  and an Anthropic API key (you will get one in [00-setup.md](./00-setup.md)).

## "Learn by Breaking" — How This Workshop Works

Every chapter includes a **fail-first** "break-it moment" (experience the failure before the explanation).
Where a purely didactic course would build up to something that works, here the failure is not staged for
you — it is the honest result of asking the agent, at its current tier, a real geospatial request. You watch
the current tool stack fall short, then read why, and the next chapter hands the agent the piece that fixes
it. Break, then explain — that order is the whole point.

Every chapter follows the same six-part structure:

1. **① The agent so far** — a diagram of the tool stack, grown one tier from the previous chapter
2. **② The new piece** — the concept this chapter adds, and where to read the code for it in geo-chat
3. **③ Run it** — prompts that demonstrably work at this tier
4. **④ Where this fails** — a real geospatial request that breaks the current stack
5. **⑤ Hands-on** — try it with your own data and your own hands
6. **⑥ Development prompts** — instructions for getting Claude Code and the like to implement it (the layer-③ prompts; collected in the appendix)

## Course Outline

| Time      | Chapter                                                      | The agent gains                                   | Where it fails                                      |
| --------- | ------------------------------------------------------------ | ------------------------------------------------- | --------------------------------------------------- |
| (setup)   | [00-setup.md](./00-setup.md)                                 | a running app + API key                           | —                                                   |
| 0:00–0:30 | [01. A bare model](./01-bare-model.md)                       | nothing — LLM + loop, zero tools                  | all talk: it can describe SQL, it cannot touch data |
| 0:30–1:20 | [02. One general-purpose tool](./02-general-purpose-tool.md) | `duckdb_query`, `load_builtin_dataset`            | spatial requests: degrees-vs-meters garbage         |
| 1:20–1:55 | [03. Knowledge on demand](./03-skills.md)                    | `get_skill` + skill files                         | right numbers, trapped in text — no map, no chart   |
| 1:55–2:35 | [04. Specialized tools](./04-specialized-tools.md)           | map / chart / geocode tools, validation, the gate | occasional wrong tool or wrong parameters           |
| 2:35–3:00 | [05. Curate your stack](./05-curate-your-stack.md)           | a design theory + your own challenge              | —                                                   |

### Appendices

- [appendix-prompts.md](./appendix-prompts.md) — Collection of development prompts (the layer-③ prompts).
  With templates for "add a tool," "add a skill," and "debug the agent."
- [appendix-troubleshooting.md](./appendix-troubleshooting.md) — Practical fixes for API-key errors, CORS,
  the app not booting, no map showing, an empty chart, rate limits, and more.

## Terminology: The 3 Layers of "Prompt"

The word "prompt" in this workshop splits into 3 layers. Mixing them up gets you lost, so we distinguish them up front.

| Layer                | What kind of string it goes into                                              | Example                                     | Chapters                                                           |
| -------------------- | ----------------------------------------------------------------------------- | ------------------------------------------- | ------------------------------------------------------------------ |
| ① usage prompt       | typed into the **chat box** of the finished geo-chat                          | "color the municipalities by prefecture"    | 01–02 (experienced as the entry point)                             |
| ② in-agent prompt    | the system prompt / tool description / skill md **built into the app itself** | "this tool runs exactly one SQL statement…" | **the main event.** read in 02–03, written in 03–04                |
| ③ development prompt | implementation instructions **given to a coding AI** such as Claude Code      | "add an ◯◯ tool to this repository"         | the means of implementation from 04 on (collected in the appendix) |

Whether the tool you built in ③ gets used intelligently is decided by how you write the description in ② —
this **very interplay between ② and ③** is what this workshop is about.
