# 50. スキル = md ファイル 1 枚 — 作法を必要なときだけ注入する

> 40 章の検証は「間違いを弾く」層でした。ここで「**正しい作法を、必要な瞬間に注入する**」
> 層——スキルシステム——を足します。スキルは **Markdown 1 枚**。この章の観察では、
> 取得したスキルが会話の途中で **実際のバグを直し**、全チャプター中でいちばん質の高い
> 地図を作ります。

## ① この章の状態

```bash
git switch chapter/04-skills
# 開発サーバを再起動（Ctrl+C → npm run dev）※スキルはビルド時読込なので再起動が要る
```

このブランチは `main` から **evals だけを引いた**、ほぼ完成形です。
`// CHAPTER SEAM: skill system` が復活します:

- **スキル本体** `src/lib/ai/skills/**/*.md` — 7 枚の作法集（`duckdb/basics`,
  `duckdb/spatial`, `duckdb/file-import`, `map/styling`, `map/geospatial`,
  `vega/basics`, `vega/color`）。
- **`get_skill` ツール** — description に **全スキルのカタログ** が埋まっており、
  モデルが「今のタスクに要る id」を選んで取得する。
- **前提ゲート** — `update_map_style` は `map.*` スキル、`update_chart_spec` は `vega.*`
  スキルを **先に取得しないと動かない**。

- **ある**: 検証＋スキル＋ゲート（品質を底上げする全部）。
- **無い**: evals ハーネス（＝この状態を自動で保証する仕組み。60 章）。

## ② 観察

### 観察: 作法を要する難しい依頼を投げる

面積コロプレスは「投影して面積を出す」「凡例向けに区切りを整える」など作法が要ります:

```
市区町村を面積が大きいほど濃い緑になるように塗って、凡例向けに区切りのいい値で
```

**実機での挙動**（ツールカードの並び順）:

1. `load_builtin_dataset(japan_cities)`
2. `duckdb_query` — `ST_Transform(geom,'EPSG:4326','ESRI:54009')` で面積を計算——
   ただし **`always_xy` を付け忘れ、`area_km2` が NaN** になる（軸順の罠）。
3. **`get_skill(["duckdb.spatial","map.styling"])`** — `update_map_style` を呼ぶ **前に**
   スキルを取得（＝前提ゲート）。`deps` が自動で手繰られ、
   `duckdb.basics, duckdb.spatial, map.styling` の 3 枚が返る。
4. `duckdb_query` — 面積を **`always_xy := true` 付きで再計算 → 正しい値**（最大 ≈ 2183 km²）。
5. `duckdb_query` — `SUMMARIZE` で面積分布を確認。
6. `duckdb_query` — **`CREATE TABLE city_areas`**（`area_km2` を追加、geom を geometry に改名）。
7. `update_map_style(city_areas, fill-color の interpolate 0→2000 km² を薄緑→濃緑)` → `{"success": true}`

**全チャプター中でいちばん良い結果です。** 取得した `duckdb.spatial` スキルが、
**ステップ 2 の NaN バグを直接直しました**——スキルを読んだ後、モデルは `always_xy := true`
を付けて再計算し、正しい面積を得ました。最終的な地図は、凡例向けの **切りのいい区切り
（0/100/300/500/1000/2000 km²）** を持つ連続的な緑のコロプレス。不透明度・白い輪郭付き。
モデルは中央値 ≈ 108 km²、最大 ≈ 2183 km²（高山市）まで報告しました。コンソールエラーは 0。

### ゲートの効き方

ここで **`get_skill` はステップ 3、`update_map_style` はステップ 7** に注目。モデルは
system prompt の指示に従って **自分から先にスキルを取りに行った** ので、ゲートが
「拒否」を返す場面は表に出ませんでした。ゲートは「拒否して怒る」より、**正しい順番を
促す** 装置として働いています。

> **見たいなら拒否も観察できます**: New chat（ゲートがリセットされる）した直後に、いきなり
> 「凡例が分かる 5 段階コロプレスにして」と作法込みで頼むと、モデルが探索の後に
> `update_map_style` を呼んだ瞬間、ツールが `{error: "Fetch the 'map.styling' skill…"}` を
> 返して拒否します。モデルはそれを読んで `get_skill` を呼び直し、作法を得てから成功します。

## ③ なぜ — コンテキストは有限資源、だから progressive disclosure

### 矛盾: 作法は必要、でも全部積むと飽和する

LLM に渡せるコンテキスト（system prompt + 会話 + ツール定義）には上限があります。しかも
**渡せば渡すほど賢くなるわけではありません**——関係ない情報を大量に積むと、大事な指示が
埋もれて質が落ちます。コンテキストは希少資源です。

一方で、地図の塗り方・Vega-Lite の色付け・投影の軸順の罠……エージェントに **正確に** 仕事を
させるには、それぞれ数百語の作法が要ります。全部を system prompt に常時積んだら飽和します。

### 解決策 = progressive disclosure（段階的開示）

> 詳細な知識は **スキル** として外に出し、**タスクに関係あるものだけ、必要な瞬間に**
> `get_skill` で取りに行かせる。

system prompt には「詳しいやり方はスキルにある。必要なら取れ」とだけ書き、
カタログ（どんなスキルがあるか）を `get_skill` の description に埋めます。モデルは
「地図を塗る前に map スキルを取る」と自分で判断して取得します。これは 20 章のツール往復
ループの **知識版** です。観察では、これが単なる強制ではなく **正確さを実際に上げた**
（NaN バグを直した）ことが肝でした。

### スキルの形式 — `<domain>/<name>.md` を 1 枚置くだけ

スキルは frontmatter 付き Markdown です（例: `map/styling.md`）:

```markdown
---
description: REQUIRED before styling the map — TableMapStyle shape, paint per geometry, …
tasks: 地図, 地図スタイル, 色分け, スタイル, map, map style, choropleth, 塗り分け, …
---

## Styling the map with update_map_style

（ここから下が本文。取得時にモデルへ渡される中身）
```

- **`description`** — カタログに出る 1 行。「REQUIRED before …」のように **いつ必要か** を書く。
- **`tasks`** — ルーティング用キーワード（英語＋日本語）。モデルが選ぶ手がかり。
- **`deps`**（任意）— 一緒に取る前提スキルの id（例: `duckdb.spatial` は `deps: duckdb.basics`）。
  観察のステップ 3 で 3 枚まとめて返ったのは、この deps 自動解決のおかげ。
- **id はファイルパスから自動生成** — `registry.ts` の `idFromPath()` が
  `./duckdb/spatial.md → duckdb.spatial`。**最初のセグメント（`duckdb`）が domain** で、
  これが前提ゲートの単位になります。ファイルは `import.meta.glob('./**/*.md')` で
  **ビルド時に一括読込** されます（だからスキルを足したら **開発サーバ再起動** が要る）。

> **つまり: `<domain>/<name>.md` を 1 枚置くだけでスキルが増える。コード変更は不要。**
> これが本ワークショップの「md 1 枚でエージェントを拡張する」の核心です。

### 前提ゲート — たった数行の Set

「地図を塗る前に作法を読ませる」を強制するのが前提ゲート。実体は `gate.ts` の Set と、
`tools/index.ts` の薄いラッパ `requireSkill` だけです:

```ts
function requireSkill(domain, suggestion, tool) {
    const inner = tool.execute;
    return {
        ...tool,
        execute: (input, options) => {
            if (!hasFetched(domain)) {
                return { error: `Fetch the '${suggestion}' skill with get_skill before using this tool. …` };
            }
            return inner(input, options);
        },
    };
}
```

`get_skill` が成功するとその domain を `markFetched()`。ゲートが開くまで、
`update_map_style` / `update_chart_spec` は **副作用なしで拒否** します。ゲートは
チャットセッション単位で、**New chat で `resetGate()`** が呼ばれてまた閉じます。

> **見える原理**: ゲート（正しい作法を先に読ませる）と検証（間違いを弾く・40 章）が
> 組み合わさると、質の低い出力が **構造的に出にくく** なります。しかもスキルは
> 強制するだけでなく、**知識を注入して正確さそのものを上げます**（観察の NaN 修正）。
> これがコンテキスト有限資源下での progressive disclosure の効果です。

## ④ 次の章で足すもの — evals（この状態を自動で保証する）

ここまでで、through-line プロンプトはきれいに解けるようになりました。でも
**「解けている」を、どう保証** しますか。スキルを 1 枚直したら、別のプロンプトが
壊れていないと **どう確認** しますか。モデルは非決定的なので、目視 1 回では足りません。

> **60 章（`main`）で足すのは、evals ハーネスです。**
> 固定プロンプトで **本物のエージェントを N 回走らせ**、毎回「正しい最終状態
> （どのツールが走り、どのテーブル/spec ができたか）」に到達するかを **成功率** で測ります。
> exact な文言ではなく **outcome（結果）** を検証する——非決定的なエージェントの正しい守り方です。

## ⑤ diff の読みどころ — evals 層は何を足すか

```bash
git diff --stat chapter/04-skills..main
```

主に現れるファイル（この層は小さい・独立している）:

- `src/evals/runEval.ts` — **新規**。本物のエージェントループを N 回回し、成功率を出すハーネス。
- `src/evals/basic.eval.browser.test.ts` — **新規**。2 つの end-state アサーション。
- `vitest.workspace.ts` — evals を **独立した vitest プロジェクト** として定義（`.env` の
  キーを注入、CI からは除外）。
- `package.json` — `test:evals` スクリプトを追加。

evals は本物の Anthropic API を叩いて **課金** されるので、`npm run check` や CI からは
外され、`npm run test:evals` でしか動きません。次章では、これを実際に走らせて中身を読みます。

次は [60. evals — 成果物としての評価](./60-evals.md)。
