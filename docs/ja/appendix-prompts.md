# 付録: 開発プロンプト集（③の層）

ここは **③開発プロンプト**——Claude Code などのコーディング AI に「geo-chat を拡張させる」
ための指示——を集めた場所です。[70-beyond](./70-beyond.md) のチャレンジを、手打ちの代わりに
これらを貼って実装させます。

**良い開発プロンプトの 3 原則**（各テンプレートはこれを踏襲）:

1. **お手本ファイルを名指しする** — 「既存の◯◯に合わせて」で、プロジェクトの規約に乗せる。
2. **制約を明示する** — 入力スキーマ、単一責務、結果の切り詰め、登録先、**検証**を書く。
3. **検証を要求する** — 「`npm run check` が通ること」「description に使いどころを書くこと」まで指定。

②（description・スキル本文）の品質が、③で作ったものが賢く使われるかを決めます。
だから③のプロンプトにも「description を丁寧に書け」と含めるのがコツです。

> **どのブランチで**: 拡張は **`main`** で行います（全層がそろっているので検証・スキル・eval が
> 使えます）。`git switch main` してから。

---

## 1. 「ツールを追加する」テンプレート

`buffer_analysis`（[70-beyond](./70-beyond.md) 課題 4）を **検証つき** で実装させる例。
汎用に使えるよう、`<…>` を差し替えてください。

```
このリポジトリに新しい AI ツール <tool_name>（例: buffer_analysis）を追加してください。

■ 目的: <このツールが何をするか 1 文。例: 指定テーブルのジオメトリに ST_Buffer を掛けた
        新テーブルを作り、地図で描けるようにする>

■ お手本:
  - src/lib/ai/tools/duckdbQuery.ts（tool の 4 部品 = description / inputSchema(zod) / execute の形）
  - src/lib/ai/tools/updateMapStyle.ts（execute 冒頭での入力検証の入れ方）
  いずれも createXxxTool(ctx: ToolContext) 関数を返す。

■ 入力スキーマ（zod, 各引数に .describe() を付ける）:
  - <arg1>: <型> — <説明・単位>
  - <arg2>: <型> — <説明>
  （例: table: string, distanceMeters: number, outputTable: string）

■ 挙動:
  - 前提を検証する（対象テーブルの存在・ジオメトリ列の有無・距離が正か・出力名が有効か）。
    満たさなければ { error: "…" } を返し、副作用を起こさない。
  - 本処理は単文 SQL を executeQuery で。空間演算はメートルで効かせるため EPSG:4326 を
    投影 CRS（例 EPSG:6677, always_xy := true）へ変換 → 演算 → 4326 に戻して GEOMETRY 保存。
  - UI 反映が要るなら ctx.refreshTables / setSelectedTable(<out>) / setActiveTab('map')。
  - モデルへの戻り値は短い要約（作成テーブル名・行数）にする。全行・巨大 JSON は返さない。

■ 登録: src/lib/ai/tools/index.ts の createTools に 1 行追加する
   （登録しないと tools 配列に出ず、モデルから見えない）。
   スキル取得を前提にしたいなら requireSkill('<domain>', '<suggestion>', ...) で包む。

■ description（②プロンプト）: いつ使うか・引数の意味・単位・何が返るかを 2〜3 文で明記する。

実装後、npm run check が通ることを確認してください。
```

**なぜこの形か**: `index.ts` への登録を明記しないと「実装したのにモデルから見えない」
（20 章の `tools` 配列に出ない）事故が起きます。**検証を明示** するのは、30 章で見た
「素朴ツールが沈黙して壊れる」を自分の手で防ぐため。戻り値の切り詰めは、コンテキストを
溢れさせないため。

---

## 2. 「eval を追加する」テンプレート

自作ツールを回帰から守る（[70-beyond](./70-beyond.md) 課題 4 後半、60 章）:

```
src/evals/basic.eval.browser.test.ts に、<機能> を守る eval ケースを 1 つ足してください。

■ お手本: 同ファイルの既存 2 ケースと src/evals/runEval.ts の EvalCase / verify の形。

■ 追加するケース:
  - prompt: <チャットに送る 1 文。例: japan_cities に半径 2km のバッファを作って地図に出して>
  - verify: エージェントの END STATE を検証する名前付き boolean を返す。
    例: 出力テーブルが information_schema.tables に存在する / その行数 > 0 /
        toolCalls に '<tool_name>' が含まれる / mapStyles が空でない。
  - 文言（返答テキスト）ではなく、テーブル・spec・toolCalls などの結果状態だけを見る。

■ 実行: VITE_EVAL_RUNS=2 npm run test:evals で成功率を確認する（課金に注意）。

これらは npm run check や CI では走らない（別 vitest プロジェクト）。その設計は変えないこと。
```

**なぜこの形か**: エージェントは非決定的なので、**文言一致ではなく outcome を N 回測る**
のが正解です（60 章）。厳しくしすぎるとフレークするので、まず最小の end-state から。

---

## 3. 「スキルを追加する」テンプレート

業務手順のスキル化（[70-beyond](./70-beyond.md) 課題 3、50 章）:

```
src/lib/ai/skills/ に新しいスキル <domain>/<name>.md を追加してください。
既存の src/lib/ai/skills/<近いスキル>.md（例 map/styling.md, duckdb/spatial.md）を
お手本に、同じ粒度・同じ frontmatter 形式で。

■ frontmatter
  description: <カタログ 1 行。「REQUIRED before ...」のように"いつ必要か"を書く>
  tasks: <英語と日本語のルーティング用キーワードをカンマ区切りで>
  deps: <前提スキルの id。不要なら省略>

■ 本文
  - いつ使うか / 前提
  - 具体的な SQL または spec の"型"（コピーして使える最小例）
  - よくある間違いと、その直し方

id はパスから自動生成される（<domain>.<name>）。コード変更は不要。開発サーバ再起動で反映。
```

**なぜこの形か**: `description` に「いつ必要か」を書くと、モデルが `get_skill` の
カタログを見て正しく選べます。`tasks` に日本語を入れるのは日本語プロンプトからの
ルーティング精度のため。「よくある間違いと直し方」を入れると、モデルが同じ失敗を避けます。

---

## 4. 「組み込みデータセットを追加する」テンプレート

[70-beyond](./70-beyond.md) 課題 1、20 章:

```
src/lib/ai/builtinDatasets.ts の BUILTIN_DATASETS 配列に、新しいデータセットを 1 つ追加してください。
  - table: <DuckDB に作られるテーブル名>
  - url: <同一オリジンが安全。public/data/ に置いたなら ${import.meta.env.BASE_URL}data/<file>>
  - description: <何のデータか＋列名と型＋座標系。モデルが探索を減らせるよう具体的に>
コード変更はこの 1 か所だけ（system prompt がこの配列を読んでモデルに教える）。
追加後、チャットで「<データ名>を地図に表示して」と頼み、エージェントが自分で
load_builtin_dataset を呼ぶか確認してください。
```

---

## 5. 「エージェントをデバッグする」テンプレート

```
geo-chat のエージェントが期待通りに動きません。原因を切り分けたいです。

■ 症状: <何を頼んで、何が起きて、何を期待したか>
■ 再現プロンプト: <チャットに打った文>
■ 観察: <ツールカードの input/output、DevTools Network の messages リクエスト本数、
         返ってきた error メッセージ、など具体的に>
■ ブランチ: <どの chapter ブランチ / main か。層の有無で挙動が変わるため必須>

次の順で原因を切り分けてください:
1. モデルが正しいツールを選んでいるか（description の問題か）
   → src/lib/ai/tools/<該当>.ts の description を確認・改善案を出す。
2. ツールが error を返しているか（入力検証・前提ゲート・列名照合で弾かれていないか）
   → tools/index.ts の requireSkill、mapStyleValidation.ts / chartSpecValidation.ts、
     columnMatch.ts の照合を確認する。
3. system prompt / スキルの作法が不足していないか
   → src/lib/ai/systemPrompt.ts と 関連スキル md を確認する。
該当ファイルを読んだうえで、最小の修正案を提示してください。
```

**なぜこの形か**: エージェントの不具合は「モデルの選択（②description）」
「ツールの検証で弾かれた」「作法（スキル）不足」のどれかにほぼ収まります。この 3 分類で
切り分けると、`agent.ts` を疑う前に②プロンプト層を先に点検できます（多くの問題はそこ）。
**どのブランチか** を必ず添える——層の有無で正常な挙動が変わるからです。

---

## プロンプトを書くときの注意

- **メンションすべきファイル**: 拡張のたびに最低限これらを名指しすると精度が上がります——
  `src/lib/ai/tools/index.ts`（登録）、`src/lib/ai/toolContext.ts`（UI 連携の窓）、
  お手本になる既存ツール、関連スキル md。
- **述べるべき制約**: 単一責務・単文 SQL・結果の切り詰め・**検証**・投影と軸順（`always_xy`）・
  列名は `DESCRIBE` どおり。
- **要求すべき検証**: `npm run check` が通ること、`index.ts` への登録、description に
  使いどころが書かれていること、必要なら eval で守ること。
