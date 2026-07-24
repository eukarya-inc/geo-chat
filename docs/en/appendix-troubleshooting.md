# Appendix: Troubleshooting

Problems you're likely to hit during the workshop, and how to deal with them. Look them up by symptom.

---

## API key issues

### `401` / `unauthorized` / `check your API key`

The key is wrong or not set. Open Settings and paste `sk-ant-…` again.
`friendlyError` in `useAgentChat.ts` automatically appends "check your API key in Settings." to 401-family messages.

### `credit balance is too low` / `400`

The key is correct, but your Anthropic account's **credit balance is 0.**
Add prepaid credit under Billing at [console.anthropic.com](https://console.anthropic.com)
(step 3 of [00-setup.md](./00-setup.md)).

### `429` / `rate limit`

You sent too many requests in a short time. Wait a little and resend. `friendlyError` appends
"rate limit reached; wait a moment and try again." It's especially likely to happen when many people share the same
key on the day, so in that case splitting to individual keys is the sure fix.

---

## Loading a remote file fails (CORS)

**Symptom**: Loading a URL from the SQL tab's "Import from URL" or from the chat fails with `Failed to fetch` or a
CORS error.

**Cause**: geo-chat is fully client-side, and the **browser fetches files directly**
(`createTableFromUrl` in `src/lib/duckdb/db.ts`). So if the **serving server does not allow CORS**
(`Access-Control-Allow-Origin`), the browser blocks it. This is not an app bug; it's a web security specification.

**What to do**:

- **Use a CORS-enabled host** — GitHub raw, many open-data distributions, an S3 bucket with CORS configured, etc.
- **Download and re-serve** — grab the file, place it in `public/data/`, and read it as `/geo-chat/data/<file>`
  (the same method as the bundled samples; same-origin, so no CORS needed).
- **Proxy** — go through a proxy that adds CORS (not recommended for the workshop; at your own risk).

> If the bundled samples (`japan_cities.parquet`, etc.) load but an external URL doesn't, it's almost certainly CORS.

---

## Blank screen / DuckDB doesn't initialize (the app doesn't boot)

**Symptom**: The SQL tab is stuck at "Initializing DuckDB…", or the screen stays blank.

**Cause**: DuckDB-WASM initialization depends on **WebAssembly and Web Workers.** In environments where these are
unavailable — an old browser, a page opened directly with `file://`, or an extension that blocks workers/scripts —
initialization does not proceed.

> geo-chat **does not use SharedArrayBuffer** (`vite.config.ts` sets no COOP/COEP headers either). A
> `SharedArrayBuffer is not defined`-style error is not the root cause here, so you can skip that avenue.

**What to do**:

- **Open it at the `npm run dev` local URL** — opening the file directly with `file://` won't work.
- **Update to a supported browser** — the latest Chrome / Edge / Firefox is recommended. See "Browser support" below.
- **Suspect extensions** — if an extension blocks scripts or WebWorkers, disable it or re-check in a private window.

---

## Nothing shows on the map

If the Map tab is empty, or you see "Table “…” has no geometry column to display.", there are mainly 3 causes.

### (a) The geometry column isn't `GEOMETRY` type

Only a `GEOMETRY`-type column can go on the map (`detectGeometryColumn` looks for `GEOMETRY`-type columns).
**The bundled samples (GeoParquet) become `GEOMETRY` automatically on load because the spatial extension recognizes
the geo metadata** — so no conversion is needed.

On the other hand, a **plain Parquet** without geo metadata with WKB in a `BLOB` column, or a CSV with a
**WKT string**, won't show as-is. Check the type with `DESCRIBE` and convert:

```sql
CREATE TABLE "t_geom" AS
SELECT * REPLACE (ST_GeomFromWKB("geom") AS "geom") FROM "t";
```

(For a WKT string, `ST_GeomFromText`.)

### (b) It's not WGS84 (EPSG:4326)

The map assumes **longitude/latitude (lon, lat).** If it's still in a projected CRS, the bounds computation
(`getTableBounds` in `src/lib/map/geometry.ts`) detects "outside the lat/lon range" and **nulls the bounds, so the
map doesn't zoom to the right place.** Convert to 4326 (**mind the axis-order trap**, `always_xy := true`):

```sql
CREATE TABLE "t_wgs84" AS
SELECT * REPLACE (ST_Transform("geom", 'EPSG:6677', 'EPSG:4326', always_xy := true) AS "geom")
FROM "t";
```

### (c) 0 rows / geometry is NULL

Check that a filter or join hasn't made the result empty. In particular, using an `INNER JOIN` in a spatial join
drops features with no match. For a count display, consider a `LEFT JOIN` (see the `map.geospatial` skill).
Confirm with `SELECT count(*) FROM "t" WHERE "geom" IS NOT NULL`.

> **A tip for isolating it**: If the map "zoomed to the right place but nothing is drawn," the geometry is likely valid
> but the SELECT is dropping the attributes/targets (case c above). If it's "stuck on the world map," suspect the
> coordinate system (b) or the geometry type (a).

---

## Chart is empty / doesn't render

**Symptom**: The chart doesn't appear in the Chart tab; the axes are empty.

**The leading cause is a column-name mismatch.** If a `field` in `encoding` differs from an actual column
(including full-width/half-width, NFC normalization, and case differences), it can't render.

**What to do**:

- Confirm the **exact column name** with `DESCRIBE "<table>"` and use it in the spec's `field`.
- Via the chat, `update_chart_spec` matches and auto-corrects column names and errors on a nonexistent column
  (`updateChartSpec.ts`). Check whether `corrected` or an error appears in the tool card's output.
- Hand-editing (in the ChartPanel editor) has no auto-correction. Align it by hand.
- **Don't write** `data` / `width` / `height` in the spec (the app injects them; writing them gets rejected).
- Specify `type` (quantitative / nominal / ordinal / temporal) explicitly on each channel (see the `vega.basics` skill).

---

## Geocoding (Nominatim)

The `geocode_address` tool uses OpenStreetMap's Nominatim
(`src/lib/ai/tools/geocode.ts`).

- **Rate limit**: In line with Nominatim's terms of use, it auto-throttles to **1 request per second**
  (`THROTTLE_MS = 1000`). Asking for many place names at once takes proportionally longer (normal behavior).
- **Odd results**: If a place name is ambiguous, an unexpected location may come back. Make the query more specific by
  adding a prefecture name or the like. For bulk/commercial use, consider Nominatim's terms and self-hosting.

---

## npm / dev server

- **`npm install` fails**: Check your Node.js version (`node -v`, **20 or newer**). Old versions fail on lockfile
  resolution or WASM-related things.
- **The `npm run dev` port is in use**: Another process is using 5173. Stop it, or open the URL Vite auto-picks for the
  next port.
- **Added a skill but it's not in the catalog**: Skills are loaded by a **build-time glob**, so after adding a file
  **restart the dev server** (`Ctrl+C` → `npm run dev`) (chapter 3).
- **Added a tool but the model doesn't use it**: Check that you didn't **forget to register** it in `createTools` in
  `src/lib/ai/tools/index.ts` (if not registered, it doesn't appear in `tools` and the model can't see it).

---

## Browser support

geo-chat requires **WebAssembly + Web Worker.**
We recommend the **latest Chrome / Edge / Firefox.** Safari works too on a recent-enough version, but if problems arise
from behavior differences around WASM / workers, re-check in a Chrome-family browser. Mobile browsers, and environments
that restrict scripts/workers via extensions, are not supported.

---

If you're stuck, first **open the chat's tool card and read the `input` / `output`**, then **look at the round trips of
`api.anthropic.com` in DevTools Network** (chapter 2) — with these two, most "why won't it work" can be isolated down
to the layer that's the cause.
