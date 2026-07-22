# 付録: 開発プロンプト集（③の層）

ここは **③開発プロンプト**——Claude Code などのコーディング AI に「geo-chat を拡張させる」
ための指示——を集めた場所です。手打ちでコードを書く代わりに、これらを貼って実装させます。

**良い開発プロンプトの 3 原則**（各テンプレートはこれを踏襲しています）:

1. **お手本ファイルを名指しする** — 「既存の◯◯に合わせて」で、プロジェクトの規約に乗せる。
2. **制約を明示する** — 入力スキーマ、単一責務、結果の切り詰め、登録先を書く。
3. **検証を要求する** — 「typecheck が通ること」「description に使いどころを書くこと」まで指定。

②（description・スキル本文）の品質が、③で作ったものが賢く使われるかを決めます。
だから③のプロンプトにも「description を丁寧に書け」と含めるのがコツです。

---

## 1. 本編で使った実プロンプト

### 1-a. `buffer_analysis` ツール（04 章）

```
このリポジトリに新しい AI ツール buffer_analysis を追加してください。

■ 目的
指定テーブルのジオメトリ列に ST_Buffer を掛けた新しいテーブルを作り、地図で描けるようにする。

■ 既存構造に合わせる
- src/lib/ai/tools/duckdbQuery.ts と updateMapStyle.ts をお手本に、同じ形で書く
  （tool({ description, inputSchema(zod), execute }) を返す createXxxTool(ctx) 関数）。
- src/lib/ai/toolContext.ts の ToolContext を受け取り、refreshTables / setSelectedTable /
  setActiveTab を使って UI に反映する。
- 実装後、src/lib/ai/tools/index.ts の createTools に buffer_analysis を登録する。

■ 入力スキーマ（zod）
- table: string（対象テーブル）
- distanceMeters: number（バッファ距離・メートル）
- outputTable: string（作成するテーブル名）

■ 挙動
- 対象テーブルにジオメトリ列があるか getTableSchema で確認し、無ければ error を返す。
- ST_Buffer は座標系の単位で効くため、EPSG:4326 を投影 CRS（例 EPSG:6677、always_xy := true）へ
  変換してからメートルでバッファし、結果は EPSG:4326 に戻して GEOMETRY 列として保存する。
- CREATE TABLE "<outputTable>" AS SELECT ... を executeQuery で実行する。
- 成功したら ctx.refreshTables / setSelectedTable(outputTable) / setActiveTab('map') を呼ぶ。
- モデルへの戻り値は「作成テーブル名・行数」など短い要約にする（全行は返さない）。

■ description（②プロンプト）を丁寧に書く
- いつ使うか（近接分析・到達圏など）、距離の単位がメートルであること、
  出力が新テーブルになることを 2〜3 文で明記する。

実装後、npm run typecheck が通ることを確認してください。
```

### 1-b. スキル md（06 章）

```
このリポジトリの src/lib/ai/skills/ の既存スキル（map/styling.md, duckdb/spatial.md）を
お手本に、新しいスキル <domain>/<name>.md を書いてください。
- frontmatter は description / tasks（英語+日本語キーワード） / 必要なら deps。
- 本文は「いつ使うか」「具体的な SQL / spec の型」「よくある間違いと直し方」を含める。
- 対象タスク: <あなたが業務で繰り返す分析の説明>
出力は Markdown 1 ファイルとして。コード変更は不要（glob で自動登録される）。
```

---

## 2. テンプレート

### 2-a. 「ツールを追加する」テンプレート

```
このリポジトリに新しい AI ツール <tool_name> を追加してください。

■ 目的: <このツールが何をするか 1 文>

■ お手本: src/lib/ai/tools/<最も近い既存ツール>.ts と同じ形
  （tool({ description, inputSchema, execute }) を返す createXxxTool(ctx: ToolContext) 関数）。

■ 入力スキーマ（zod, 各引数に .describe() を付ける）:
  - <arg1>: <型> — <説明・単位>
  - <arg2>: <型> — <説明>

■ 挙動:
  - <前提チェック（テーブル存在・列存在など）。満たさなければ { error } を返す>
  - <本処理。SQL なら executeQuery を使い、単文で>
  - <UI 反映が要るなら ctx.setSelectedTable / setActiveTab / refreshTables / setMapStyle 等>
  - モデルへの戻り値は短い要約にする（全行・巨大 JSON を返さない）。

■ 登録: src/lib/ai/tools/index.ts の createTools に 1 行追加する。
   スキル取得を前提にしたいなら requireSkill('<domain>', '<suggestion>', ...) で包む。

■ description（②プロンプト）: いつ使うか・引数の意味・何が返るかを 2〜3 文で明記する。

実装後、npm run typecheck が通ること、index.ts に登録されていることを確認してください。
```

**なぜこの形か**: `index.ts` への登録を明記しないと「実装したのにモデルから見えない」
（03 章の `tools` 配列に出ない）事故が起きます。戻り値の切り詰めを毎回指定するのは、
コンテキストを溢れさせないため。前提ゲート（`requireSkill`）は必要なときだけ付けます。

### 2-b. 「スキルを追加する」テンプレート

```
src/lib/ai/skills/ に新しいスキル <domain>/<name>.md を追加してください。
既存の src/lib/ai/skills/<近いスキル>.md をお手本に、同じ粒度・同じ frontmatter 形式で。

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

### 2-c. 「エージェントをデバッグする」テンプレート

```
geo-chat のエージェントが期待通りに動きません。原因を切り分けたいです。

■ 症状: <何を頼んで、何が起きて、何を期待したか>
■ 再現プロンプト: <チャットに打った文>
■ 観察: <ツールカードの input/output、DevTools Network の messages リクエスト本数、
         返ってきた error メッセージ、など具体的に>

次の順で原因を切り分けてください:
1. モデルが正しいツールを選んでいるか（description の問題か）
   → src/lib/ai/tools/<該当>.ts の description を確認・改善案を出す。
2. ツールが error を返しているか（入力検証・前提ゲート・列名照合で弾かれていないか）
   → src/lib/ai/tools/index.ts の requireSkill、updateMapStyle.ts / updateChartSpec.ts の
     検証ロジック、columnMatch.ts の照合を確認する。
3. system prompt / スキルの作法が不足していないか
   → src/lib/ai/systemPrompt.ts と 関連スキル md を確認する。
該当ファイルを読んだうえで、最小の修正案を提示してください。
```

**なぜこの形か**: エージェントの不具合は「モデルの選択（②description）」
「ツールの検証で弾かれた」「作法（スキル）不足」のどれかにほぼ収まります。
この 3 分類で切り分けると、`agent.ts` を疑う前に②プロンプト層を先に点検できます
（多くの問題はそこ）。観察（ツールカードの input/output、Network の往復）を
具体的に渡すほど、切り分けが速くなります。

---

## 3. プロンプトを書くときの注意

- **メンションすべきファイル**: 拡張のたびに最低限これらを名指しすると精度が上がります——
  `src/lib/ai/tools/index.ts`（登録）、`src/lib/ai/toolContext.ts`（UI 連携の窓）、
  お手本になる既存ツール、関連スキル md。
- **述べるべき制約**: 単一責務・単文 SQL・結果の切り詰め・投影と軸順（`always_xy`）・
  列名は `DESCRIBE` どおり。
- **要求すべき検証**: `npm run typecheck`（や `npm run check`）が通ること、
  `index.ts` への登録、description に使いどころが書かれていること。
