# 02. A GIS foundation inside the browser — DuckDB-WASM

> First we touch the most important tool the agent holds **with our bare hands**.
> Getting comfortable with SQL here makes "what the agent is doing" transparent from chapter 03 on.

## ① Concept — what DuckDB is, and why it pairs well with AI

**DuckDB** is an embedded, **columnar** analytical database.
It is often called "the SQLite of analytics." There are 4 key points:

- **Columnar** — it stores data by column rather than by row, so aggregation, filtering, and analysis are fast.
  It is good at aggregations like "average population" and "count per prefecture" (it is weak at transaction
  processing, but for analytical use that is actually its strength).
- **Embedded** — no server to stand up; it runs in-process as a library. No connection setup required.
- **Reads files directly** — it can **read Parquet / CSV / JSON / GeoJSON straight from SQL**.
  No prior ETL or a dedicated import tool needed.
- **The spatial extension** — `ST_Read`, `ST_Point`, `ST_Area`, `ST_Distance`, `ST_Intersects` …
  it gives you **PostGIS-equivalent spatial functions**.

And what geo-chat uses is **DuckDB-WASM** — DuckDB compiled to WebAssembly, so it runs **entirely inside the browser**.
No server, and the data never leaves the browser in your hands. In FOSS4G terms it's close to
"a PostGIS that runs right here, needing no hosting and no auth."

### Why it pairs well with AI (LLMs)

> **SQL is one of the languages LLMs are best at.**

Just show the LLM the "schema (column names and types)" and "a few sample rows" and it writes fairly accurate queries.
The **text-to-SQL** flow — natural language → (LLM) → SQL → (DuckDB) → result — becomes the core of the agent.
Put the other way around, the key to getting good work out of the agent is "how you show it the schema and samples" —
which leads into chapter 03's discussion of the system prompt.

## ② Where to read the code

### The serial execution queue — `src/lib/duckdb/db.ts`

Since DuckDB-WASM is effectively single-threaded, geo-chat runs all statements **serially** through **one shared
connection**. Multiple calls simply wait their turn in submission order.

```ts
// from src/lib/duckdb/db.ts (comment paraphrased)
// One shared connection for the whole app. DuckDB-WASM is effectively
// single-threaded, so we serialize all statements through a promise chain:
// concurrent callers simply await their turn in submission order.
let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task); // always runs after the previous task
    tail = run.then(
        () => undefined,
        () => undefined
    );
    return run;
}
```

`executeQuery()` goes through this `enqueue`. Even if the agent fires SQL from multiple tool calls at once,
they are processed in order, so nothing breaks. `getTables()`, `getTableSchema()`, and `createTableFromUrl()`
are in the same file.

### Initializing the spatial extension — `src/lib/duckdb/globalDB.ts`

There is exactly one DuckDB instance for the whole process (a singleton). At initialization it **INSTALLs / LOADs**
the spatial extension and pins a deterministic single-threaded mode.

```ts
// from initializeDB() in src/lib/duckdb/globalDB.ts
await conn.query('INSTALL spatial;');
await conn.query('LOAD spatial;');
await conn.query('PRAGMA threads=1;'); // deterministic single thread
await conn.query("SET memory_limit='4GB';"); // the wasm 32-bit ceiling
```

In other words, **the `ST_*` functions are already usable the moment the app starts**.
That is why you can try the spatial queries below straight in the SQL tab.

## ③ Hands-on — bare-handed analysis in the SQL tab

Open the **SQL** tab in the right pane. It consists of an "Import from URL" form, a table list,
a SQL editor (run with Cmd/Ctrl+Enter), and a result table
(`src/components/workspace/SqlPanel.tsx`).

### 1. Get the data ready

If you don't have the `japan_cities` table yet, get it. The quickest way is to **ask in the chat, "show the Japanese
municipalities on the map"** — the agent loads the built-in data itself (the chapter 00 demo). To read it by hand in
the SQL tab, click the `Try the bundled sample:` link below "Import from URL" and the URL of `japan_cities.parquet`
and the table name `japan_cities` are auto-filled; press **Import**
(to enter the URL by hand, it is `/geo-chat/data/japan_cities.parquet`).

### 2. Look at the schema and a summary — the basic move of exploration

```sql
DESCRIBE "japan_cities";
```

Column names and types appear. Here, **pay attention to the geometry column**. This sample is a
**GeoParquet** (Parquet with geo metadata), and because the spatial extension recognizes that metadata at load time,
the `geom` column shows up as **`GEOMETRY` type from the start**. So it goes **straight onto the map with no
conversion** (this is why chapter 01's demo worked in one shot). **Always use column names exactly as
`DESCRIBE` shows them** (don't guess).

> **When conversion is needed**: For a **plain Parquet** without geo metadata where WKB sits in a `BLOB` column,
> use `ST_GeomFromWKB("column")`; when a **WKT string** is in a CSV or similar, use `ST_GeomFromText("column")`
> to convert to `GEOMETRY`. In either case, **check the type with `DESCRIBE` first.**

Next, grab each column's min/max/avg/null-rate and so on in one shot:

```sql
SUMMARIZE "japan_cities";
```

Knowing the actual range of the numeric columns pays off later when deciding "the color breaks (0/10000/50000…)."
And a preview:

```sql
SELECT * FROM "japan_cities" LIMIT 5;
```

### 3. Use spatial functions

Since `geom` is already `GEOMETRY` type, you can apply spatial functions **directly** to `japan_cities`.
Let's compute area and centroid. (`ST_Area` is computed in the units of the coordinate system. **Running `ST_Area`
on raw WGS84 lat/lon gives "degrees²," which is meaningless as an area**, so to measure in meters you project first
and then measure.)

```sql
-- Check the geometry type and centroid (centroid kept in WGS84 for display)
SELECT ST_GeometryType("geom") AS gtype,
       ST_AsText(ST_Centroid("geom")) AS centroid
FROM "japan_cities" LIMIT 5;

-- Area in meters after projecting (EPSG:6677 = an example, JGD2011 Plane Rectangular CS zone IX)
SELECT ST_AsText(ST_Centroid("geom")) AS centroid,
       ST_Area(ST_Transform("geom", 'EPSG:4326', 'EPSG:6677', always_xy := true)) AS area_m2
FROM "japan_cities"
ORDER BY area_m2 DESC
LIMIT 10;
```

> **The axis-order trap**: `ST_Transform` interprets axis order as declared by the CRS. EPSG:4326 is declared as
> (lat, lon), so unless you pass `always_xy := true` to have it treat coordinates as (lon, lat), X and Y swap and the
> geometry flies to the other side of the planet. This is covered in more detail by the `duckdb.spatial` skill in
> chapter 06.

### 4. Try loading your own data

Beyond the built-in data, let's load **data of your own.** The built-in datasets come up from a single chip
(typing a long URL during the demo was error-prone), but any external data is loaded from the SQL tab's
"Import from URL." DuckDB can read files directly over HTTPS. But since the browser does the reading,
**the remote server must allow CORS** (details in
[appendix-troubleshooting.md](./appendix-troubleshooting.md)). In the SQL tab:

```sql
CREATE TABLE "t" AS SELECT * FROM read_csv_auto('https://example.com/data.csv');
DESCRIBE "t";   -- always check the schema after loading
```

## ④ Hands-on exercise

1. Load `japan_prefectures.parquet` as `japan_prefectures` and run `DESCRIBE` and `SUMMARIZE` on it.
   Look for a join key (a code column, etc.) that could work in common with `japan_cities`.
2. From the `SUMMARIZE` of `japan_cities`, identify the population column and count the number of
   "cities with a population of 100,000 or more" with `SELECT count(*) … WHERE`.
   Notice that this reproduces chapter 01's demo **by hand**.
3. In `japan_cities`, pick the single city with the largest area and print its centroid coordinates with
   `ST_AsText(ST_Centroid(...))`. Watch out for the trap that dividing two integer columns truncates
   (`491/2 = 245`) — if you want a ratio, multiply by `* 1.0`.

## ⑤ Deep-dive box (optional) — how map tiles are made

When "drawing on the map," geo-chat does not send the table to a server. It **generates vector tiles (MVT) with the
in-browser DuckDB spatial** and hands them to MapLibre. The center of this is the `ST_AsMVT` function.

- `generateVectorTileQuery()` in `src/lib/map/mvtQuery.ts` assembles the SQL that builds one tile's worth of MVT
  (`ST_AsMVTGeom` transforms into tile coordinates → `ST_AsMVT` encodes it).
- `src/lib/map/tileProtocol.ts` registers a **custom protocol** with MapLibre —
  `duckdb://<table>/{z}/{x}/{y}.mvt` — and runs the SQL above on every tile request to return the bytes.

In other words, on every pan and zoom of the map, DuckDB is turning a spatial query behind the scenes.
The details of "why the map can be colored in the browser alone" are covered in
[05. The declarative-spec boundary](./05-declarative-specs.md). For now, take away the single point that
"for both map and chart, the execution layer is the same DuckDB."

Next is [03. Witnessing the loop](./03-agent-loop.md). There, for the first time, we take apart — in both code and
DevTools — how **the agent turns the bare-handed SQL automatically**.
