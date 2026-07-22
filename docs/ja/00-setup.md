# 00. セットアップ

ワークショップを始める前に、geo-chat をローカルで起動し、Anthropic API キーを入れて、
サンプルデータで最初のデモが動くところまで確認します。ここが通れば準備完了です。

所要時間は 10〜15 分。うまくいかないときは
[appendix-troubleshooting.md](./appendix-troubleshooting.md) を参照してください。

## 1. 必要なもの

- **Node.js 20 以上**（`node -v` で確認。20 未満なら [nodejs.org](https://nodejs.org) か
  `nvm` / `volta` などで更新）
- **モダンブラウザ**: Chrome / Edge / Firefox の最新版。
  geo-chat は **WebAssembly と Web Worker、SharedArrayBuffer** を使うため、
  古いブラウザや一部の埋め込み環境では動きません（理由は 02 章で触れます）。
- **Anthropic API キー**（次のステップで取得）

## 2. クローンして起動

```bash
git clone <このリポジトリの URL>
cd geo-chat
npm install       # 依存関係のインストール（DuckDB-WASM や maplibre-gl は大きめ）
npm run dev       # 開発サーバ起動（vite）
```

`npm run dev` を実行すると、ローカル URL（既定は `http://localhost:5173/geo-chat/`）が
表示されます。ブラウザで開くと、左にチャットパネル、右に **Table / Chart / Map / SQL** の
4 タブが並ぶ画面が出ます。

> **メモ**: URL のパスに `/geo-chat/` が付くのは、GitHub Pages 配信用に
> `vite.config.ts` で `base: '/geo-chat/'` を設定しているためです。
> サンプルデータの URL にもこの接頭辞が付きます（後述）。

初回はブラウザ内で DuckDB-WASM が初期化されます。SQL タブに
「Initializing DuckDB…」と出たら、数秒待つと `SELECT 1 AS hello;` が実行できるようになります。

## 3. Anthropic API キーを取得する

チャット（AI エージェント）を動かすには、自分の Anthropic API キーが必要です。
geo-chat はバックエンドを持たず、**ブラウザから直接 Anthropic API を呼びます**
（この仕組み自体を 03 章で分解します）。

1. [console.anthropic.com](https://console.anthropic.com) でアカウントを作成 / ログイン。
2. **Billing** で少額の **プリペイドクレジット**（例: 5 ドル）をチャージします。
   ワークショップ 1 回分なら 1〜2 ドルもあれば十分です。
   クレジット残高が 0 だと、正しいキーでも `400 / credit balance` エラーになります。
3. **API Keys** で新しいキーを発行し、`sk-ant-…` で始まる文字列をコピーします。
   キーは発行時にしか全体表示されないので、その場でコピーしてください。

> **当日運用**: 主催者がキーを配布する回もあります。その場合は配布されたキーを使ってください。
> どちらの運用でも、キーは各自がブラウザに入力する作りになっています。

## 4. キーを Settings に入力する

1. 画面右上（またはチャット未設定時の中央）の **Settings** を開きます。
2. **Anthropic API key** に `sk-ant-…` を貼り付けます。
3. **Model** は既定の **Claude Sonnet 4.5** のままで構いません
   （Opus / Haiku にも切り替え可能。`src/store/settings.ts` の `MODEL_OPTIONS` で定義）。

> **⚠️ localStorage の注意**: 入力したキーは、このブラウザの **localStorage に平文（暗号化なし）** で
> 保存され、そのままブラウザから Anthropic API に送られます。これはバックエンドを持たない
> ワークショップ用アプリだからこその割り切りです。**個人のキーを使い、ワークショップ後は
> 削除してください**（Settings で消すか、ブラウザの localStorage をクリア）。
> Settings ダイアログにも同じ注意書きが出ます（`src/components/settings/SettingsDialog.tsx`）。

## 5. サンプルデータを読み込む

このリポジトリには `public/data/` に次のサンプルが入っています:

| ファイル                    | 内容                               | ジオメトリ                      |
| --------------------------- | ---------------------------------- | ------------------------------- |
| `japan_cities.parquet`      | 日本の市区町村（GeoParquet）       | MultiPolygon（読込時 GEOMETRY） |
| `japan_prefectures.parquet` | 日本の都道府県（GeoParquet）       | MultiPolygon（読込時 GEOMETRY） |
| `customer.parquet`          | 非空間の属性テーブル（結合練習用） | なし                            |
| `test.geojson`              | 動作確認用の小さな GeoJSON         | あり                            |

> GeoParquet は spatial 拡張が geo メタデータを認識するため、読み込むと `geom` 列は
> **最初から `GEOMETRY` 型** になります（変換不要でそのまま地図に出せます）。

読み込み方は 2 通りあります。

**(A) SQL タブから手で読む**（02 章で本格的に使います）:
SQL タブの「Import from URL」に URL とテーブル名を入れて Import。
`Try the bundled sample:` のリンクを押すと `japan_cities.parquet` の URL が自動入力されます。
URL は `/geo-chat/data/japan_cities.parquet`（`import.meta.env.BASE_URL` + `data/…`）です。

**(B) チャットから読む**（次のステップのデモ）:
チャット欄に自然言語で頼むと、エージェントが `duckdb_query` ツールで読み込みます。

## 6. デモプロンプトで動作確認

チャットが空のとき、入力欄の上に **サンプルのプロンプトチップ** が 3 つ表示されます
（`src/components/chat/ChatPanel.tsx` の `EXAMPLE_PROMPTS`）。まずこれで動作確認します。

```
/geo-chat/data/japan_cities.parquet を読み込んで地図に表示して
```

このチップを押すと入力欄に文が入るので、送信します。うまくいくと:

1. チャットに `duckdb_query` などのツールカードが順に現れる（クリックで入力/出力を展開できる）
2. Map タブが自動で開き、日本の市区町村が地図に描かれる

これが動けば準備完了です。続けて次のようなプロンプトも試せます:

```
都道府県ごとの市区町村数をグラフにして
Load /geo-chat/data/japan_cities.parquet and show it on the map
```

> **言語について**: サンプルチップは日本語と英語が混在していますが、エージェントの
> system prompt には「ユーザーが書いた言語で返答する」ルールがあります
> （`src/lib/ai/systemPrompt.ts`）。日本語で「人口 10 万人以上の市を地図で塗り分けて」と
> 打てば、日本語で応答します。

## 7. うまくいかないとき

- **チャットが「Set your API key in Settings…」のまま** → Settings でキー未入力。
- **`401` / `unauthorized`** → キーが誤り。Settings を再確認。
- **`credit balance is too low`** → コンソールでクレジットをチャージ（ステップ 3-2）。
- **地図に何も出ない / URL 読み込みが CORS で失敗** → CORS の説明を含め
  [appendix-troubleshooting.md](./appendix-troubleshooting.md) を参照。
- **DuckDB が初期化されない / 真っ白** → ブラウザが SharedArrayBuffer 非対応、
  もしくは COOP/COEP ヘッダの問題。同じく付録を参照。

準備ができたら [01. AI エージェントとは何か](./01-what-is-an-agent.md) へ進みます。
