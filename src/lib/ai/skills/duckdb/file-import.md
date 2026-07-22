---
description: Importing data into DuckDB — Parquet, CSV, JSON, GeoJSON/Shapefile, from local paths or URLs
tasks: ファイル読み込み, インポート, import, CSV, Parquet, JSON, GeoJSON, URL, 読み込み, load, read_csv
deps: duckdb.basics
---

## Importing files into DuckDB

Always **load a file into a table once**, then query the table. Never re-read the same
file across multiple queries.

```sql
CREATE TABLE "cities" AS SELECT * FROM read_csv_auto('https://…/cities.csv');
DESCRIBE "cities";                       -- always verify the schema right after import
SELECT * FROM "cities" LIMIT 5;
```

### Pick the reader by format

| Format                              | Reader                                                  |
| ----------------------------------- | ------------------------------------------------------- |
| Parquet                             | `read_parquet('…')` or just `SELECT * FROM '….parquet'` |
| CSV / TSV                           | `read_csv_auto('…')` (sniffs delimiter, header, types)  |
| JSON / NDJSON                       | `read_json_auto('…')`                                   |
| GeoJSON, Shapefile, GeoPackage, KML | `ST_Read('…')` — **required** for spatial formats       |

Do **not** use plain `SELECT * FROM 'file.geojson'` for spatial files — use `ST_Read`,
which parses geometry into a `GEOMETRY` column.

```sql
CREATE TABLE "boundaries" AS SELECT * FROM ST_Read('https://…/boundaries.geojson');
```

### Loading from URLs

Remote URLs work directly (DuckDB fetches over HTTPS). Use the URL **exactly** as the
user gave it — do not decode percent-encoding. If a URL contains raw CJK characters
that fail, URL-encode those characters before putting the URL in SQL.

### Encoding and BOM

- `read_csv_auto` usually detects UTF-8. If a file is Shift-JIS/other, decoded text may
  be garbled — there is no charset auto-fix here, so tell the user if the source
  encoding is not UTF-8.
- A UTF-8 BOM can attach to the first column name (e.g. `"﻿id"`). If the first
  column looks off after import, `DESCRIBE` reveals the real name; select it with the
  BOM or re-create the table renaming it.

### Reader options worth knowing

```sql
-- force a column's type, skip malformed rows, or set the header explicitly
CREATE TABLE "t" AS
SELECT * FROM read_csv_auto('…/data.csv',
  header = true,
  types = {'zip': 'VARCHAR'},          -- keep leading zeros as text
  ignore_errors = true);
```

### After every import

Run `DESCRIBE` (types) and a `LIMIT 5` preview. Confirm geometry columns are typed
`GEOMETRY` (not `BLOB` or `VARCHAR`) before you try to map them; convert with
`ST_GeomFromWKB(...)` or `ST_GeomFromText(...)` if needed.
