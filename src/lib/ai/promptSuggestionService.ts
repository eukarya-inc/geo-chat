import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../duckdb/dbContext';

const SuggestedPromptsSchema = z.object({
    prompts: z
        .array(
            z.object({
                text: z.string().describe('The actual prompt text in Japanese'),
                category: z.enum(['analysis', 'visualization', 'transformation', 'geographic']).describe('Category of the prompt'),
            })
        )
        .max(8)
        .describe('Array of up to 8 suggested prompts'),
});

export async function generatePromptSuggestions(
    tableName: string,
    dbContext: DBContext,
    schema: string | null,
    apiKey: string
): Promise<{ text: string; category: string }[]> {
    if (!apiKey || !dbContext) {
        return [];
    }

    try {
        // Get table schema information
        const schemaData = await dbContext.executeQuery(`DESCRIBE ${tableName}`, schema);

        // Get sample data
        const sampleData = await dbContext.executeQuery(`SELECT * FROM ${tableName} LIMIT 5`, schema);

        const anthropic = createAnthropic({
            apiKey,
            headers: {
                'anthropic-dangerous-direct-browser-access': 'true',
            },
        });

        const prompt = `
You are analyzing a table to suggest relevant analysis prompts for a user with limited data literacy.

Table Name: ${tableName}

Schema:
${JSON.stringify(schemaData, null, 2)}

Sample Data (first 5 rows):
${JSON.stringify(sampleData, null, 2)}

Based on this table structure and data, suggest 6-8 specific, actionable prompts in Japanese that the user can click to perform various analyses.

Categories to consider:
- analysis: Statistical analysis, aggregations, rankings
- visualization: Charts, graphs, time series
- transformation: Data restructuring, pivoting, grouping
- geographic: Map-based analysis (only if geometry/location data exists)

Requirements:
1. ALL prompts MUST use the "〜したい" pattern (want to...)
   Examples:
   - "国別の顧客数を見たい"
   - "上位10件のデータを表示したい"
   - "平均値を計算したい"
2. Prompts should be specific to THIS data - look at actual column names and values
3. DO NOT suggest analysis for data that doesn't exist (e.g., don't suggest sales analysis if there's no sales column)
4. Use natural Japanese language that non-technical users understand
5. Each prompt should express what the user wants to do/see
6. Base suggestions on ACTUAL columns present in the table:
   - For numeric columns like balances/amounts: suggest statistical analysis
   - For categorical columns: suggest grouping/comparison
   - For date/time columns: suggest temporal analysis
   - For geographic columns: suggest spatial analysis
7. Avoid technical jargon - write as if explaining to a business user

IMPORTANT: 
- Only suggest analyses that can be done with the columns that actually exist
- ALWAYS use "〜したい" ending for consistency
For example:
- If you see 'balance' or 'acctbal' columns → "残高の分析をしたい", NOT "売上を分析したい"
- If you see 'customer' data → "顧客の分布を見たい", NOT "売上推移を見たい"
- If you see 'order' data → then you can suggest "注文の分析をしたい"
`;

        const { object } = await generateObject({
            model: anthropic('claude-3-haiku-20240307'),
            prompt,
            schema: SuggestedPromptsSchema,
        });

        return object.prompts;
    } catch (error) {
        console.error('Failed to generate prompt suggestions:', error);
        return [];
    }
}
