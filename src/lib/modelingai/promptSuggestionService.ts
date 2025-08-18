import { createAnthropic } from '@ai-sdk/anthropic';
import { generateObject } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../duckdb/dbContext';

const SuggestedPromptsSchema = z.object({
  prompts: z.array(z.object({
    text: z.string().describe('The actual prompt text in Japanese'),
    category: z.enum(['analysis', 'visualization', 'transformation', 'geographic']).describe('Category of the prompt')
  })).max(8).describe('Array of up to 8 suggested prompts')
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
    const schemaData = await dbContext.executeQuery(
      `DESCRIBE ${tableName}`,
      schema
    );
    
    // Get sample data
    const sampleData = await dbContext.executeQuery(
      `SELECT * FROM ${tableName} LIMIT 5`,
      schema
    );

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
1. Prompts should be specific to this data, not generic
2. Use natural Japanese language that non-technical users understand
3. Each prompt should be a complete question or request
4. Prioritize the most valuable analyses for this specific dataset
5. If the table has time-based columns, include temporal analysis
6. If the table has categorical columns, include grouping/comparison
7. If the table has numeric columns, include statistical summaries
8. Avoid technical jargon - write as if explaining to a business user

Examples of good prompts:
- "月別の売上推移を見せてください"
- "都道府県別のランキングを作成してください"
- "カテゴリごとの平均値を計算してください"
- "上位10件のデータを表示してください"
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