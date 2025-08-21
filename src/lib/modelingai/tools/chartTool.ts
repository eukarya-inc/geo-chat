import { tool } from 'ai';
import { z } from 'zod';
import type { VegaChartSpec } from '../../../types/chart';

// Create the chart update tool for AI
export function createChartUpdateTool(
    onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>
) {
    if (!onChartUpdate) return null;

    return tool({
        description: 'Update or create a Vega-Lite chart specification for a specific table',
        parameters: z.object({
            table_name: z.string().describe('The name of the table to create/update chart for'),
            vega_spec: z.object({
                mark: z.union([z.string(), z.record(z.unknown())]).describe('The mark type'),
                encoding: z.record(z.unknown()).describe('The encoding channels'),
                title: z.union([z.string(), z.record(z.unknown())]).optional().describe('Chart title'),
                config: z.record(z.unknown()).optional().describe('Chart configuration'),
            }).describe('Vega-Lite specification (excluding data, width, height)'),
        }),
        execute: async ({ table_name, vega_spec }) => {
            try {
                const processedSpec = processAIChartSpec(table_name, vega_spec as Partial<VegaChartSpec>);

                if (!("mark" in processedSpec) || !processedSpec.mark || !processedSpec.encoding) {
                    return {
                        success: false,
                        message: 'Chart specification must include both mark and encoding properties'
                    };
                }

                await onChartUpdate(table_name, processedSpec);

                return {
                    success: true,
                    message: `チャート「${table_name}」のグラフ設定を更新しました。`
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Failed to update chart: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        },
    });
}

// Function to process and clean the Vega spec from AI
export function processAIChartSpec(
    tableName: string,
    aiSpec: Partial<VegaChartSpec>
): VegaChartSpec {
    // Ensure required Vega-Lite schema
    const processedSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        ...aiSpec,
        // Add data with SQL query
        data: {
            sql: `SELECT * FROM ${tableName} LIMIT 1000`,
            values: []
        },
        height: 400
    } as VegaChartSpec;

    // Ensure title exists
    if (!processedSpec.title) {
        processedSpec.title = `Chart for ${tableName}`;
    }

    return processedSpec;
}
