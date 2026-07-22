---
description: End-to-end map workflows — building a display table, joining attributes to geometry, aggregation, choropleth recipe
tasks: 地図表示, 可視化ワークフロー, 集計, ポイント集計, choropleth workflow, 空間結合, spatial join, 地図に表示
deps: map.styling, duckdb.spatial
---

## From data to a map: the workflow

The map renders **one DuckDB table** that has a `GEOMETRY` column. The recipe is
always: shape the data with SQL into a clean result table, then call
`update_map_style` on it.

### When to create a new table

Create a dedicated result table (rather than styling a raw source) whenever you:

- join attributes onto geometry,
- aggregate (counts/sums per area),
- filter to a subset,
- or build derived geometry (points from lon/lat, lines, centroids).

Give it a clear name (`cities_by_pop`, `crimes_per_ward`) so the visual tabs and later
turns can refer to it.

### Joining attributes to geometry

Boundary/geometry tables and attribute tables usually live apart. Join on a shared key,
keeping the geometry column:

```sql
CREATE TABLE "wards_pop" AS
SELECT w.geometry, w."ward_name", p."population"
FROM "wards" w
JOIN "population" p ON w."ward_code" = p."code";
```

Then choropleth it:

```json
{
    "table": "wards_pop",
    "geometryType": "polygon",
    "paint": {
        "fill-color": [
            "interpolate",
            ["linear"],
            ["get", "population"],
            0,
            "#fee5d9",
            50000,
            "#fb6a4a",
            200000,
            "#cb181d"
        ],
        "fill-opacity": 0.6
    }
}
```

### Point-in-polygon aggregation (count points per area)

A very common request: "how many X in each area". Spatial-join points to polygons,
group, and keep the polygon geometry so the counts can be shaded.

```sql
CREATE TABLE "incidents_per_ward" AS
SELECT w.geometry, w."ward_name", count(i.*) AS "incident_count"
FROM "wards" w
LEFT JOIN "incidents" i ON ST_Contains(w.geometry, i.geometry)
GROUP BY w.geometry, w."ward_name";
```

`LEFT JOIN` keeps wards with zero incidents (they show as the low end of the ramp
rather than disappearing). Then style `"incident_count"` as a choropleth.

### Choropleth end-to-end checklist

1. `DESCRIBE` / `SUMMARIZE` the inputs; confirm the geometry column is `GEOMETRY` and
   in WGS84 lon/lat (convert `BLOB` with `ST_GeomFromWKB`).
2. Build one result table: join or aggregate the metric onto the polygons.
3. `SUMMARIZE` the metric column to find its real range/percentiles.
4. Call `update_map_style` with `geometryType: "polygon"` and an `interpolate`/`step`
   `fill-color` whose breaks sit at those percentiles, plus `fill-opacity` ~0.6.
5. If nothing appears but the map zoomed correctly, the result table has geometry but
   the query lost the metric — re-check the SELECT list.

### Points and lines

- Points: `SELECT ST_Point("lon","lat") AS geometry, … ` then `geometryType: "point"`,
  size by a value with `circle-radius` interpolate.
- Lines (origin→destination): `ST_MakeLine(ST_Point(o_lon,o_lat), ST_Point(d_lon,d_lat))`
  — never use a polygon's geometry as a "route"; that draws a giant blob.

Keep results in EPSG:4326 (lon, lat) so the map places them correctly.
