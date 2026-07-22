# Taking AI Agents Apart — How GIS × LLM Actually Works

Participant curriculum for a 3-hour FOSS4G workshop.

Using `geo-chat` — a fully client-side SPA — as its subject, this workshop aims to
**take the "AI agent" apart down to the level of raw API requests and understand how it works.**
geo-chat combines DuckDB-WASM (SQL analysis), MapLibre GL (maps), and Vega-Lite (charts),
all running inside the browser, with Anthropic Claude wired in as the agent.
Ask it in natural language — "color the municipalities by prefecture and show them on the map" — and SQL runs and the map gets colored.

## Transfer Goal

> The week after the workshop, a participant can **design their own "tools" and "skills" for their
> own data and work problems, wire them into an agent, and explain and debug its behavior not as
> magic but at the level of API requests.**

The goal is not "memorized how it works" but "can apply it to a problem never seen before (transfer)."
This material is narrowed down to only what serves the sentence above. It is not a comprehensive API reference.

## Audience and Prerequisites

- **Audience**: GIS engineers who are fluent with QGIS / PostGIS / GDAL and can also write Python or JS.
  People who use ChatGPT or Copilot but feel that the inside of an "AI agent" is a black box.
- **Prerequisites**: SQL (SELECT / JOIN / GROUP BY), the basics of spatial data (projections, geometry types),
  and basic command-line and Git use. No prior LLM internals required (that is what you came here to learn).
- **What you need**: A laptop that can run Node.js 20 or newer, a modern browser (latest Chrome / Edge / Firefox),
  and an Anthropic API key (you will get one in [00-setup.md](./00-setup.md)).

## "Learn by Breaking" — How This Workshop Works

Every chapter includes a **fail-first** "break-it experiment" (experience the failure before the explanation).
Before you build something that works, you deliberately break something that already works, so you can see with
your own eyes what is doing the heavy lifting. Change one line of code, watch the behavior fall apart, then put it
back and read the concept — that order is the whole point.

Every chapter follows the same structure:

1. **Concept** — the idea the chapter deals with
2. **Where to read the code** — open the actual source files and read them
3. **Break-it experiment** — fail-first. Change one line to break it and see the principle
4. **Hands-on exercise** — try it with your own data and your own hands
5. **Development prompt examples** — instructions for getting Claude Code and the like to implement it (the layer-③ prompts; collected in the appendix)

## Timetable and Chapters

| Time      | Step / Chapter                                                 | Core experience                                                                             |
| --------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| (setup)   | [00-setup.md](./00-setup.md)                                   | clone / `npm i` / `npm run dev` / get and enter the API key / verify with the built-in data |
| 0:00–0:20 | [01. What is an AI agent](./01-what-is-an-agent.md)            | demo → the GeoAI map → tool-stripping experiment → "LLM + tools + loop + context"           |
| 0:20–0:45 | [02. A GIS foundation inside the browser](./02-duckdb-wasm.md) | Write SQL by hand in DuckDB-WASM (including spatial). Feel "spatial analysis, no server"    |
| 0:45–1:20 | [03. Witnessing the loop](./03-agent-loop.md)                  | Read `agent.ts` closely and narrate the Anthropic API round-trips in DevTools               |
| 1:20–1:55 | [04. Anatomy of a tool](./04-building-tools.md)                | name / description / inputSchema / execute. Have a development prompt implement a new tool  |
| 1:55–2:15 | [05. The declarative-spec boundary](./05-declarative-specs.md) | Why Vega-Lite / MapLibre style pair so well with AI. Watch a broken spec get auto-repaired  |
| 2:15–2:45 | [06. A skill = one md file](./06-skill-system.md)              | Write your own skill md to make the agent smarter. The write → try → fix loop               |
| 2:45–3:00 | [07. Challenge and articulation](./07-challenge.md)            | Kick off your own problem (`ST_Buffer` analysis, PLATEAU, Overture Maps, etc.) + closing    |

> **About chapter 07**: The final 15 minutes are spent only on **kicking off a challenge and the closing question**,
> not on finishing one. The challenges are intentionally sized larger than the slot — they are meant to be
> **carried through at your own pace after the workshop.** In the room you just "pick one → take the first step →
> write the closing one-liner."

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
| ② in-agent prompt    | the system prompt / tool description / skill md **built into the app itself** | "this tool runs exactly one SQL statement…" | **the main event.** read in 03, written in 04 and 06               |
| ③ development prompt | implementation instructions **given to a coding AI** such as Claude Code      | "add an ◯◯ tool to this repository"         | the means of implementation from 04 on (collected in the appendix) |

Whether the tool you built in ③ gets used intelligently is decided by how you write the description in ② —
this **very interplay between ② and ③** is what this workshop is about.
