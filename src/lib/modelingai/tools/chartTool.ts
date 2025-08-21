import { tool } from 'ai';
import { z } from 'zod';
import type { VegaChartSpec } from '../../../types/chart';
import type { ChatState } from '../../../store/modelingRemoteAtoms';

/**
 * Creates a tool for getting the current Vega-Lite chart specification for a table
 */
export function createChartGetTool(
    getCurrentChatState: () => ChatState | null
) {
    return tool({
        description: 'Get the current Vega-Lite chart specification for a specific table. Returns null if no chart exists for the table.',
        parameters: z.object({
            table_name: z.string().describe('The name of the table to get chart for'),
        }),
        execute: async ({ table_name }) => {
            try {
                const chatState = getCurrentChatState();
                if (!chatState) {
                    return {
                        success: false,
                        message: 'チャットステートが利用できません',
                        spec: null
                    };
                }

                const chartSpec = chatState.chartSpecs?.[table_name];
                if (!chartSpec) {
                    return {
                        success: true,
                        message: `テーブル「${table_name}」のVega-Liteチャート設定はまだ作成されていません`,
                        spec: null
                    };
                }

                return {
                    success: true,
                    message: `テーブル「${table_name}」のVega-Liteチャート設定を取得しました`,
                    spec: chartSpec.spec
                };
            } catch (error) {
                return {
                    success: false,
                    message: error instanceof Error ? error.message : '不明なエラーが発生しました',
                    spec: null
                };
            }
        }
    });
}

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

    // Fix tooltip fields - ensure they have types
    // Check if this is a single view spec (which has encoding)
    if ('encoding' in processedSpec && processedSpec.encoding) {
        const encoding = processedSpec.encoding as Record<string, unknown>;
        if (encoding.tooltip && Array.isArray(encoding.tooltip)) {
            encoding.tooltip = encoding.tooltip.map((tooltip: { field?: string; type?: string; title?: string; [key: string]: unknown }) => {
                if (typeof tooltip === 'object' && tooltip.field && !tooltip.type) {
                    // Try to infer type from field name or use nominal as default
                    const field = tooltip.field.toLowerCase();
                    let type = 'nominal';
                    
                    if (field.includes('count') || field.includes('total') || 
                        field.includes('sum') || field.includes('avg') || 
                        field.includes('balance') || field.includes('amount') ||
                        field.includes('price') || field.includes('cost')) {
                        type = 'quantitative';
                    } else if (field.includes('date') || field.includes('time')) {
                        type = 'temporal';
                    } else if (field.includes('id') || field.includes('name') || 
                              field.includes('category') || field.includes('type')) {
                        type = 'nominal';
                    }
                    
                    return { ...tooltip, type };
                }
                return tooltip;
            });
        }
    }

    return processedSpec;
}
