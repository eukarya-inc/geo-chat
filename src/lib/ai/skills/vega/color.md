---
description: Coloring Vega-Lite charts — quantitative gradients, categorical schemes, custom/conditional colors, legends
tasks: 色, 色分け, カラー, グラデーション, 凡例, color, gradient, scheme, legend, 円グラフ, pie
deps: vega.basics
---

## Coloring charts

Color is set through the `color` encoding channel. How you configure its `scale`
depends on whether the field is quantitative or categorical.

### Quantitative gradients

For a numeric field, use a sequential `scheme`. Without one, Vega-Lite defaults to
blue and ignores any color the user asked for.

```json
{ "color": { "field": "count", "type": "quantitative", "scale": { "scheme": "reds" } } }
```

| Ask                | scheme             |
| ------------------ | ------------------ |
| red                | `reds`             |
| blue               | `blues`            |
| green              | `greens`           |
| orange             | `oranges`          |
| purple             | `purples`          |
| high-contrast heat | `viridis`, `magma` |

For a value that diverges around a midpoint (e.g. change vs. baseline) use a diverging
scheme like `redblue` or `blueorange` with an explicit `domainMid`.

### Categorical schemes

For a nominal field, a categorical `scheme` assigns one color per value:

```json
{ "color": { "field": "category", "type": "nominal", "scale": { "scheme": "tableau10" } } }
```

Good categorical schemes: `tableau10`, `category10`, `set2`, `dark2`.

### Custom colors per category

To pin specific colors to specific categories, use `scale.domain` (the values) and
`scale.range` (the hex colors, same order). Query the distinct values first so you
cover them all.

```json
{
    "color": {
        "field": "landuse",
        "type": "nominal",
        "scale": {
            "domain": ["urban", "farmland", "forest", "water"],
            "range": ["#d1495b", "#edae49", "#66a182", "#2e86ab"]
        }
    }
}
```

Setting a color on the `mark` (e.g. `"mark": {"color": "#f00"}`) does **not** override
category colors — it only applies when there is no `color` encoding.

### Conditional colors

Color a mark based on a condition using `condition`:

```json
{
    "color": {
        "condition": { "test": "datum.value > 100", "value": "#d1495b" },
        "value": "#cccccc"
    }
}
```

### Legend configuration

The `color` encoding produces a legend automatically. Adjust it via `legend`:

```json
{ "color": { "field": "category", "type": "nominal", "legend": { "title": "Land use", "orient": "right" } } }
```

Set `"legend": null` to hide it (e.g. when the category is already on an axis). Give
every legend a human-readable `title`.

### Pie charts

Use `"mark": "arc"` with `theta` (the value) and `color` (the category). Do not use
`x`/`y`. Add `"innerRadius": 50` to the mark for a donut. Always keep a `tooltip`.

```json
{
    "mark": "arc",
    "encoding": {
        "theta": { "field": "count", "type": "quantitative" },
        "color": { "field": "category", "type": "nominal" },
        "tooltip": [
            { "field": "category", "type": "nominal" },
            { "field": "count", "type": "quantitative" }
        ]
    }
}
```
