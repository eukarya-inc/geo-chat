# 07. Challenge and articulation

> By now you've taken apart agent = LLM + tools + loop + context, and you can build tools (ch. 04) and skills
> (ch. 06) yourself. Finally, we apply it to **your own data and work problems.** From the menu below, ordered by
> difficulty, pick whatever interests you. You don't need to do all of them. **Seeing one through to the end** teaches
> you more deeply.

Each challenge is written in 3 points: **Goal / Hints / What you'll learn.** If you get stuck, lean on
[appendix-troubleshooting.md](./appendix-troubleshooting.md) and the body text of each skill md.

---

## (1) Choropleth your own CSV onto the prefectures ★

**Goal**: Load a CSV of your own (some per-prefecture metric), join it to `japan_prefectures`, and make a choropleth
(shaded) map by the metric.

**Hints**:

- From the SQL tab or the chat, "load the CSV at this URL." CSV is `read_csv_auto`.
- The join key is the prefecture name or code. `DESCRIBE` both tables and align the names and types
  (watch out for full-width/half-width and NFC wobble. See the `duckdb.basics` skill).
- Since `japan_prefectures` is a GeoParquet, `geom` is `GEOMETRY` from load (no conversion). If you use your own
  spatial data, first check the type with `DESCRIBE`, and if it's a `BLOB` (WKB) or a WKT string, convert to
  `GEOMETRY` with `ST_GeomFromWKB` / `ST_GeomFromText`.
- `CREATE TABLE` the join result, look at the metric's actual range with `SUMMARIZE`, and use it for the breaks of
  the `interpolate` in `update_map_style`.

**What you'll learn**: The spatial join of an attribute table and geometry, `SUMMARIZE`-driven color design, and the
shortest flow to get your own data into the agent.

---

## (2) A proximity-analysis tool with `ST_Buffer` + `ST_Intersects` ★★

**Goal**: Develop the `buffer_analysis` you built in chapter 04 into a **proximity-analysis tool** that extracts
"features of another table that fall within N meters of a given feature" (a staple of service areas / zones of
influence).

**Hints**:

- Modeling it on the chapter-04 tool, make a buffer with `ST_Buffer` (project → meters → back to 4326) and combine it
  into a single `CREATE TABLE` that does an intersection test against the other table with `ST_Intersects` /
  `ST_DWithin`.
- `ST_DWithin(a, b, distance)` has its distance in the units of the coordinate system. In raw lat/lon it's "degrees,"
  so either project first, or use `ST_Distance_Sphere` (see the `duckdb.spatial` skill).
- In the description (the ② prompt), state clearly "2 input tables, the unit of distance, output is the intersecting
  features."
- **Don't forget to register it** in `src/lib/ai/tools/index.ts`.

**What you'll learn**: Designing a spatial tool that spans multiple tables, handling projection and distance units, and
the design judgment of "combining single-responsibility tools."

---

## (3) Turn a repeated work task into a skill ★★

**Goal**: Turn the analysis / preprocessing / visualization procedure you do every time at work into one skill md.

**Hints**:

- Use the chapter-06 template and place it in `src/lib/ai/skills/` as `<domain>/<name>.md`.
- In the body write "when to use it," "concrete SQL / spec shapes," and "common mistakes and how to fix them" —
  the granularity of the existing `duckdb/spatial.md` and `map/geospatial.md` is a good model.
- Putting Japanese keywords in `tasks` makes it easier to pull from Japanese prompts.
- After adding it, **restart the dev server** and confirm it appears in the `get_skill` catalog.

**What you'll learn**: The ability to articulate tacit knowledge into "conventions the agent can read." This is the most
practical transfer that pays off in your own work from next week.

---

## (4) Fetch PLATEAU 3D city-model attributes via API and turn them into a table ★★★

**Goal**: Fetch attribute data of PLATEAU (Japan's MLIT 3D city models) from its distribution API, load it into a
DuckDB table, and analyze and visualize it.

**Hints**:

- The PLATEAU distribution service (`api.plateauview.mlit.go.jp`) offers REST / GraphQL APIs to fetch the data catalog,
  distribution URLs, and attribute information. For details, see PLATEAU's
  [distribution-service documentation](https://www.mlit.go.jp/plateau/) and the API spec.
- Load the API's response (JSON) into DuckDB with `read_json_auto`, or read the fetched GeoJSON / MVT with `ST_Read`.
- Once you can get per-building attributes (use, number of floors, height, etc.), shade by use with `match` / `step`
  in `update_map_style`. There are many attributes, so grasp the structure carefully with `DESCRIBE`.

**What you'll learn**: Connecting an external GIS API to the agent, turning JSON attributes into SQL, and designing
tools that cope with the "messiness" of real data (type wobble, missing values).

---

## (5) Read Overture Maps Parquet directly in DuckDB ★★★

**Goal**: Query Overture Maps' huge GeoParquet directly from DuckDB without downloading it, and extract and visualize
only your area of interest.

**Hints**:

- With DuckDB's `spatial` / `httpfs`, read a remote Parquet from `read_parquet('s3://...')` or `https://...`.
  Pushing down by bbox to take only the range you need keeps it light.
- In the in-browser DuckDB-WASM, watch the memory ceiling (4GB). Narrow first with `LIMIT` and `WHERE bbox...`.
  Reading a GeoParquet with `spatial` LOADed usually gives `geom` as `GEOMETRY`, but **if the geometry column is still
  a `BLOB` (WKB)**, convert with `ST_GeomFromWKB` (check with `DESCRIBE`).
- `CREATE TABLE` the extraction result and draw it with the usual `update_map_style`.

**What you'll learn**: The strength of DuckDB in handling large cloud GeoParquet "in place," the constraints of
in-browser execution (memory, CORS), and query design that accounts for them.

---

## (6) Free: design "1 tool + 1 skill" for your own data ★★★

**Goal**: Pick one of your own work datasets and design and implement **one tool** and **one skill** for it, making
them usable from the agent.

**Hints**:

- Tool = "the processing the app actually runs"; skill = "the conventions for using that processing correctly."
  Split them along this division of roles (ch. 04 / ch. 06).
- The development-prompt templates are in [appendix-prompts.md](./appendix-prompts.md).
- Keep to "1 tool = 1 responsibility," "write when-to-use into the description," and "register in index.ts."

**What you'll learn**: The transfer goal itself — a state where you can design tools and skills for your own problem
and explain their behavior at the API level.

---

## Closing — put it into your own words

The end is not an explanation but a **question.** Stop your hands and write the next sentence.

> **For your own work data, what is the first tool you'd give the agent?
> Write its `description` in one sentence.**

Once you've written it, try **exchanging** with the participant next to you. Read their one sentence and talk about
whether you can imagine "when that tool should be called," "what its arguments are," and "what it should return."

If you can write the `description`, you can design the tool.
If you can design the tool, you can build the agent.
— That is the proof that you've reached this workshop's transfer goal.

Well done. There is no wall left that you can't get over.
