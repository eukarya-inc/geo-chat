# 06. スキル = md ファイル 1 枚

> 05 章で「地図やグラフの spec には作法がある」と分かりました。その作法を
> **必要なときだけ** モデルに渡す仕組みが「スキル」です。スキルは **Markdown ファイル 1 枚**。
> 本章では仕組みを分解し、**自分のスキルを書いてエージェントを賢くします**。

## ① 概念解説 — コンテキストは有限資源、だから progressive disclosure

LLM に渡せるコンテキスト（system prompt + 会話 + ツール定義）には上限があります。
そして「渡せば渡すほど賢くなる」わけでもありません——**関係ない情報を大量に積むと、
むしろ大事な指示が埋もれて質が落ちます**。コンテキストは希少資源です。

ここで矛盾が生まれます。地図の塗り方、Vega-Lite の色の付け方、空間関数の投影の罠……
エージェントに **正確に** 仕事をさせるには、それぞれ数百語の詳細な作法が要ります。
でも、それを全部 system prompt に常時積んだら、コンテキストが飽和します。

解決策が **progressive disclosure（段階的開示）** です:

> 詳細な知識は **スキル** として外に出しておき、**タスクに関係あるものだけ、必要な瞬間に**
> `get_skill` ツールで取りに行かせる。

system prompt には「詳しいやり方はスキルにある。必要なら取れ」とだけ書き、
カタログ（どんなスキルがあるか）を `get_skill` の description に埋めておきます。
モデルは「地図を塗る前に map スキルを取る」と自分で判断して取得します。
これは 03 章のツール往復ループの、知識版です。

## ② コードの読みどころ

### スキルファイルの形式 — `src/lib/ai/skills/**/*.md`

スキルは frontmatter 付き Markdown です。例（`src/lib/ai/skills/map/styling.md` の冒頭）:

```markdown
---
description: REQUIRED before styling the map — TableMapStyle shape, paint per geometry, ...
tasks: 地図, 地図スタイル, 色分け, スタイル, map, map style, choropleth, 塗り分け, ポイント, ...
---

## Styling the map with update_map_style

（ここから下が本文。update_map_style の使い方の詳細な作法）
```

frontmatter の 3 フィールドと **id の決まり方** は、`src/lib/ai/skills/registry.ts` に
実装されています:

- **`description`** — カタログに出る 1 行説明。「REQUIRED before …」のように
  **いつ必要か** を書くのがコツ。
- **`tasks`** — ルーティング用キーワード（英語 + 日本語）。カタログに併記され、
  モデルが「このタスクならこのスキル」と選ぶ手がかりになります。
- **`deps`**（任意）— このスキルと一緒に取るべき前提スキルの id
  （例: `map.geospatial` は `deps: map.styling, duckdb.spatial`）。
- **`body`** — frontmatter 以下の本文。これが取得時にモデルへ渡される中身。

**id はファイルパスから自動生成** されます。`registry.ts` の `idFromPath()`:

```ts
// './duckdb/spatial.md' → 'duckdb.spatial'
export function idFromPath(path: string): string {
    return path.replace(/^\.\//, '').replace(/\.md$/, '').replace(/\//g, '.');
}
```

そして id の **最初のセグメント**（`duckdb.spatial` の `duckdb`）が **domain** で、
これが後述の前提ゲートの単位になります（`domainOf()`）。ファイルは
`import.meta.glob('./**/*.md', { eager, query: '?raw' })` で **ビルド時に一括読み込み** されます。

> **つまり: `<domain>/<name>.md` を 1 枚置くだけでスキルが増える。コード変更は不要。**
> これが本ワークショップの「md 1 枚でエージェントを拡張する」の核心です。

### カタログと取得 — `src/lib/ai/tools/getSkill.ts`

`get_skill` の description には、**全スキルのカタログが埋め込まれています**
（`buildCatalog()` が `- <id> — <description> [tasks]` を 1 行ずつ生成）。
モデルは description を読んで「今のタスクに要る id」を選び、`get_skill` を呼びます。
`resolveWithDeps()` が `deps` を自動で手繰り、まとめて本文を返します。

### 前提ゲート — `src/lib/ai/skills/gate.ts` + `tools/index.ts`

「地図を塗る前に、まず作法を読ませたい」を強制するのが **前提ゲート** です。実体は
`gate.ts` の **たった数行の Set**:

```ts
const fetchedDomains = new Set<string>();
export function markFetched(domain: string) {
    fetchedDomains.add(domain);
}
export function hasFetched(domain: string) {
    return fetchedDomains.has(domain);
}
export function resetGate() {
    fetchedDomains.clear();
}
```

`get_skill` が成功すると、取得したスキルの domain を `markFetched()` します
（`getSkill.ts`）。そして `tools/index.ts` の薄いラッパ `requireSkill` が、
ゲートが開くまでツールの `execute` を **副作用なしで拒否** します:

```ts
function requireSkill(domain, suggestion, tool) {
    const inner = tool.execute;
    return {
        ...tool,
        execute: (input, options) => {
            if (!hasFetched(domain)) {
                return { error: `Fetch the '${suggestion}' skill with get_skill before using this tool. ...` };
            }
            return inner(input, options);
        },
    };
}
```

登録側で `update_map_style` は `map` を、`update_chart_spec` は `vega` を要求します:

```ts
update_map_style:  requireSkill('map',  'map.styling',  createUpdateMapStyleTool(ctx)),
update_chart_spec: requireSkill('vega', 'vega.basics',  createUpdateChartSpecTool(ctx)),
```

ゲートはチャットセッション単位です。**New chat すると `resetGate()` が呼ばれ**
（`useAgentChat.ts` の `reset`）、また閉じます。

## ③ 壊す実験 #6 — スキルなしで複雑な地図を頼む

前提ゲートが「なぜ品質を上げるのか」を体で見ます。

1. チャット右上の **New chat** を押します（ゲートがリセットされ、`map` は未取得状態に）。
2. いきなり、作法を要する複雑な依頼を投げます:

    ```
    japan_cities を人口で 5 段階に塗り分けて、凡例が分かるコロプレスにして
    ```

3. **観察**: モデルが（探索の後）`update_map_style` を呼ぶと、ツールが
   **エラーを返して拒否** します——「先に `map.styling` スキルを取れ」。
   チャットのツールカードでこの `tool_result` を開いて、拒否メッセージを読んでください。
4. モデルはそれを読み、**自分で `get_skill(["map.styling"])` を呼びます**
   （ツールカードにスキル id のバッジが付きます）。作法（paint 接頭辞・`["get"]` の直接アクセス・
   `interpolate` の色ランプ等）を取得したうえで、**改めて `update_map_style` を呼び成功** します。

> **見える原理**: ゲートは「知識を推測で書く」前に「正しい作法を読む」を強制します。
> 05 章の検証（間違いを弾く）と組み合わさり、**質の低い出力が構造的に出にくく** なります。
> これがコンテキスト有限資源下での progressive disclosure の効果です。

## ④ 手を動かす課題 — 自分のスキルを 1 枚書く

**md ファイルを 1 枚足すだけ** でエージェントが賢くなることを、自分の手で確かめます。
例として、ヒートマップ用スキル `map/heatmap.md` を作ります（業務の定番手順でも構いません）。

### テンプレート（`src/lib/ai/skills/map/heatmap.md` として保存）

```markdown
---
description: ポイント密度のヒートマップ表現 — heatmap レイヤの paint と使いどころ
tasks: ヒートマップ, 密度, heatmap, ポイント密度, heat, ホットスポット
deps: map.styling
---

## ポイントをヒートマップで表現する

多数のポイントの「密度」を見せたいときは、個々の円ではなくヒートマップにする。
（このアプリの地図レイヤは point→circle / line→line / polygon→fill を基本とするため、
heatmap を使う場合の作法をここに明記しておく。まず対象がポイントであることを確認する。）

- 密度を強調したいズーム帯では `heatmap-*` 系の paint を使う。
- 値で重み付けするなら heatmap-weight に ["get", "<数値列>"] を使う。
- 生の点も見せたいときは、ズームインで circle 表示に切り替える設計を検討する。

（ここに、あなたの業務で毎回書く手順・色・しきい値の目安を具体的に書く）
```

> 注: 上のテンプレートは「スキルの書き方」を学ぶための最小例です。実際に heatmap を
> 描くには対応するレイヤ実装が要りますが、本課題の狙いは **「md を置くとカタログと挙動が
> 変わる」ことの体感** です。まずは「自分の業務で繰り返す分析レシピ」を 1 つ、
> `<domain>/<name>.md` として書くのが最も学びになります。

### 反映と確認

スキルはビルド時 glob で読み込むため、ファイルを足したら **開発サーバを再起動** します
（`Ctrl+C` → `npm run dev`）。確認手順:

1. New chat して、密度に関する依頼（例「◯◯のホットスポットを見せて」）を打つ。
2. `get_skill` のツールカードを開き、**カタログにあなたの新スキル id
   （例 `map.heatmap`）が増えている** ことを確認する。
3. モデルがそのスキルを取得し、本文に書いた作法に沿って振る舞うか観察する。
   スキル追加の前後で挙動が変わることを確かめる。

## ⑤ 開発プロンプト例

スキルの下書きを AI に作らせ、自分で仕上げるためのプロンプト例:

```
このリポジトリの src/lib/ai/skills/ の既存スキル（map/styling.md, duckdb/spatial.md）を
お手本に、新しいスキル <domain>/<name>.md を書いてください。
- frontmatter は description / tasks（英語+日本語キーワード） / 必要なら deps。
- 本文は「いつ使うか」「具体的な SQL / spec の型」「よくある間違いと直し方」を含める。
- 対象タスク: <あなたが業務で繰り返す分析の説明>
出力は Markdown 1 ファイルとして。コード変更は不要（glob で自動登録される）。
```

スキルテンプレートの詳細は [appendix-prompts.md](./appendix-prompts.md) にもあります。

次は [07. チャレンジ＆言語化](./07-challenge.md)。ここまでで学んだ「ツール設計」と
「スキル設計」を、**自分のデータと業務課題** に適用します。最後は解説ではなく
「あなたの最初のツールの description を 1 文で書く」という問いで締めます。
