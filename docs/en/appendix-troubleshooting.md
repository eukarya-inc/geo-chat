# Appendix: Troubleshooting

Common problems during the workshop and how to fix them. Look yours up by symptom.

---

## Branch-switching gotchas

This workshop moves between chapter branches with `git switch` ([00-setup.md](./00-setup.md)).
Sticking points specific to that:

### Switched, but behavior didn't change

- **Restart the dev server** (`Ctrl+C` → `npm run dev`). Vite reloads many changes
  automatically, but module composition changes between chapters, so a restart is the safe move.
- **Especially the ch. 50 (`chapter/04-skills`) and `main` skills are a build-time glob.** Any
  branch move that changes whether skills exist **requires a restart**.
- A hard browser reload (Cmd/Ctrl+Shift+R) also avoids picking up a stale bundle.

### Do I need to re-enter the API key?

- **No.** The key is stored in the browser's **localStorage** and survives `git switch`. Enter it
  once and it works across all chapters (to remove it, clear Settings or the browser's localStorage).

### `git switch` fails because of local changes

- If you edited files (e.g. during a break-it experiment) and try to switch, Git refuses to
  overwrite. For pure observation, `git restore .` (discard changes) or `git stash` (shelve them)
  before switching.

---

## API key issues

### `401` / `unauthorized` / `check your API key`

The key is wrong or unset. Open Settings and re-paste `sk-ant-…`. `useAgentChat.ts`'s
`friendlyError` appends "check your API key in Settings." to 401-type messages.

### `credit balance is too low` / `400`

The key is fine, but your Anthropic account's **credit balance is zero**. Add prepaid credit under
Billing at [console.anthropic.com](https://console.anthropic.com) ([00-setup.md](./00-setup.md)
step 3).

### `429` / `rate limit`

Too many requests too fast. Wait a moment and resend. `friendlyError` appends "rate limit reached;
wait a moment and try again." This is likelier when many people share one key on the day; splitting
to individual keys is the reliable fix.

---

## Remote file load fails (CORS)

**Symptom**: "Import from URL" in the SQL tab, or a URL load via chat, fails with `Failed to
fetch` or a CORS error.

**Cause**: geo-chat is fully client-side and the **browser fetches files directly**
(`createTableFromUrl` in `src/lib/duckdb/db.ts`). So if the **origin server doesn't allow CORS**
(`Access-Control-Allow-Origin`), the browser blocks it. This is not an app bug — it's a web
security rule.

**Fix**:

- **Use a CORS-enabled host** — GitHub raw, many open-data services, a CORS-configured S3 bucket.
- **Download and re-serve** — drop the file into `public/data/` and read it as `/geo-chat/data/<file>`
  (same method as the bundled samples; same-origin, no CORS needed).
- **Proxy** — go through a proxy that adds CORS (not recommended for the workshop; at your own risk).

> If the bundled samples (`japan_cities.parquet`, etc.) load but an external URL doesn't, it's
> almost certainly CORS.

---

## Blank screen / DuckDB won't initialize (app won't start)

**Symptom**: the SQL tab stays "Initializing DuckDB…", or the screen stays blank.

**Cause**: DuckDB-WASM init depends on **WebAssembly and Web Workers**. Where those aren't
available — old browsers, opened directly via `file://`, an extension blocking workers or scripts —
init stalls.

> geo-chat **does not use SharedArrayBuffer** (there are no COOP/COEP header settings in
> `vite.config.ts` either). A `SharedArrayBuffer is not defined`-type error isn't the root cause,
> so you can skip that avenue.

**Fix**:

- **Open the `npm run dev` local URL** — opening the file directly via `file://` won't work.
- **Use a latest supported browser** — latest Chrome / Edge / Firefox recommended. See "Browser
  support" below.
- **Suspect extensions** — disable any that block scripts or Web Workers, or re-check in an
  incognito window.

---

## Nothing appears on the map

If the Map tab is empty, or you see "Table "…" has no geometry column to display.", there are three
main causes.

### (a) The geometry column isn't `GEOMETRY` type

Only a `GEOMETRY`-typed column can be drawn (`detectGeometryColumn` looks for `GEOMETRY` columns).
**The bundled samples (GeoParquet) become `GEOMETRY` automatically on load** because the spatial
extension recognizes the geo metadata — so no conversion is needed.

But a **plain Parquet** without geo metadata (WKB in a `BLOB` column), or a CSV with **WKT
strings**, won't render as-is. `DESCRIBE` the type and convert:

```sql
CREATE TABLE "t_geom" AS
SELECT * REPLACE (ST_GeomFromWKB("geom") AS "geom") FROM "t";
```

(For WKT strings, `ST_GeomFromText`.)

### (b) Not WGS84 (EPSG:4326)

The map assumes **lon/lat (lon, lat)**. In a projected CRS, the bounds computation
(`getTableBounds` in `src/lib/map/geometry.ts`) detects "outside lat/lon range", **nulls the
bounds, and the map won't zoom to the right place**. Convert to 4326 (**mind the axis-order trap**,
`always_xy := true`):

```sql
CREATE TABLE "t_wgs84" AS
SELECT * REPLACE (ST_Transform("geom", 'EPSG:6677', 'EPSG:4326', always_xy := true) AS "geom")
FROM "t";
```

> **Relation to the ch. 50 observation**: this axis-order trap (forgetting `always_xy`) is exactly
> the bug the agent hit in the skill-layer observation. After fetching the `duckdb.spatial` skill,
> the model self-corrected with `always_xy := true`. Humans trip on the same spot.

### (c) Zero rows / NULL geometry

Check a filter or join didn't empty the result. In particular, spatial joins with `INNER JOIN` drop
features with no match. For a count display, consider `LEFT JOIN` (see the `map.geospatial` skill).
Confirm with `SELECT count(*) FROM "t" WHERE "geom" IS NOT NULL`.

> **Triage tip**: if the map "zoomed to the right place but draws nothing", geometry is likely
> valid but the SELECT dropped attributes/targets (c above). If it's "stuck on the world map",
> suspect the CRS (b) or geometry type (a).

### (d) The map tool refused with "fetch a skill first" (ch. 50 / main only)

On skill-layer branches (`chapter/04-skills` / `main`), `update_map_style` **refuses with no side
effects** until a `map.*` skill is fetched. If the tool card's output shows
`Fetch the 'map.styling' skill…`, that's the prerequisite gate (ch. 50). Not a bug — the model
usually reads it and re-calls `get_skill` on its own.

---

## Chart is empty / doesn't render

**Symptom**: the Chart tab shows no chart, empty axes.

**The leading cause is a column-name mismatch**. If `encoding` `field` differs from a real column
(including full/half-width, NFC normalization, case), it can't render.

**Fix**:

- `DESCRIBE "<table>"` for the **exact column name** and use it in the spec's `field`.
- Via chat (on validation-layer branches), `update_chart_spec` matches/auto-corrects names and
  returns `error` for a missing column (ch. 40 / `chartSpecValidation.ts`). Check the tool card's
  output for `corrected` or an error. Remember that **ch. 30 (naive) has no auto-correction**.
- The hand editor (ChartPanel) does not auto-correct — align it by hand.
- **Never write** `data` / `width` / `height` in the spec (the app injects them; the validation
  layer rejects them).
- Set `type` (quantitative / nominal / ordinal / temporal) explicitly per channel (see the
  `vega.basics` skill).

---

## Evals won't run (ch. 60 / main)

- **Everything skips**: no key found. Put `ANTHROPIC_API_KEY=sk-ant-…` on one line in `.env` (repo
  root, gitignored). `vitest.workspace.ts` injects it into the evals bundle. With no key the suite
  **skips cleanly** (not a failure).
- **Evals run in `npm run check` or CI**: they don't. Evals are a separate vitest project run only
  via `test:evals` (cost protection).
- **Expensive / slow**: narrow the count with `VITE_EVAL_RUNS=1` (default is 2).

---

## npm / dev server

- **`npm install` fails**: check the Node.js version (`node -v`, **20+**).
- **`npm run dev` port in use**: another process holds 5173. Stop it, or open the URL Vite picks
  automatically for the next port.
- **Added a skill but it's not in the catalog**: skills load via a **build-time glob**, so after
  adding a file, **restart the dev server** (`Ctrl+C` → `npm run dev`) (ch. 50).
- **Added a tool but the model won't use it**: check you didn't **forget to register** it in
  `createTools` in `src/lib/ai/tools/index.ts` (unregistered = not in `tools` = invisible to the
  model).

---

## Browser support

geo-chat requires **WebAssembly + Web Workers**. **Latest Chrome / Edge / Firefox** recommended.
Safari works on recent versions, but if WASM/worker behavior differences cause trouble, re-check on
a Chrome-family browser. Mobile browsers, and environments that restrict scripts/workers via
extensions, are unsupported.

---

When stuck, first **open the chat's tool card and read `input` / `output`**, then **watch the
`api.anthropic.com` round-trips in DevTools Network** (ch. 20) — these two triage most "why won't
it work" down to the responsible layer.
