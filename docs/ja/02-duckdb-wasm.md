# 02. ブラウザの中の GIS 基盤 — DuckDB-WASM

> エージェントが手に持ついちばん重要な道具を、まず **素手で** 触ります。
> ここで SQL に慣れておくと、03 章以降で「エージェントが何をしているか」が透けて見えます。

## ① 概念解説 — DuckDB とは何か、なぜ AI と相性が良いか

**DuckDB** は、組み込み型の **列指向（columnar）** 分析データベースです。
しばしば「分析界の SQLite」と呼ばれます。要点は 4 つ:

- **列指向** — 行ではなく列単位でデータを持つため、集計・フィルタ・分析が速い。
  「人口の平均」「県ごとの件数」のような集計が得意（トランザクション処理は苦手だが、
  分析用途では逆に強み）。
- **組み込み型** — サーバを立てず、ライブラリとしてプロセス内で動く。接続設定が要らない。
- **ファイルを直接読む** — **Parquet / CSV / JSON / GeoJSON をそのまま SQL で読める**。
  事前の ETL やインポート専用ツールが要らない。
- **spatial 拡張** — `ST_Read`, `ST_Point`, `ST_Area`, `ST_Distance`, `ST_Intersects` …
  **PostGIS 相当の空間関数** が使える。

そして geo-chat が使うのは **DuckDB-WASM** — DuckDB を WebAssembly にコンパイルしたもので、
**ブラウザ内で完結** します。サーバ不要・データが手元のブラウザから外に出ません。
FOSS4G 的に言えば「配信も認証もいらない、その場で回る PostGIS」に近い体験です。

### なぜ AI（LLM）と相性が良いのか

> **SQL は、LLM が最も得意とする言語の一つ** です。

LLM に「スキーマ（列名と型）」と「サンプル数行」を見せるだけで、かなり正確なクエリを書きます。
自然言語 →（LLM）→ SQL →（DuckDB）→ 結果、という **text-to-SQL** の流れが、
エージェントの中核になります。逆に言えば、エージェントに良い仕事をさせる鍵は
「どうスキーマとサンプルを見せるか」——これが 03 章の system prompt の話につながります。

## ② コードの読みどころ

### 直列実行キュー — `src/lib/duckdb/db.ts`

DuckDB-WASM は実質シングルスレッドなので、geo-chat は **1 本の共有コネクション** に
全ステートメントを **直列** で流します。複数の呼び出しは、投入順に自分の番を待ちます。

```ts
// src/lib/duckdb/db.ts より（コメント要約）
// One shared connection for the whole app. DuckDB-WASM is effectively
// single-threaded, so we serialize all statements through a promise chain:
// concurrent callers simply await their turn in submission order.
let tail: Promise<unknown> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task); // 前のタスクの後に必ず実行
    tail = run.then(
        () => undefined,
        () => undefined
    );
    return run;
}
```

`executeQuery()` はこの `enqueue` を通ります。エージェントが複数のツール呼び出しで
同時に SQL を投げても、順番に処理されるので壊れません。`getTables()`,
`getTableSchema()`, `createTableFromUrl()` も同じファイルにあります。

### spatial 拡張の初期化 — `src/lib/duckdb/globalDB.ts`

DuckDB インスタンスはプロセス全体で 1 つ（シングルトン）。初期化時に
spatial 拡張を **INSTALL / LOAD** し、決定的な単一スレッドモードに固定しています。

```ts
// src/lib/duckdb/globalDB.ts の initializeDB() より
await conn.query('INSTALL spatial;');
await conn.query('LOAD spatial;');
await conn.query('PRAGMA threads=1;'); // 決定的な単一スレッド
await conn.query("SET memory_limit='4GB';"); // wasm 32bit の上限
```

つまり **アプリ起動時点で `ST_*` 関数はもう使える** ということです。
このおかげで、後述の空間クエリを SQL タブでそのまま試せます。

## ③ 手を動かす — SQL タブで素手の分析

右ペインの **SQL** タブを開きます。ここは「Import from URL」フォーム、テーブル一覧、
SQL エディタ（Cmd/Ctrl+Enter で実行）、結果テーブルから成ります
（`src/components/workspace/SqlPanel.tsx`）。

### 1. サンプルを読み込む

「Import from URL」の下の `Try the bundled sample:` リンクを押すと、
`japan_cities.parquet` の URL とテーブル名 `japan_cities` が自動入力されます。**Import** を押します。
（URL を手で入れるなら `/geo-chat/data/japan_cities.parquet`。）

### 2. スキーマとサマリを見る — 探索の基本動作

```sql
DESCRIBE "japan_cities";
```

列名と型が出ます。ここで **ジオメトリ列に注目** してください。このサンプルは
**GeoParquet**（geo メタデータ付き Parquet）で、spatial 拡張が読み込み時にそのメタデータを
認識するため、`geom` 列は **最初から `GEOMETRY` 型** で現れます。だから **変換なしで
そのまま地図に出せます**（01 章のデモが一発で動いたのはこのため）。**列名は必ず
`DESCRIBE` の表示どおりに** 使ってください（推測しない）。

> **変換が要る場合**: geo メタデータの無い **ただの Parquet** で WKB が `BLOB` 列に
> 入っているときは `ST_GeomFromWKB("列")`、CSV などに **WKT 文字列** で入っているときは
> `ST_GeomFromText("列")` で `GEOMETRY` に変換します。いずれも **まず `DESCRIBE` で型を確認** してから。

次に、1 発で各列の min/max/avg/null 率などを掴みます:

```sql
SUMMARIZE "japan_cities";
```

数値列の実レンジがわかるので、後で「色の区切り（0/10000/50000…）」を決めるときに効きます。
プレビューも:

```sql
SELECT * FROM "japan_cities" LIMIT 5;
```

### 3. 空間関数を使う

`geom` はすでに `GEOMETRY` 型なので、`japan_cities` に **直接** 空間関数をかけられます。
面積や重心を計算してみます。（`ST_Area` は座標系の単位で計算されます。**WGS84 の緯度経度の
まま `ST_Area` すると「度²」になり面積として無意味** なので、メートルで測るには投影してから
測ります。）

```sql
-- ジオメトリの型と重心を確認（重心は表示用に WGS84 のまま）
SELECT ST_GeometryType("geom") AS gtype,
       ST_AsText(ST_Centroid("geom")) AS centroid
FROM "japan_cities" LIMIT 5;

-- 面積は投影してからメートルで（EPSG:6677 = JGD2011 平面直角座標系 IX 系の例）
SELECT ST_AsText(ST_Centroid("geom")) AS centroid,
       ST_Area(ST_Transform("geom", 'EPSG:4326', 'EPSG:6677', always_xy := true)) AS area_m2
FROM "japan_cities"
ORDER BY area_m2 DESC
LIMIT 10;
```

> **軸順の罠**: `ST_Transform` は CRS 宣言どおりの軸順で解釈します。EPSG:4326 は
> 宣言上 (lat, lon) なので、`always_xy := true` を渡して (lon, lat) と扱わせないと、
> X と Y が入れ替わってジオメトリが地球の裏側へ飛びます。詳しくは 06 章の
> `duckdb.spatial` スキルで扱います。

### 4. URL から別データを読む

DuckDB は HTTPS 越しにファイルを直接読めます。ただしブラウザから読むため、
**相手サーバが CORS を許可している必要** があります（詳細は
[appendix-troubleshooting.md](./appendix-troubleshooting.md)）。SQL タブなら:

```sql
CREATE TABLE "t" AS SELECT * FROM read_csv_auto('https://example.com/data.csv');
DESCRIBE "t";   -- 読み込んだら必ずスキーマを確認
```

## ④ 手を動かす課題

1. `japan_prefectures.parquet` を `japan_prefectures` として読み込み、`DESCRIBE` と
   `SUMMARIZE` をかける。`japan_cities` と共通で使えそうな結合キー（コード列など）を探す。
2. `japan_cities` の `SUMMARIZE` から人口列を特定し、
   「人口 10 万人以上の市」の件数を `SELECT count(*) … WHERE` で数える。
   これは 01 章のデモを **手で** 再現していることに気づく。
3. `japan_cities` で、面積が最大の市を 1 つ選び `ST_AsText(ST_Centroid(...))` で
   重心座標を出す。整数列同士の割り算は切り捨てになる罠（`491/2 = 245`）に注意——
   率を出すなら `* 1.0` を掛ける。

## ⑤ 深掘りボックス（任意）— 地図タイルはどう作られるか

「地図に描く」とき、geo-chat はテーブルをサーバに送りません。**ブラウザ内の DuckDB spatial で
ベクタータイル（MVT）を生成** し、MapLibre に渡します。中心は `ST_AsMVT` 関数です。

- `src/lib/map/mvtQuery.ts` の `generateVectorTileQuery()` が、1 タイル分の MVT を作る
  SQL を組み立てます（`ST_AsMVTGeom` でタイル座標へ変換 → `ST_AsMVT` でエンコード）。
- `src/lib/map/tileProtocol.ts` が MapLibre に `duckdb://<table>/{z}/{x}/{y}.mvt` という
  **カスタムプロトコル** を登録し、タイル要求のたびに上の SQL を実行してバイト列を返します。

つまり地図のパン・ズームのたびに、裏で DuckDB が空間クエリを回しているわけです。
この「なぜブラウザだけで地図が塗れるのか」の詳細は
[05. 宣言的 spec という境界線](./05-declarative-specs.md) で扱います。今は
「地図もグラフも、実行系は同じ DuckDB」という一点を持ち帰ってください。

次は [03. ループを目撃する](./03-agent-loop.md)。ここで初めて、素手の SQL を
**エージェントが自動で回す** 様子を、コードと DevTools の両方で分解します。
