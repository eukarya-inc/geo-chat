import { createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';

export async function generateSQLExplanation(sql: string, apiKey: string): Promise<string> {
    if (!apiKey) {
        return '';
    }

    try {
        const anthropic = createAnthropic({
            apiKey,
            headers: {
                'anthropic-dangerous-direct-browser-access': 'true',
            },
        });

        const system = `
Analyze the following CREATE TABLE SQL and generate an explanation in Japanese. Match the explanation length to the SQL complexity.

Example 1 - Complex SQL with CTE:
SQL:
WITH yearly_data AS (
  SELECT 事業者名, unnest.地域名, 事業概要.年度, 事業概要.従業員数,
         unnest.営業収入_千円 as 営業収入,
         unnest.営業収入_千円 / NULLIF(unnest.延実在車両数_日車, 0) as 車両あたり収入
  FROM business_data, UNNEST(輸送実績) as unnest
  WHERE 事業概要.年度 IS NOT NULL AND unnest.営業収入_千円 IS NOT NULL
)
CREATE TABLE business_metrics AS
SELECT a.事業者名, a.地域名,
       a.営業収入 as 当期収入, b.営業収入 as 前期収入,
       ((a.車両あたり収入 - b.車両あたり収入) / NULLIF(b.車両あたり収入, 0)) * 100 as 営業利益率変化,
       ((a.従業員数 - b.従業員数) / NULLIF(b.従業員数, 0)) * 100 as 人件費増加率
FROM yearly_data a JOIN yearly_data b
ON a.事業者名 = b.事業者名 AND a.年度 = b.年度 + 1
WHERE a.営業収入 > 0 AND b.営業収入 > 0;

Explanation:
* **共通テーブル式 \`yearly_data\` を作成**
  * \`UNNEST(輸送実績)\` で配列を行展開
  * STRUCT から年度・従業員数などを取得
  * 営業収入 ÷ 延実在車両数 で **車両あたり収入** を計算
  * \`NULLIF(...,0)\` で 0 除算回避、主要列の \`IS NOT NULL\` で欠損除外
* **最新年度 (\`a\`) と前年度 (\`b\`) を自己結合**
  * \`a.年度 = b.年度 + 1\` で 1 年差のペアを作成
  * 収入が 0 以下のレコードは除外
* **\`business_metrics\` テーブルを作成**
  * 列: 事業者名／地域名・当期収入・前期収入
  * **営業利益率変化** ＝ 車両あたり収入の前年比増減率
  * **人件費増加率** ＝ 従業員数の前年比増減率
  * いずれも \`%\` に換算（×100）し、0 除算は \`NULLIF\`

Example 2 - Simple SQL:
SQL:
CREATE TABLE top_companies AS
SELECT company_name, revenue, employee_count
FROM companies
WHERE revenue > 1000000
ORDER BY revenue DESC
LIMIT 20;

Explanation:
companiesテーブルから、売上高が100万円を超える企業から上位20社を抽出し、会社名・売上高・従業員数の3列を持つtop_companiesテーブルを作成します。
データは売上高の降順で並べ替えられ、LIMIT句で上位20社に制限されます。

Requirements:
- For complex SQL (CTEs, JOINs, multiple calculations): Use detailed bullet points
- For simple SQL (basic SELECT, simple filtering): Use 1-2 sentences
- Bold important elements with **text**
- NEVER include the SQL code itself in the explanation
  - Do not repeat SQL statements like "CREATE TABLE", "SELECT", etc.
- Write in Japanese
- **IMPORTANT**: Output only the explanation
- **CRITICAL**: Start directly with the content - NO introductory phrases like:
  - "以下は、提示されたSQLクエリの説明です"
  - "このSQLクエリは..."
  - "提示されたクエリでは..."
  - "以下の説明をします"
  - Just start immediately with what the SQL does

**CRITICAL INSTRUCTION**: Your response must start DIRECTLY with the explanation content. Do NOT include ANY introductory phrases or preambles.
`;

        const { text } = await generateText({
            model: anthropic('claude-haiku-4-5-20251001'), // Use faster model for explanations
            system,
            prompt: sql,
        });

        return text.trim();
    } catch (error) {
        console.error('Failed to generate SQL explanation:', error);
        return '';
    }
}
