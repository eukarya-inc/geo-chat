# 10. The talk-only AI — with not a single tool

> In the finished demo (ch. 00) the same Claude ran SQL and painted the map. Here we go back
> to a state with **all of that stripped away**. With no tools at all, what can — and can't —
> the AI do? We touch the very bedrock under the word "agent".

## ① State of this chapter

```bash
git switch chapter/00-chat-only
# restart the dev server (Ctrl+C → npm run dev)
```

This branch has **no tools whatsoever**. `createTools()` in `src/lib/ai/tools/index.ts` is
effectively `return {}` — the tool set handed to the agent is empty. The system prompt is
**the CORE section only** (role, environment, answer rules); the data, visualization, and
skill sections are all dropped.

- **Present**: the chat box, Claude itself, the conversational round-trip.
- **Absent**: `duckdb_query` (run SQL), `load_builtin_dataset` (load data), the map/chart
  tools, skills. In short, **not one hand to touch the world**.

Claude in this state is like a ChatGPT running directly in your browser. It can talk cleverly —
that's all.

## ② Observe

### Observation 1: throw the through-line prompt

```
自治体を都道府県ごとに色分けして地図に表示して
(Color the municipalities by prefecture and show them on the map)
```

**Real behavior**: the agent **only talks**. Not a single tool card appears (there are no
tools to call). Instead it writes plausible SQL — something like
`CREATE TABLE … ST_Read('https://nlftp.mlit.go.jp/…')` — **as a markdown code block**, and
asks back: "Do you have data, or shall I try it with sample data?" The Map tab is unchanged
and no table appears.

> **What's interesting is what it _doesn't_ do**: this agent does **not** fake tool-call XML
> syntax like `<function_calls>`. Why not — see §③.

### Observation 2: ask it a factual question — a confidently wrong answer

```
日本で一番市区町村が多い都道府県は？
(Which prefecture has the most municipalities in Japan?)
```

**Real behavior**: the agent first says it needs data — and then **often appends a reference
answer from memory**: "For reference (general knowledge as of 2024): **Saitama has the most
municipalities (63)**, followed by Hokkaido, Nagano…" — hedged in tone, but firm in content.
(It won't do this every run; sometimes it only asks for data. If the memory answer doesn't
appear, nudge it: "just give me your best guess from what you know.")

**But this is wrong against the real data.** Counting the bundled `japan_cities` for real,
**Hokkaido is far and away #1 with 194** (not Saitama). With no way to touch the data, the
agent answered **confidently, and wrongly**.

> This isn't "AI lies". It's structural: **a model with no hands has no way to check real
> data, so it falls back on memory** — and when that memory is stale or fuzzy, this is what
> you get.

## ③ Why this happens — an LLM is a token predictor with no memory

### All an LLM does is "predict the next token"

"AI agent" sounds grand, but the LLM at its center does one thing:

> **Take a sequence of tokens as input and predict the next token to output.** That's it.

A chat reply, code generation, and — in later chapters — **tool calls too, all ride on this
same mechanism**. So with no hands, all the model can do is "write a plausible continuation of
tokens" — i.e. **explain, propose, draft SQL**. It cannot execute.

### Why it didn't emit fake tool syntax

Earlier, a different build that stripped tools at the _implementation_ level would sometimes
have the model **spill tool-call-ish XML as prose** —
`<tool_name>duckdb_query</tool_name>…`. Yet on `chapter/00-chat-only` this doesn't happen.

The difference is the **system prompt**. This branch's CORE prompt says "you work through
your tools", but it **lists no concrete tool names and no tool-call format**. The model has no
template to imitate, so it can't fake one — it falls back honestly to prose + markdown SQL.

> **The visible principle**: the model's output is strongly shaped by the context you give it
> (layer ②). Show it no "tool vocabulary" and it won't impersonate a tool. A tool call, in the
> end, is **just a specific output format the model has learned** — a view that pays off in
> ch. 20 when real tools appear.

### The AI is stateless (it holds no memory)

One more fact worth carving in now: **the model holds no memory between API calls.** What
"remembers what it said earlier" is the app, which fakes memory by **re-sending the entire
conversation history** each turn.

In today's chat-only branch there's just one round-trip, so this stays subtle. **Once the
loop appears in ch. 20, you'll confirm this statelessness with your own eyes in DevTools.**
For now, just remember: the model re-reads its context from scratch every time. That's why it
had to answer the factual question (Observation 2) from memory, using only the context in
front of it.

## ④ What the next chapter adds — tools as "hands"

The frustration of Observation 1 ("it can write SQL but can't run it") is exactly the design
motivation for the next chapter.

> **Chapter 20 adds hands — tools that let the model touch the world.** First `duckdb_query`
> (run one SQL statement) and `load_builtin_dataset` (load a built-in dataset). Now the model
> can answer by **looking at real data** instead of relying on memory.

Observation 2's "Saitama, 63" should also become a re-answered, data-grounded "Hokkaido, 194"
in ch. 20, by actually **running** `SELECT prefecture, count(*) …`. One extra hand turns a
"confident wrong answer" into a "data-grounded correct one" — we'll observe that next chapter.

## ⑤ Reading the diff — what grows a hand

Look at what gets added going from this chapter (`chapter/00-chat-only`) to the next
(`chapter/01-data`):

```bash
git diff --stat chapter/00-chat-only..chapter/01-data
```

Files that mainly appear:

- `src/lib/ai/tools/duckdbQuery.ts` — the first tool (run one SQL statement).
- `src/lib/ai/tools/loadBuiltinDataset.ts` / `builtinDatasets.ts` — loading built-in data.
- `src/lib/ai/tools/geocode.ts` — address → coordinates.
- `src/lib/ai/tools/index.ts` — the `// CHAPTER SEAM: data tools` body grows; three tools
  land in the previously empty registry.
- `src/lib/ai/systemPrompt.ts` — the CORE-only prompt gains `DATA_GUIDANCE` and
  `BUILTIN_DATASETS` sections.

**What a CHAPTER SEAM is**: the `// CHAPTER SEAM: <layer>` comments planted in
`src/lib/ai/tools/index.ts` and `systemPrompt.ts` mark that "this one block is one whole
layer" — the **seam of a layer**. The chat-only branch was built by cutting everything from
the data layer onward off at exactly this seam. Next chapter you read the **data layer coming
back** into that seam.

Next: [20. The first tool and the loop](./20-data.md). We give it one hand and watch the
agent's "loop" start moving for the first time — dissecting it from both the code and DevTools.
