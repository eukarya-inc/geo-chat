---
description: Core DuckDB SQL discipline — quoting, LIMIT, DESCRIBE/SUMMARIZE, integer division, error recovery
tasks: SQL, テーブル確認, DESCRIBE, SUMMARIZE, カラム名, エラー, integer division, quoting
---

## DuckDB SQL basics

The database is DuckDB-WASM running in the browser (schema `main`). Every table you
create with `duckdb_query` persists for the session and can be shown on the Table,
Map, and Chart tabs.

### Explore before you write

```sql
SHOW TABLES;                 -- what exists
DESCRIBE "cities";           -- column names and types (copy names verbatim)
SUMMARIZE "cities";          -- per-column min/max/avg/count/null% in one shot
SELECT * FROM "cities" LIMIT 5;
```

`SUMMARIZE` is the fastest way to understand a numeric column's range before you
build color breaks or bins. Always run `DESCRIBE` first so you use the exact column
names — never guess them.

### Quoting identifiers

Wrap table and column names in **double quotes** whenever they contain non-ASCII
characters, spaces, or start with a digit. It is always safe to quote, so quote by
default.

- CORRECT: `SELECT "都道府県名", "人口" FROM "市区町村" WHERE "人口" > 100000;`
- WRONG: `SELECT 都道府県名, 人口 FROM 市区町村;` — may fail to parse

String **literals** use single quotes: `WHERE "pref" = '東京都'`.

### One statement per call

Run exactly one SQL statement per `duckdb_query` call. Never chain statements with
semicolons in a single call — split them into separate calls.

### LIMIT discipline

Add `LIMIT` to every exploratory `SELECT`. The tool only returns a few rows to you
anyway, so a missing LIMIT just wastes work. When a result is worth visualizing,
`CREATE TABLE "result" AS SELECT …` (no LIMIT) so the whole table is available to the
Map/Chart tabs — do not return a giant SELECT.

### Never rely on integer division

`INTEGER / INTEGER` truncates in DuckDB: `491 / 2` is `245`, not `245.5`. This
silently corrupts rates, ratios, and rankings. Multiply by `1.0` first:

- WRONG: `"deaths" / "population"`
- CORRECT: `"deaths" * 1.0 / "population"`

### Full-width vs half-width column names

Japanese data often uses full-width punctuation in names: `（）「」・` etc. These are
distinct characters from their half-width forms `()`. Copy names exactly as
`DESCRIBE` prints them.

- WRONG: `"物件数(公開中)"` — half-width `()`
- CORRECT: `"物件数（公開中）"` — full-width `（）` as stored

### Error recovery

- **"Table … does not exist! Did you mean 'X'?"** — the name in _Did you mean_ is the
  correct one (usually a full-width/half-width difference). Use that exact string on
  your next call; do not retype it by hand and do not repeat the failed query.
- **"Referenced column … not found"** — run `DESCRIBE` and copy the real name. DuckDB
  often suggests the closest match; trust it.
- **"Conversion Error" / cast failures** — a column you assumed was numeric is text.
  `TRY_CAST("col" AS DOUBLE)` returns NULL instead of erroring, which is safer for
  dirty data.

### Handy patterns

```sql
-- distinct values and their counts (great before choosing categorical colors)
SELECT "category", count(*) AS n FROM "t" GROUP BY "category" ORDER BY n DESC;

-- generate_series returns a list; unnest it into rows
SELECT unnest(generate_series(1, 10)) AS n;
```
