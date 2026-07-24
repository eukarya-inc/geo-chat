# 60. evals — 成果物としての評価

> ここまで、機能を 1 層ずつ足して through-line プロンプトが解けるようになるのを見てきました。
> 最後の層は、機能ではありません。「**解けている状態を、非決定的なモデル相手にどう保証するか**」
> ——その答え、evals（評価）です。これがそろって初めて、エージェントは「作品」から
> 「保守できる成果物」になります。

## ① この章の状態 — `main`（全部入り）

```bash
git switch main
# 開発サーバは evals に不要（evals は vitest 上で本物のループを回す）
```

`main` はここまでの全層（データ・可視化・検証・スキル）に **evals ハーネス** を足した完成形です。

- `src/evals/runEval.ts` — 本物のエージェントループを N 回回し、**成功率** を出す小さなハーネス。
- `src/evals/basic.eval.browser.test.ts` — 2 つの eval ケース（地図・グラフ）。
- `vitest.workspace.ts` — evals を **独立した vitest プロジェクト** として定義。`.env` の
  `ANTHROPIC_API_KEY` / `VITE_ANTHROPIC_API_KEY` を evals バンドルにだけ注入し、
  **CI と `npm run check` からは除外**。キーが無ければ **綺麗に skip** します。

evals は `npm run test:browser` と同じ **webkit（Playwright）** 環境で、本物の
DuckDB-WASM・MapLibre・Anthropic 呼び出しを **ヘッドレスで** 動かします——アプリと同じランタイムです。

## ② 観察 — evals を走らせる

> **⚠️ 課金**: evals は本物の有料 Anthropic API を叩きます（1 ケースにつき数回のツール往復 ×
> `VITE_EVAL_RUNS` 回）。まずは **1 回** で。

```bash
VITE_EVAL_RUNS=1 npm run test:evals
```

（キーは `.env` の `ANTHROPIC_API_KEY` から `vitest.workspace.ts` が自動注入します。手元に
`.env` が無ければ、リポジトリ直下に `ANTHROPIC_API_KEY=sk-ant-…` を 1 行置いてください。）

**実機での結果**: **PASS — 1 ファイル・2 テスト、両方グリーン。**

- `「日本の自治体を地図に表示して」 loads japan_cities and styles the map` — successRate **1.0**。
  チェック: `loaded_dataset=1, japan_cities_exists=1, map_style_set=1`。（約 16.7s）
- `「都道府県ごとの市区町村数をグラフにして」 aggregates per prefecture and charts it` —
  successRate **1.0**。チェック: `aggregation_table=1, chart_spec_set=1`。（約 16.5s）
- 合計 **約 34.9s**。

注目してほしいのは、**アサーションの中身が「文言」ではない** ことです。「地図が表示されました」
という返答テキストは一切見ていません。見ているのは:

- どのツールが呼ばれたか（`toolCalls` に `load_builtin_dataset` が含まれるか）、
- DB にどのテーブルができたか（`japan_cities` が存在するか、~47 行の集計テーブルがあるか）、
- どの spec が set されたか（`mapStyles` / `chartSpecs` が空でないか）。

つまり **エージェントの END STATE（最終状態）** を検証しています。

## ③ なぜ — evals は「成果物」そのもの

### 非決定的なエージェントを、outcome で守る

モデルは非決定的です。同じプロンプトでも、ツールの呼び順や文言は毎回わずかに変わります。
だから「出力が文字列 X と一致するか」で守ろうとすると、正しく動いているのに落ちる
（フレーク）テストになります。evals はそれを避けて、**「望む最終状態に、十分な割合で
到達するか」** を測ります。

`runEval.ts` を読みます。核心はこのループです:

```ts
for (let i = 0; i < runs; i++) {
    await resetState(); // 毎回まっさらから
    const toolCalls = await runOnce(prompt); // 本物のループを 1 回
    const checks = await evalCase.verify({ toolCalls, executeQuery, chartSpecs, mapStyles });
    if (Object.values(checks).every(Boolean)) successes++;
}
return { prompt, runs, successRate: successes / runs, checkPassCounts };
```

- `runOnce()` は、アプリと **同じ `runAgent` / `createTools`** を呼びます——UI を介さないだけで、
  評価対象は本物のエージェントそのもの。
- `verify()` は **名前付きの boolean チェックの束** を返し、**全部 true のランだけ成功**。
  `successRate = successes / runs`。個々のチェックの通過数（`checkPassCounts`）も出るので、
  **どのチェックが不安定か** が分かります。
- `EVAL_RUNS`（回数）と `EVAL_THRESHOLD`（合格閾値、既定 0.5）は環境変数で調整。

`verify` は end state だけを見ます。例（地図ケース）:

```ts
verify: async ({ toolCalls, executeQuery, mapStyles }) => ({
    loaded_dataset: toolCalls.includes('load_builtin_dataset'),
    japan_cities_exists: (await executeQuery("SELECT 1 FROM information_schema.tables WHERE table_name='japan_cities'")).rowCount > 0,
    map_style_set: Object.keys(mapStyles).length > 0,
}),
```

### 本番の実務につなぐ

このハーネスは、本番のエージェントチームがやっていることの **教材版** です。

- **回帰テスト**: 50 章でスキルを 1 枚直したら、`test:evals` を回して **他のプロンプトが
  壊れていない** ことを確認する。プロンプト/ツール/スキルは「コード」なので、変更には
  回帰チェックが要ります——それが evals。
- **統計的な成功率**: 本番では `EVAL_RUNS` を上げ（例 20 回）、`successRate ≥ 0.9` のような
  閾値で「十分に安定して動くか」を測ります。非決定性を **確率** として扱うわけです。
- **コスト管理**: evals は課金されるので CI から外し、意図的に手で回す。この設計判断
  （`vitest.workspace.ts` で独立プロジェクト化・キーが無ければ skip）自体が、実務の型です。

> **見える原理**: エージェント開発の「テスト」は、単体テストではなく **outcome-based な
> 成功率 eval** になります。何を「成功」と定義し、それを何回中何回満たせば OK とするか——
> **この定義を書くこと自体が、エージェントを成果物として持つということ** です。

## ④ 手を動かす — 自分の eval を 1 つ書く

`basic.eval.browser.test.ts` に、3 つ目のケースを足してみましょう。through-line プロンプトを
そのまま eval にするのが良い練習です:

```ts
test('through-line: 都道府県ごとの色分け地図', async () => {
    const report = await runEval({
        prompt: '自治体を都道府県ごとに色分けして地図に表示して',
        verify: async ({ toolCalls, mapStyles, executeQuery }) => {
            const cities = await executeQuery(
                "SELECT 1 FROM information_schema.tables WHERE table_schema='main' AND table_name='japan_cities'"
            );
            return {
                loaded: toolCalls.includes('load_builtin_dataset'),
                cities_exists: cities.rowCount > 0,
                map_styled: Object.keys(mapStyles).length > 0,
            };
        },
    });
    expect(report.successRate).toBeGreaterThanOrEqual(EVAL_THRESHOLD);
});
```

書けたら `VITE_EVAL_RUNS=2 npm run test:evals` で回します。**考えどころ**:

1. **何を「成功」と定義したか。** 「地図が塗られた（`mapStyles` が空でない）」で十分か？
   「都道府県ごとに 47 色」までチェックすべきか？ 厳しくするほどフレークしやすくなる——
   その **トレードオフ** を体感する。
2. **どのチェックが不安定か。** `checkPassCounts` を見て、落ちやすいチェックを特定する。
3. **プロンプトを 1 語変えたら** 成功率がどう動くか。「色分けして」を「表示して」に
   変えると `map_styled` の通過率は上がるか下がるか。

## ⑤ 引き算のはしごを振り返る

ここまでで、`main` から 1 層ずつ引いたブランチを、逆向きに（引き算の底から）登り直しました。
全体像はこの 1 枚です:

| 章 / ブランチ                | through-line の結末                      | 一言                                 |
| ---------------------------- | ---------------------------------------- | ------------------------------------ |
| 10 / `chapter/00-chat-only`  | 喋るだけ・自信満々に誤答                 | 手の無い LLM は推測しかできない      |
| 20 / `chapter/01-data`       | SQL は回るが地図は塗れず過剰約束         | データだけだと準備＋説明どまり       |
| 30 / `chapter/02-viz-naive`  | 47 色は成功／強制すると沈黙の破綻        | 検証なし＝押されるとゴミを黙って塗る |
| 40 / `chapter/03-validation` | 強制で読めるエラー→正直な報告            | 検証はゴミを読める拒否に変える       |
| 50 / `chapter/04-skills`     | 面積コロプレス最高品質・NaN バグ自己修正 | スキルは作法を強制し、正確さも上げる |
| 60 / `main`                  | evals 両方 PASS（成功率 1.0）            | 非決定エージェントを outcome で守る  |

各ブランチの境目は、コード中の **`// CHAPTER SEAM: <層名>`** コメントに刻まれています。
`git diff --stat chapter/A..chapter/B` で、その 1 層がまるごと差分として見えます——
**引き算で作った教材だから、逆に足し算がきれいに読める** のでした。

ここまでで、エージェントは「魔法」ではなく「ツール＋ループ＋コンテキスト＋検証＋スキル＋eval」の
積み重ねだと分かったはずです。最後は、それを **自分のデータと業務課題** に向けます。

次は [70. この先へ — 自分の課題に転移する](./70-beyond.md)。
