# 70. Beyond — transferring to your own problem

> By now we've observed, one rung at a time, an agent = data tools + loop + context +
> validation + skills + evals, up the subtraction ladder. Finally, apply it to **your own data
> and work problems**. Pick from the menu below, ordered by difficulty. You don't need to do
> them all. **Finishing one all the way** teaches more.

In the workshop itself, get as far as **(choose → take the first step → write the one-line
closing)**. Do the rest at your own pace. Rather than hand-coding, use **③ development prompts**
to have a coding AI like Claude Code write it (templates in
[appendix-prompts.md](./appendix-prompts.md)). If you get stuck, lean on
[appendix-troubleshooting.md](./appendix-troubleshooting.md) and the skill md bodies.

> **Which branch?** Do extensions on **`main`** (all layers present, so validation, skills, and
> evals are available). `git switch main` before you start.

---

## (1) Add one built-in dataset ★

**Goal**: add one line to `src/lib/ai/builtinDatasets.ts` for data you use often, so that from
then on the agent loads it by itself when you just name it in chat.

**Hints**:

- Add one `{ table, url, description }` to the `BUILTIN_DATASETS` array. That single spot is the
  only code change (as seen in ch. 20 — the system prompt reads this array and teaches the model;
  layer ②).
- Same-origin `url` is safest: put the file under `public/data/` and use `${BASE_URL}data/<file>`.
  External URLs need CORS ([appendix-troubleshooting.md](./appendix-troubleshooting.md)).
- Writing **column names, types, and CRS** into `description` lets the model explore less and use
  it accurately.

**What you learn**: the shortest form of "put knowledge into layer ②" — teaching the model about
data via the system prompt (the same principle as skills).

---

## (2) Choropleth your own CSV onto prefectures ★

**Goal**: load a CSV (some per-prefecture metric), join it to `japan_prefectures`, and make a
choropleth by the metric.

**Hints**:

- In the SQL tab, or via chat "load the CSV at this URL". CSV via `read_csv_auto`.
- The join key is prefecture name or code. `DESCRIBE` both tables and align name and type (watch
  full/half-width and NFC variance; see the `duckdb.basics` skill).
- `japan_prefectures` is GeoParquet, so `geom` is `GEOMETRY` on load. For your own spatial data,
  `DESCRIBE` the type first; if `BLOB`(WKB)/WKT, convert with `ST_GeomFromWKB`/`ST_GeomFromText`.
- `CREATE TABLE` the join, `SUMMARIZE` the metric's range, and use it for the `interpolate` breaks.

**What you learn**: joining an attribute table to geometry, color design starting from
`SUMMARIZE`, and the shortest path to get your own data into the agent.

---

## (3) Turn a recurring work task into a skill ★★

**Goal**: capture the analysis / preprocessing / visualization steps you do at work every time,
as one skill md.

**Hints**:

- In the ch. 50 format, place it as `<domain>/<name>.md` under `src/lib/ai/skills/`.
- Frontmatter: `description` (write "when it's needed") / `tasks` (English + Japanese keywords) /
  `deps` if needed. The body: "when to use", "the concrete SQL / spec shape", "common mistakes and
  fixes". `duckdb/spatial.md` and `map/geospatial.md` are good granularity models.
- After adding, **restart the dev server** (skills are a build-time glob) and confirm it appears
  in the `get_skill` catalog. Verify behavior changes before/after.

**What you learn**: the skill of putting tacit knowledge into "etiquette the agent can read." The
most practical transfer that pays off in your work next week.

---

## (4) Add a `buffer_analysis` tool **with validation** ★★

**Goal**: implement a `buffer_analysis` tool that `ST_Buffer`s a table's geometry into a new
table, **with input validation**, and add **one eval** for it.

**Hints**:

- Models: `duckdbQuery.ts` (the four-part shape) and `updateMapStyle.ts` (how validation is
  wedged in; ch. 40). A `createXxxTool(ctx)` function returning
  `tool({ description, inputSchema(zod), execute })`.
- Input: `table` / `distanceMeters` / `outputTable`. **Project (EPSG:4326 → e.g. EPSG:6677,
  `always_xy := true`), buffer in meters, then convert back to 4326** (the axis-order trap from
  ch. 30).
- **Add validation** (the point of this challenge): at the top of `execute`, check the target has
  a geometry column, the distance is positive, and the output name is valid; return `{ error }`
  if not. Design it to prevent "the naive tool silently breaks" (ch. 30) with your own hands.
- **Register** it in `createTools` in `src/lib/ai/tools/index.ts` (else the model can't see it).
- **Add one eval** (ch. 60): in `src/evals/`, add a case verifying "buffer request → output table
  exists and has rows > 0", and check the success rate with `npm run test:evals`.

**What you learn**: tool design (four parts, single responsibility), where to put validation, and
**guarding your own tool with an eval** — end to end into a product.

---

## (5) Run your own data end-to-end ★★★

**Goal**: pick one of your work datasets and take it all the way — **load → analyze → visualize** —
through the agent. Design and add **one tool + one skill** if needed.

**Hints**:

- Tool = "the processing the app actually runs"; skill = "the etiquette for using it right." Split
  along that role division (ch. 20/50).
- Apply every layer so far to your problem: "one tool = one responsibility", "write when-to-use
  into the description", "register in index.ts", "add validation if needed", "guard regressions
  with an eval".
- Development-prompt templates are in [appendix-prompts.md](./appendix-prompts.md).

**What you learn**: the transfer goal itself — designing tools and skills for your problem and
being able to explain and debug the behavior at the API level.

---

## Advanced data sources (at your own pace)

- **PLATEAU (MLIT's 3D city models)** — fetch the data catalog, delivery URLs, and attributes via
  the delivery service's REST / GraphQL API (`api.plateauview.mlit.go.jp`). Read JSON with
  `read_json_auto`, GeoJSON/MVT with `ST_Read`, and color building attributes (use, floors,
  height) with `match`/`step`. Attributes are many, so `DESCRIBE` the structure carefully.
- **Overture Maps' huge GeoParquet** — with DuckDB's `spatial` / `httpfs`, query
  `read_parquet('https://…')` directly without downloading. Narrow with `WHERE bbox…` and `LIMIT`
  (in-browser DuckDB-WASM has a 4GB memory cap). If `geom` is still `BLOB`(WKB), convert with
  `ST_GeomFromWKB`.

---

## Closing — put it in your own words

The ending is not exposition but a **question**. Stop and write this one sentence:

> **For your work data, what is the first tool you'd give the agent? Write its `description` in
> one sentence.**

Once written, **swap** with the participant next to you. Read their sentence and discuss whether
you can imagine "when should this tool be called", "what are the arguments", "what should it
return".

If you can write the `description`, you can design the tool. If you can design the tool, you can
build the agent. And if you can explain its behavior — in the language of the layers we watched,
from ch. 10's "talk only" to ch. 60's "guarded by evals" — you've reached this workshop's
transfer goal.

Well done. There's no wall you can't get over now.
