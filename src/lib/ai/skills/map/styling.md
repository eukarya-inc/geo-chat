---
description: REQUIRED before styling the map — TableMapStyle shape, paint per geometry, data-driven expressions, choropleth ramps
tasks: 地図, 地図スタイル, 色分け, スタイル, map, map style, choropleth, 塗り分け, ポイント, ライン, ポリゴン
---

## Styling the map with update_map_style

`update_map_style` takes `{ table, geometryType, paint, layout? }` and applies a
**TableMapStyle** to one table:

```json
{
    "table": "cities",
    "geometryType": "point",
    "paint": { "circle-radius": 5, "circle-color": "#2563eb" }
}
```

- `geometryType` is one of `point`, `line`, `polygon` — match it to the table's
  geometry.
- `paint` is a MapLibre paint-property bag. `layout` is optional (visibility, sort
  order, text placement).

### Paint properties are prefixed by geometry

The paint keys **must** match the layer type, or the tool rejects them:

| geometryType | prefix    | common keys                                                                                     |
| ------------ | --------- | ----------------------------------------------------------------------------------------------- |
| `point`      | `circle-` | `circle-radius`, `circle-color`, `circle-opacity`, `circle-stroke-width`, `circle-stroke-color` |
| `line`       | `line-`   | `line-color`, `line-width`, `line-opacity`, `line-dasharray`                                    |
| `polygon`    | `fill-`   | `fill-color`, `fill-opacity`, `fill-outline-color`                                              |

### Reference columns with direct `["get", …]`

Every non-geometry column is available as a feature property. Access it with direct
property access only:

- CORRECT: `["get", "population"]`
- WRONG: `["get", "properties", ["get", "population"]]` — never wrap in `properties`

### Data-driven color

**Choropleth (continuous):** `interpolate` maps a numeric column onto a color ramp.
Run `SUMMARIZE` first and place the breaks at real percentiles of the data.

```json
{
    "fill-color": [
        "interpolate",
        ["linear"],
        ["get", "population"],
        0,
        "#fee5d9",
        10000,
        "#fcae91",
        50000,
        "#fb6a4a",
        100000,
        "#cb181d"
    ]
}
```

**Binned (discrete steps):** `step` gives hard class breaks.

```json
{ "fill-color": ["step", ["get", "density"], "#ffffcc", 100, "#fd8d3c", 500, "#e31a1c"] }
```

**Categorical:** `match` (exact values) or `case` (conditions), always ending in a
fallback color string.

```json
{
    "fill-color": [
        "match",
        ["get", "landuse"],
        "urban",
        "#d1495b",
        "farmland",
        "#edae49",
        "forest",
        "#66a182",
        "#cccccc"
    ]
}
```

### Well-formed expressions (no `null` placeholders)

Every slot of an expression must hold a real value. If validation rejects a style, fix
the expression — do **not** insert `null`.

- WRONG: `["==", null, "urban"]` — left side must be `["get", "landuse"]`
- WRONG: `["interpolate", null, null, 0, "#fff", 1, "#000"]` — needs `["linear"]` and a `["get", …]` input
- WRONG: `["case", cond, result, null]` — final fallback must be a color string like `"#cccccc"`
- CORRECT: `["case", ["==", ["get", "cat"], "A"], "#10b981", "#cccccc"]`

### Data-driven size and width

```json
{ "circle-radius": ["interpolate", ["linear"], ["get", "count"], 0, 4, 1000, 24] }
{ "line-width":    ["interpolate", ["linear"], ["get", "volume"], 0, 1, 5000, 8] }
```

### Color-code by category on ONE map

To color categories on a single map, build **one** table with a category column, then
use a single `match`/`case` expression. Do not create a separate table per category
with different solid colors — that produces disconnected layers with no shared legend.

```sql
CREATE TABLE "combined" AS
  SELECT *, 'A' AS category FROM "a"
  UNION ALL BY NAME
  SELECT *, 'B' AS category FROM "b";
```

Reusable ramps for choropleths: sequential `#fee5d9→#fcae91→#fb6a4a→#cb181d` (reds),
`#edf8fb→#b2e2e2→#66c2a4→#238b45` (greens). Add `"fill-opacity": 0.6` so basemap
context shows through polygons.
