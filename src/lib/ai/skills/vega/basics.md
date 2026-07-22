---
description: REQUIRED before any chart — Vega-Lite spec structure, explicit encoding types, tooltips, aggregates, top-N, fold
tasks: グラフ, チャート, 可視化, 棒グラフ, 折れ線, 散布図, ヒストグラム, graph, chart, plot, visualize
---

## Vega-Lite specs for update_chart_spec

`update_chart_spec` takes `{ table, spec }`. The spec is a Vega-Lite spec that the app
compiles before applying, then renders by injecting the table's rows.

### Never set data / width / height

The app injects `data`, `width`, and `height` at render time. If you include any of
them the tool rejects the spec. Provide only `mark` and `encoding` (plus `transform`,
`title`, etc.).

```json
{
    "mark": "bar",
    "encoding": {
        "x": { "field": "prefecture", "type": "nominal" },
        "y": { "field": "population", "type": "quantitative" },
        "tooltip": [
            { "field": "prefecture", "type": "nominal" },
            { "field": "population", "type": "quantitative" }
        ]
    }
}
```

### Always specify encoding types explicitly

Every channel needs a `type`:

- `quantitative` — numbers (counts, amounts, ratios)
- `nominal` — unordered categories (names, codes)
- `ordinal` — ordered categories (small/medium/large, ranks)
- `temporal` — dates and timestamps

Guessing wrong (e.g. a year read as quantitative) produces misleading axes.

### Always include tooltip

Add a `tooltip` to every chart so users can inspect values. List the relevant fields
with their types, as above.

### Aggregate only when you mean to

Add `"aggregate"` to a channel only to compute a summary across groups. If your SQL
already aggregated the data, do **not** aggregate again in Vega — you would double-
count.

```json
// count rows per category, computed in Vega
{
    "mark": "bar",
    "encoding": {
        "x": { "field": "category", "type": "nominal" },
        "y": { "aggregate": "count", "type": "quantitative" }
    }
}
```

Prefer aggregating in SQL (`GROUP BY`) for anything non-trivial, then chart the result
directly — it is easier to verify and keeps specs simple.

### Top-N with sort

Filter to the top rows in SQL (`ORDER BY … DESC LIMIT 10`), then sort the axis in the
spec so bars read in order:

```json
{
    "mark": "bar",
    "encoding": {
        "y": { "field": "city", "type": "nominal", "sort": "-x" },
        "x": { "field": "pop", "type": "quantitative" }
    }
}
```

`"sort": "-x"` orders the category axis by descending x value. Use a horizontal bar
(category on `y`) when labels are long.

### Multi-series with fold

When one row has several value columns you want as separate series (e.g. `y2020`,
`y2021`, `y2022`), use a `fold` transform to reshape them into key/value, then color by
the key:

```json
{
    "transform": [{ "fold": ["y2020", "y2021", "y2022"], "as": ["year", "value"] }],
    "mark": "line",
    "encoding": {
        "x": { "field": "year", "type": "nominal" },
        "y": { "field": "value", "type": "quantitative" },
        "color": { "field": "series", "type": "nominal" },
        "tooltip": [
            { "field": "series", "type": "nominal" },
            { "field": "year", "type": "nominal" },
            { "field": "value", "type": "quantitative" }
        ]
    }
}
```

Whenever the data has multiple groups/categories, add a `color` encoding so they are
visually distinguishable.
