# Appendix: Development prompt collection (the ③ layer)

This is where the **③ development prompts** are collected — instructions for a coding AI such as Claude Code to
"extend geo-chat for you." Instead of writing code by hand, you paste these to have it implemented.

**The 3 principles of a good development prompt** (every template follows them):

1. **Name the model files** — "match the existing ◯◯" puts it on the project's conventions.
2. **State the constraints explicitly** — write the input schema, single responsibility, result truncation, and where to register.
3. **Demand verification** — go as far as specifying "typecheck must pass" and "write when-to-use into the description."

The quality of ② (the description, the skill body) decides whether what you built in ③ gets used intelligently.
That is why the trick is to include "write the description carefully" in the ③ prompt too.

---

## 1. The actual prompts used in the main text

### 1-a. The `buffer_analysis` tool (chapter 04)

```
Add a new AI tool called buffer_analysis to this repository.

■ Goal
Create a new table with ST_Buffer applied to the geometry column of a specified table, so it can be drawn on the map.

■ Match the existing structure
- Model it on src/lib/ai/tools/duckdbQuery.ts and updateMapStyle.ts, writing it in the same shape
  (a createXxxTool(ctx) function returning tool({ description, inputSchema(zod), execute })).
- Receive the ToolContext from src/lib/ai/toolContext.ts and reflect into the UI using
  refreshTables / setSelectedTable / setActiveTab.
- After implementing, register buffer_analysis in createTools in src/lib/ai/tools/index.ts.

■ Input schema (zod)
- table: string (target table)
- distanceMeters: number (buffer distance, meters)
- outputTable: string (name of the table to create)

■ Behavior
- Check with getTableSchema whether the target table has a geometry column; if not, return an error.
- Since ST_Buffer works in the units of the coordinate system, convert EPSG:4326 to a projected CRS
  (e.g. EPSG:6677, always_xy := true), buffer in meters there, then convert the result back to EPSG:4326
  and store it as a GEOMETRY column.
- Run CREATE TABLE "<outputTable>" AS SELECT ... via executeQuery.
- On success, call ctx.refreshTables / setSelectedTable(outputTable) / setActiveTab('map').
- Make the return value to the model a short summary ("created table name, row count," etc.); do not return all rows.

■ Write the description (the ② prompt) carefully
- State in 2–3 sentences when to use it (proximity analysis, service areas, etc.), that the distance unit is meters,
  and that the output is a new table.

After implementing, confirm that npm run typecheck passes.
```

### 1-b. A skill md (chapter 06)

```
Modeling it on the existing skills in src/lib/ai/skills/ (map/styling.md, duckdb/spatial.md),
write a new skill <domain>/<name>.md.
- The frontmatter is description / tasks (English + Japanese keywords) / deps if needed.
- The body includes "when to use it," "concrete SQL / spec shapes," and "common mistakes and how to fix them."
- Target task: <a description of an analysis you repeat in your work>
Output it as one Markdown file. No code change needed (it's auto-registered by the glob).
```

---

## 2. Templates

### 2-a. The "add a tool" template

```
Add a new AI tool called <tool_name> to this repository.

■ Goal: <what this tool does, in 1 sentence>

■ Model: the same shape as src/lib/ai/tools/<the closest existing tool>.ts
  (a createXxxTool(ctx: ToolContext) function returning tool({ description, inputSchema, execute })).

■ Input schema (zod, put .describe() on each argument):
  - <arg1>: <type> — <explanation / unit>
  - <arg2>: <type> — <explanation>

■ Behavior:
  - <prerequisite checks (table exists, column exists, etc.). If unmet, return { error }>
  - <the main processing. For SQL, use executeQuery, as a single statement>
  - <if UI reflection is needed, ctx.setSelectedTable / setActiveTab / refreshTables / setMapStyle, etc.>
  - Make the return value to the model a short summary (don't return all rows or huge JSON).

■ Register: add one line to createTools in src/lib/ai/tools/index.ts.
   If you want to require a skill first, wrap it with requireSkill('<domain>', '<suggestion>', ...).

■ description (the ② prompt): state in 2–3 sentences when to use it, the meaning of the arguments, and what gets returned.

After implementing, confirm that npm run typecheck passes and that it's registered in index.ts.
```

**Why this shape**: If you don't spell out registration into `index.ts`, you get the accident of "implemented it but
the model can't see it" (it doesn't appear in chapter 03's `tools` array). Specifying result truncation every time is
to avoid overflowing the context. The prerequisite gate (`requireSkill`) is added only when needed.

### 2-b. The "add a skill" template

```
Add a new skill <domain>/<name>.md to src/lib/ai/skills/.
Model it on the existing src/lib/ai/skills/<a close skill>.md, at the same granularity and same frontmatter format.

■ frontmatter
  description: <the catalog's 1 line. Write "when it is needed," as in "REQUIRED before ...">
  tasks: <English and Japanese routing keywords, comma-separated>
  deps: <ids of prerequisite skills. Omit if not needed>

■ body
  - when to use it / prerequisites
  - the concrete "shape" of the SQL or spec (a minimal example you can copy and use)
  - common mistakes and how to fix them

The id is generated automatically from the path (<domain>.<name>). No code change needed. Reflected on dev-server restart.
```

**Why this shape**: Writing "when it is needed" in the `description` lets the model see the `get_skill` catalog and
pick correctly. Putting Japanese in `tasks` is for routing accuracy from Japanese prompts. Including "common mistakes
and how to fix them" makes the model avoid the same failures.

### 2-c. The "debug the agent" template

```
The geo-chat agent isn't working as expected. I want to isolate the cause.

■ Symptom: <what you asked, what happened, and what you expected>
■ Reproduction prompt: <the sentence you typed into the chat>
■ Observations: <the tool card's input/output, the number of `messages` requests in DevTools Network,
         the error message that came back, etc., concretely>

Please isolate the cause in this order:
1. Is the model picking the right tool (a description problem)?
   → Check src/lib/ai/tools/<the relevant>.ts description and suggest improvements.
2. Is the tool returning an error (rejected by input validation / the prerequisite gate / column-name matching)?
   → Check requireSkill in src/lib/ai/tools/index.ts, the validation logic in updateMapStyle.ts / updateChartSpec.ts,
     and the matching in columnMatch.ts.
3. Is the system prompt / skill missing conventions?
   → Check src/lib/ai/systemPrompt.ts and the relevant skill md.
After reading the relevant files, propose the smallest fix.
```

**Why this shape**: An agent malfunction almost always falls into one of "the model's choice (② description)," "rejected
by the tool's validation," or "missing conventions (skill)." Isolating with these 3 categories lets you inspect the ②
prompt layer before suspecting `agent.ts` (most problems are there). The more concretely you hand over your
observations (the tool card's input/output, the round trips in Network), the faster the isolation.

---

## 3. Notes for writing prompts

- **Files to mention**: Naming at least these each time you extend improves accuracy —
  `src/lib/ai/tools/index.ts` (registration), `src/lib/ai/toolContext.ts` (the window to the UI),
  the existing tool you're modeling on, and the relevant skill md.
- **Constraints to state**: single responsibility, single-statement SQL, result truncation, projection and axis order
  (`always_xy`), column names exactly as in `DESCRIBE`.
- **Verification to demand**: that `npm run typecheck` (or `npm run check`) passes, registration into `index.ts`, and
  that when-to-use is written into the description.
