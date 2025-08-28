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
        description: `Update or create a Vega-Lite chart specification for a specific table.
        
        IMPORTANT:
        - ALWAYS specify the "type" field explicitly for each encoding channel
        - Common types: "quantitative" (numbers), "nominal" (categories), "temporal" (dates), "ordinal" (ordered categories)
        - The type determines how the data is interpreted and scaled
        
        Example specifications:
        {
          "mark": "bar",
          "encoding": {
            "x": {"field": "segment", "type": "nominal", "title": "Segment"},
            "y": {"field": "customer_count", "type": "quantitative", "title": "Customer Count"}
          }
        }
        
        {
          "mark": "line",
          "encoding": {
            "x": {"field": "date", "type": "temporal", "title": "Date"},
            "y": {"field": "sales", "type": "quantitative", "title": "Sales"}
          }
        }`,
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
    // Helper function to ensure field type is set
    const ensureFieldType = (field: unknown): unknown => {
        if (!field || typeof field !== 'object') return field;
        
        const fieldObj = field as Record<string, unknown>;
        
        // If type is already set and valid, keep it
        if (fieldObj.type && ['quantitative', 'nominal', 'ordinal', 'temporal'].includes(fieldObj.type as string)) {
            return field;
        }
        
        // Try to infer type from field name
        if (fieldObj.field && typeof fieldObj.field === 'string') {
            const fieldName = fieldObj.field.toLowerCase();
            let inferredType = 'nominal';
            
            // Check for quantitative fields
            if (fieldName.includes('count') || fieldName.includes('total') || 
                fieldName.includes('sum') || fieldName.includes('avg') || 
                fieldName.includes('balance') || fieldName.includes('amount') ||
                fieldName.includes('price') || fieldName.includes('cost') ||
                fieldName.includes('value') || fieldName.includes('quantity') ||
                fieldName.includes('revenue') || fieldName.includes('sales') ||
                fieldName.includes('score') || fieldName.includes('rating') ||
                fieldName.includes('_count') || fieldName.includes('_sum')) {
                inferredType = 'quantitative';
            } 
            // Check for temporal fields
            else if (fieldName.includes('date') || fieldName.includes('time') ||
                     fieldName.includes('year') || fieldName.includes('month') ||
                     fieldName.includes('day') || fieldName.includes('created') ||
                     fieldName.includes('updated')) {
                inferredType = 'temporal';
            } 
            // Check for nominal/categorical fields
            else if (fieldName.includes('id') || fieldName.includes('name') || 
                     fieldName.includes('category') || fieldName.includes('type') ||
                     fieldName.includes('segment') || fieldName.includes('group') ||
                     fieldName.includes('status') || fieldName.includes('state') ||
                     fieldName.includes('country') || fieldName.includes('region') ||
                     fieldName.includes('city') || fieldName.includes('gender') ||
                     fieldName.includes('department') || fieldName.includes('brand')) {
                inferredType = 'nominal';
            }
            
            // If there's an aggregate function, it's likely quantitative
            if (fieldObj.aggregate && typeof fieldObj.aggregate === 'string' && 
                ['sum', 'mean', 'average', 'min', 'max', 'count', 'distinct'].includes(fieldObj.aggregate)) {
                inferredType = 'quantitative';
            }
            
            return { ...fieldObj, type: inferredType };
        }
        
        return field;
    };
    
    // Ensure required Vega-Lite schema
    const processedSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        ...aiSpec,
        // Add data with SQL query
        data: {
            sql: `SELECT * FROM ${tableName} LIMIT 1000`,
            values: []
        }
    } as VegaChartSpec;

    // Ensure title exists
    if (!processedSpec.title) {
        processedSpec.title = `Chart for ${tableName}`;
    }

    // Fix encoding fields - ensure they have proper types
    // Check if this is a single view spec (which has encoding)
    if ('encoding' in processedSpec && processedSpec.encoding) {
        const encoding = processedSpec.encoding as Record<string, unknown>;
        
        // Process main encoding channels
        ['x', 'y', 'color', 'size', 'shape', 'opacity', 'theta', 'radius'].forEach(channel => {
            if (encoding[channel]) {
                encoding[channel] = ensureFieldType(encoding[channel]);
            }
        });
        
        // Process tooltip fields
        if (encoding.tooltip) {
            if (Array.isArray(encoding.tooltip)) {
                encoding.tooltip = encoding.tooltip.map(ensureFieldType);
            } else {
                encoding.tooltip = ensureFieldType(encoding.tooltip);
            }
        }
    }

    return processedSpec;
}

/**
 * Creates a tool for deleting a Vega-Lite chart specification for a table
 */
export function createChartDeleteTool(
    onChartDelete?: (tableName: string) => Promise<void>
) {
    if (!onChartDelete) return null;

    return tool({
        description: 'Delete the Vega-Lite chart specification for a specific table. Use this when you want to remove a chart completely.',
        parameters: z.object({
            table_name: z.string().describe('The name of the table to delete chart for'),
        }),
        execute: async ({ table_name }) => {
            try {
                await onChartDelete(table_name);

                return {
                    success: true,
                    message: `テーブル「${table_name}」のグラフ設定を削除しました。`
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Failed to delete chart: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        }
    });
}
