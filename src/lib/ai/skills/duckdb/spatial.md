---
description: DuckDB spatial extension — ST_ functions, geometry conventions, projection and axis-order traps
tasks: 空間, 地理, spatial, ST_, ジオメトリ, geometry, 投影, projection, 距離, 面積, buffer, 交差
deps: duckdb.basics
---

## DuckDB spatial functions

The spatial extension is already installed and loaded — `ST_*` functions are ready.

### Geometry convention in this app

The map expects **WGS84 longitude/latitude** (EPSG:4326), coordinate order **(lon,
lat)**. A table is drawable when it has a `GEOMETRY`-typed column. Keep the geometry
column named `geometry` (or `geom`) so the map picks it up.

### Constructing and inspecting geometry

```sql
-- point from lon/lat columns (NOTE: longitude first)
SELECT ST_Point("lon", "lat") AS geometry FROM "places";

-- a line between two points
SELECT ST_MakeLine(ST_Point(o_lon, o_lat), ST_Point(d_lon, d_lat)) AS geometry FROM "routes";

-- read text back for debugging (always your first move when geometry looks wrong)
SELECT ST_AsText(geometry) FROM "places" LIMIT 3;
SELECT ST_GeometryType(geometry), ST_X(geometry), ST_Y(geometry) FROM "places" LIMIT 3;
```

If a geometry column is stored as `BLOB` (WKB) rather than `GEOMETRY` — common in
Parquet exports — convert it first: `ST_GeomFromWKB("geom")`. Check the type with
`DESCRIBE` before assuming.

### Predicates and joins

```sql
-- points inside polygons (point-in-polygon)
SELECT p.*, a."name" AS area
FROM "points" p
JOIN "areas" a ON ST_Contains(a.geometry, p.geometry);

-- features that intersect
… WHERE ST_Intersects(a.geometry, b.geometry)

-- everything within a distance (units follow the geometry's CRS — see the caveat)
… WHERE ST_DWithin(a.geometry, b.geometry, 0.01)
```

### Buffers, area, distance — the projection caveat

`ST_Area`, `ST_Length`, `ST_Distance`, `ST_Buffer` and `ST_DWithin` operate in the
**geometry's own units**. For WGS84 lon/lat those units are **degrees**, not meters —
so `ST_Area` on raw lat/lon gives degrees², which is meaningless as land area.

For real metric measurements, transform to a projected CRS first, measure, and (if you
still need to draw it) transform back to 4326:

```sql
-- area in m² for Japan: project to JGD2011 / Japan Plane Rectangular or a UTM zone
SELECT ST_Area(ST_Transform(geometry, 'EPSG:4326', 'EPSG:6677', always_xy := true)) AS area_m2
FROM "areas";
```

**Axis-order trap:** `ST_Transform` defaults to the CRS's declared axis order, which
for EPSG:4326 is (lat, lon) — the _opposite_ of how we store data. Always pass
`always_xy := true` so it treats coordinates as (lon, lat). Forgetting this silently
swaps X and Y and sends geometry to the wrong hemisphere.

For quick approximate distances without projecting, `ST_Distance_Sphere(a, b)` returns
meters directly on lon/lat input.

### Producing output for the map

After a spatial query, `CREATE TABLE "result" AS SELECT …, geometry FROM …` keeping a
`GEOMETRY` column in WGS84, then call `update_map_style` on `"result"`. Verify with
`ST_GeometryType` that the result is the shape you expect (Point / LineString /
Polygon) before styling.
