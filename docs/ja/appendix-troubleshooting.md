# 付録: トラブルシューティング

ワークショップ中に遭遇しがちな問題と対処です。症状から引いてください。

---

## ブランチ切り替えのハマりどころ

このワークショップは章ブランチを `git switch` で行き来します（[00-setup.md](./00-setup.md)）。
ここ特有の詰まりポイント:

### 切り替えたのに挙動が変わらない

- **開発サーバを再起動** してください（`Ctrl+C` → `npm run dev`）。Vite は多くの変更を
  自動で読み直しますが、章によってモジュール構成が変わるため、確実を期すなら再起動が安全です。
- **特に 50 章（`chapter/04-skills`）と `main` のスキルは、ビルド時 glob** で読み込まれます。
  スキルの有無が変わるブランチ移動では **必ず再起動** を。
- ブラウザ側もハードリロード（Cmd/Ctrl+Shift+R）すると、古いバンドルの取り違えを防げます。

### API キーを入れ直す必要はある？

- **いりません。** キーはブラウザの **localStorage** に保存され、`git switch` では消えません。
  一度入れれば、全章を通して使えます（キーを消したいときは Settings かブラウザの
  localStorage をクリア）。

### `git switch` がローカル変更で失敗する

- 壊す実験などで編集したまま切り替えようとすると、Git が上書きを拒みます。観察に徹するなら
  `git restore .`（変更を捨てる）か `git stash`（退避）してから切り替えてください。

---

## API キー関連

### `401` / `unauthorized` / `check your API key`

キーが誤っているか未設定です。Settings を開き `sk-ant-…` を貼り直してください。
`useAgentChat.ts` の `friendlyError` が、401 系のメッセージに
「check your API key in Settings.」を自動で付け足します。

### `credit balance is too low` / `400`

キーは正しくても、Anthropic アカウントの **クレジット残高が 0** です。
[console.anthropic.com](https://console.anthropic.com) の Billing で
プリペイドクレジットをチャージしてください（[00-setup.md](./00-setup.md) ステップ 3）。

### `429` / `rate limit`

短時間にリクエストを送りすぎました。少し待って再送します。`friendlyError` が
「rate limit reached; wait a moment and try again.」を付けます。当日、多人数が
同じキーを共有していると起きやすいので、その場合は各自のキーに分けるのが確実です。

---

## リモートファイルの読み込みで失敗する（CORS）

**症状**: SQL タブの「Import from URL」やチャットでの URL 読み込みが、
`Failed to fetch` や CORS エラーで失敗する。

**原因**: geo-chat は完全クライアントサイドで、ファイルは **ブラウザが直接 fetch** します
（`createTableFromUrl` in `src/lib/duckdb/db.ts`）。そのため、**配信元サーバが
CORS（`Access-Control-Allow-Origin`）を許可していない** と、ブラウザがブロックします。
これはアプリのバグではなく、Web のセキュリティ仕様です。

**対処**:

- **CORS 対応のホストを使う** — GitHub の raw、多くのオープンデータ配信、S3 の
  CORS 設定済みバケットなど。
- **ダウンロードして再配信** — ファイルを落として `public/data/` に置き、
  `/geo-chat/data/<file>` として読む（バンドル済みサンプルと同じ方式。同一オリジンなので CORS 不要）。
- **プロキシ** — CORS を付与するプロキシ経由にする（ワークショップでは非推奨・自己責任）。

> バンドル済みサンプル（`japan_cities.parquet` 等）が読めて外部 URL が読めない場合、
> ほぼ CORS が原因です。

---

## 画面が真っ白 / DuckDB が初期化されない（アプリが起動しない）

**症状**: SQL タブが「Initializing DuckDB…」のまま進まない、または画面が真っ白のまま。

**原因**: DuckDB-WASM の初期化は **WebAssembly と Web Worker** に依存します。これらが使えない
環境——古いブラウザ、`file://` で直接開いた、拡張機能が worker やスクリプトを止めている等——では
初期化が進みません。

> geo-chat は **SharedArrayBuffer を使いません**（`vite.config.ts` に COOP/COEP ヘッダの設定も
> ありません）。`SharedArrayBuffer is not defined` 系のエラーが起点ではないので、その方向は
> 調べなくて大丈夫です。

**対処**:

- **`npm run dev` のローカル URL で開く** — ファイルを直接 `file://` で開くと動きません。
- **対応ブラウザを最新に** — Chrome / Edge / Firefox の最新版を推奨。下記「ブラウザ対応」を参照。
- **拡張機能を疑う** — スクリプトや WebWorker をブロックする拡張があれば無効化するか、
  シークレットウィンドウで再確認する。

---

## 地図に何も出ない

Map タブが空、または「Table “…” has no geometry column to display.」と出る場合、
原因は主に 3 つです。

### (a) ジオメトリ列が `GEOMETRY` 型でない

地図に出せるのは `GEOMETRY` 型の列だけです（`detectGeometryColumn` は `GEOMETRY` 型の列を
探します）。**付属サンプル（GeoParquet）は spatial 拡張が geo メタデータを認識するため、
読み込むと自動で `GEOMETRY` になります**——なので変換は不要です。

一方、geo メタデータの無い **ただの Parquet** で WKB が `BLOB` 列に入っていたり、CSV に
**WKT 文字列** で入っていると、そのままでは出ません。`DESCRIBE` で型を確認し、変換してください:

```sql
CREATE TABLE "t_geom" AS
SELECT * REPLACE (ST_GeomFromWKB("geom") AS "geom") FROM "t";
```

（WKT 文字列なら `ST_GeomFromText`。）

### (b) WGS84（EPSG:4326）でない

地図は **経度緯度 (lon, lat)** を前提とします。投影座標系のままだと、範囲計算
（`getTableBounds` in `src/lib/map/geometry.ts`）が「緯度経度の範囲外」を検知して
**bounds を null にし、地図が正しい場所へズームしません**。4326 に変換します
（**軸順の罠に注意**、`always_xy := true`）:

```sql
CREATE TABLE "t_wgs84" AS
SELECT * REPLACE (ST_Transform("geom", 'EPSG:6677', 'EPSG:4326', always_xy := true) AS "geom")
FROM "t";
```

> **50 章の観察との関係**: この軸順の罠（`always_xy` 忘れ）は、まさにスキル層の観察で
> エージェントが踏んだバグです。`duckdb.spatial` スキルを取得したモデルは `always_xy := true`
> を付けて自己修正しました。人間も同じところで詰まります。

### (c) 行が 0 件 / ジオメトリが NULL

フィルタや結合で結果が空になっていないか確認します。特に空間結合で
`INNER JOIN` を使うと該当なしの地物が消えます。カウント表示なら `LEFT JOIN` を検討
（`map.geospatial` スキル参照）。`SELECT count(*) FROM "t" WHERE "geom" IS NOT NULL` で確認。

> **切り分けのコツ**: 地図が「正しい場所にズームしたのに何も描かれない」なら、
> ジオメトリは有効だが SELECT で属性/対象を落としている可能性が高い（上記 c）。
> 「世界地図のまま動かない」なら座標系（b）かジオメトリ型（a）を疑います。

### (d) 地図ツールが「先にスキルを取れ」と拒否した（50 章 / main のみ）

スキル層のあるブランチ（`chapter/04-skills` / `main`）では、`update_map_style` は
`map.*` スキルを取得するまで **副作用なしで拒否** します。ツールカードの output に
`Fetch the 'map.styling' skill…` が出ていたら、それは前提ゲート（50 章）です。バグでは
ありません——モデルは通常、これを読んで自分で `get_skill` を呼び直します。

---

## グラフが空 / 描画されない

**症状**: Chart タブでグラフが出ない、軸が空。

**原因の筆頭は列名の不一致** です。`encoding` の `field` が実在列と違う（全角/半角、
NFC 正規化、大文字小文字の差を含む）と描画できません。

**対処**:

- `DESCRIBE "<table>"` で **正確な列名** を確認し、spec の `field` に使う。
- チャット経由なら（検証層のあるブランチでは）`update_chart_spec` が列名を照合・自動補正し、
  無い列は error を返します（40 章 / `chartSpecValidation.ts`）。ツールカードの output に
  `corrected` や error が出ていないか見る。**30 章（naive）では自動補正が無い** ことも思い出す。
- 手編集（ChartPanel のエディタ）では自動補正は効きません。手で合わせてください。
- `data` / `width` / `height` を spec に **書かない**（アプリが注入。検証層では拒否される）。
- `type`（quantitative / nominal / ordinal / temporal）を各チャネルに明示する
  （`vega.basics` スキル参照）。

---

## evals が動かない（60 章 / main）

- **全部 skip される**: キーが見つかっていません。`.env`（リポジトリ直下、gitignore 済み）に
  `ANTHROPIC_API_KEY=sk-ant-…` を 1 行置いてください。`vitest.workspace.ts` がこれを
  evals バンドルに注入します。キーが無いと suite は **綺麗に skip**（失敗ではない）します。
- **`npm run check` や CI で evals が走ってしまう**: 走りません。evals は独立した vitest
  プロジェクトで、`test:evals` でしか実行されません（課金対策）。
- **高くつく / 遅い**: `VITE_EVAL_RUNS=1` で回数を絞る。既定は 2。

---

## npm / 開発サーバ

- **`npm install` が失敗する**: Node.js のバージョンを確認（`node -v`、**20 以上**）。
- **`npm run dev` のポートが使われている**: 別プロセスが 5173 を使用中。停止するか、
  Vite が自動で次のポートを選ぶのでその URL を開く。
- **スキルを足したのにカタログに出ない**: スキルは **ビルド時 glob** で読み込むため、
  ファイル追加後は **開発サーバを再起動**（`Ctrl+C` → `npm run dev`）してください（50 章）。
- **ツールを足したのにモデルが使わない**: `src/lib/ai/tools/index.ts` の `createTools` に
  **登録し忘れ** ていないか確認（登録しないと `tools` に出ずモデルから見えません）。

---

## ブラウザ対応

geo-chat は **WebAssembly + Web Worker** を必要とします。
**Chrome / Edge / Firefox の最新版** を推奨します。Safari でも新しめのバージョンなら
動きますが、WASM / worker 周りの挙動差で問題が出たら Chrome 系で再確認してください。
モバイルブラウザや、拡張機能でスクリプト/worker を制限している環境は非対応です。

---

困ったら、まず **チャットのツールカードを開いて `input` / `output` を読む**、
次に **DevTools の Network で `api.anthropic.com` の往復を見る**（20 章）——
この 2 つで、大半の「なぜ動かない」は原因の層まで切り分けられます。
