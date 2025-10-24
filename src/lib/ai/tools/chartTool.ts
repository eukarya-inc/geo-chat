import { tool } from 'ai';
import { z } from 'zod';
import type { VegaChartSpec } from '../../../types/chart';
import type { ChatState } from '../../../store/remoteAtoms';

/**
 * Creates a tool for getting the current Vega-Lite chart specification for a table
 */
export function createChartGetTool(getCurrentChatState: () => ChatState | null) {
    return tool({
        description:
            'Get the current Vega-Lite chart specification for a specific table. Returns null if no chart exists for the table.',
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
                        spec: null,
                    };
                }

                const chartList = chatState.chartSpecs?.[table_name];
                const chartSpec = Array.isArray(chartList) ? chartList[chartList.length - 1] : undefined;
                if (!chartSpec) {
                    return {
                        success: true,
                        message: `テーブル「${table_name}」のVega-Liteチャート設定はまだ作成されていません`,
                        spec: null,
                    };
                }

                return {
                    success: true,
                    message: `テーブル「${table_name}」のVega-Liteチャート設定を取得しました`,
                    spec: chartSpec.spec,
                };
            } catch (error) {
                return {
                    success: false,
                    message: error instanceof Error ? error.message : '不明なエラーが発生しました',
                    spec: null,
                };
            }
        },
    });
}

const datasetsSchema = z
    .record(z.unknown())
    .refine(value => Object.keys(value).length > 0, {
        message: 'datasets must include at least one named dataset',
    })
    .describe('Named datasets available to the spec');

const baseSpecSchema = z
    .object({
        mark: z.union([z.string(), z.record(z.unknown())]).describe('The mark type'),
        encoding: z.record(z.unknown()).describe('The encoding channels'),
        title: z
            .union([z.string(), z.record(z.unknown())])
            .optional()
            .describe('Chart title'),
        config: z.record(z.unknown()).optional().describe('Chart configuration'),
    })
    .describe('Single-view Vega-Lite spec (excluding data, width, height)');

const layeredLayerSchema = baseSpecSchema
    .extend({
        data: z.unknown().optional().describe('Optional layer-specific data'),
        transform: z.array(z.unknown()).optional().describe('Optional layer transforms'),
        mark: z
            .union([z.string(), z.record(z.unknown())])
            .optional()
            .describe('Layer mark (inherits when omitted)'),
        encoding: z.record(z.unknown()).optional().describe('Layer encoding (inherits when omitted)'),
    })
    .describe('Layer definition');

const layeredSpecSchema = z
    .object({
        datasets: datasetsSchema,
        mark: z
            .union([z.string(), z.record(z.unknown())])
            .optional()
            .describe('Default mark for layers'),
        encoding: z.record(z.unknown()).optional().describe('Default encoding shared by layers'),
        layer: z.array(layeredLayerSchema).min(2).describe('Layer definitions'),
        title: z
            .union([z.string(), z.record(z.unknown())])
            .optional()
            .describe('Chart title'),
        config: z.record(z.unknown()).optional().describe('Chart configuration'),
    })
    .superRefine((spec, ctx) => {
        const datasetNames = new Set(Object.keys(spec.datasets ?? {}));
        if (datasetNames.size === 0) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message:
                    'Layered specs must define at least one dataset for regression lines and named data references.',
                path: ['datasets'],
            });
            return;
        }

        spec.layer.forEach((layer, index) => {
            const layerData = (layer as Record<string, unknown>).data;
            if (layerData && typeof layerData === 'object' && 'name' in (layerData as Record<string, unknown>)) {
                const name = (layerData as Record<string, unknown>).name;
                if (typeof name === 'string' && !datasetNames.has(name)) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `Layer ${index} references dataset "${name}" which is not defined in datasets`,
                        path: ['layer', index, 'data', 'name'],
                    });
                }
            }
        });
    })
    .describe('Layered Vega-Lite spec (excluding data, width, height)');

const chartSpecSchema = z.union([baseSpecSchema, layeredSpecSchema]);

// Create the chart update tool for AI
export function createChartUpdateTool(onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>) {
    if (!onChartUpdate) return null;

    return tool({
        description: `Update or create a Vega-Lite chart specification for a specific table.
        
        IMPORTANT: USE COLUMN STATISTICS FOR OPTIMAL CHART CONFIGURATION
        
        When columnStatistics is available from duckdb_query:
        
        For NUMERIC columns (with min, max, avg, median, p50, p75, p90, p95):
        - Wide range (max - min > 1000): Consider log scale {"scale": {"type": "log"}}
        - High variance (stddev/avg > 0.5): Use box plot or violin plot to show distribution
        - Skewed data (median << avg): Highlight outliers or use percentile bands
        
        For CATEGORICAL columns (with distinctCount):
        - Few categories (<10): Use bar chart with distinct colors
        - Many categories (>20): Consider top-N filtering or grouping
        - Medium (10-20): Use horizontal bar chart for better label readability
        
        For TEMPORAL columns (with minDate, maxDate):
        - Long range (>1 year): Aggregate by month/quarter
        - Short range (<1 month): Show daily values
        - Multi-year: Consider year-over-year comparison
        
        AXIS CONFIGURATION BASED ON STATISTICS:
        - Set domain based on actual data range: "scale": {"domain": [min, max]}
        - For percentile data, show reference lines at P50, P90
        - Use nice round numbers for axis ticks based on data magnitude
        
        TYPE SPECIFICATION:
        - ALWAYS specify the "type" field explicitly for each encoding channel
        - Common types: "quantitative" (numbers), "nominal" (categories), "temporal" (dates), "ordinal" (ordered categories)
        - The type determines how the data is interpreted and scaled

        AGGREGATE USAGE:
        - DO NOT add "aggregate" to encoding channels unless you explicitly want to aggregate data
        - Most visualizations should display individual data points without aggregation
        - Only use "aggregate" when you need to compute summary statistics (sum, mean, count, etc.) across groups
        - If no grouping is needed, DO NOT use "aggregate" - it will break the visualization
        - Example of when NOT to use aggregate: displaying all rows from a table as-is
        - Example of when to use aggregate: showing average sales per region (grouped by region)

        SORT SPECIFICATION:
        - For simple sorting, use "ascending" or "descending": {"field": "name", "type": "nominal", "sort": "descending"}
        - For sorting by another field's values, use object format with "field" and "order":
          Example: {"field": "date", "type": "temporal", "sort": {"field": "value", "order": "descending"}}
          Example: {"field": "事業内容", "type": "nominal", "sort": {"field": "事業者数", "order": "descending"}}
        - DO NOT use invalid patterns like "-x", "-y", "x", or "y" as sort values
        - Valid sort string values are ONLY "ascending" or "descending"
        - Valid sort object should have "field" and "order" properties

        REGRESSION LAYERED CHART OUTPUT:
        - After using perform_regression_analysis, reuse the observed data table for the scatter layer; do NOT add predicted columns to the table.
        - Compute exactly two regression points per predictor (min and max) with the regression equation using the intercept and β coefficients. For multi-predictor models, hold the other predictors at their mean values from regression.columnSummaries.
        - Place those two points inside the Vega-Lite spec under the datasets property (e.g., "datasets": {"reg_line_feature": [...]}) and reference that dataset name in the regression line layer.
        - Use layered marks:
          1. Scatter layer: mark {"type": "point"} using the raw observations. Prefer data.sql (or data.values) directly referencing the scatter table; if you reference data.name, make sure that dataset is also declared in datasets, otherwise validation will fail.
          2. Regression layer: mark {"type": "line"} with data {"name": "<dataset_name>"} and order on the predictor field so the line renders correctly.
        - Tooltips should allow comparing observed vs predicted values (include x/y on both layers). Add an area layer only if you explicitly compute confidence bounds.
        - When providing a full JSON spec for copy/paste, include $schema, description, datasets with the regression points, primary data, layer definitions, and optional config just like the example below.

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
        }
        
        {
          "$schema": "https://vega.github.io/schema/vega-lite/v5.json",
          "description": "Scatter + line from two externally-provided points (no regression transform).",
          "datasets": {
            "regPoints": [
              { "x": 1, "y": 1.0 },
              { "x": 10, "y": 8.0 }
            ]
          },
          "data": {
            "values": [
              {"x": 1, "y": 1.2}, {"x": 2, "y": 1.9}, {"x": 3, "y": 3.1},
              {"x": 4, "y": 3.7}, {"x": 5, "y": 4.6}, {"x": 6, "y": 5.1},
              {"x": 7, "y": 5.9}, {"x": 8, "y": 6.2}, {"x": 9, "y": 7.1},
              {"x": 10, "y": 7.8}
            ]
          },
          "layer": [
            {
              "mark": {"type": "point"},
              "encoding": {
                "x": {"field": "x", "type": "quantitative", "title": "x"},
                "y": {"field": "y", "type": "quantitative", "title": "y"},
                "tooltip": [{"field": "x"}, {"field": "y"}]
              }
            },
            {
              "data": {"name": "regPoints"},
              "mark": {"type": "line"},
              "encoding": {
                "x": {"field": "x", "type": "quantitative"},
                "y": {"field": "y", "type": "quantitative"},
                "order": {"field": "x"},
                "color": {"value": "firebrick"},
                "tooltip": [{"field": "x"}, {"field": "y"}]
              }
            }
          ],
          "config": {"view": {"stroke": null}}
        }
        
        {
          "datasets": {
            "reg_line_feature": [
              { "feature": 1.0, "predicted": 2.5 },
              { "feature": 10.0, "predicted": 8.1 }
            ]
          },
          "layer": [
            {
              "data": {"sql": "SELECT feature, actual AS target FROM regression_source"},
              "mark": {"type": "point", "opacity": 0.6, "size": 40},
              "encoding": {
                "x": {"field": "feature", "type": "quantitative", "title": "Feature"},
                "y": {"field": "target", "type": "quantitative", "title": "Actual"},
                "color": {"value": "#1f77b4"}
              }
            },
            {
              "data": {"name": "reg_line_feature"},
              "mark": {"type": "line", "strokeWidth": 3, "color": "#d62728"},
              "encoding": {
                "x": {"field": "feature", "type": "quantitative"},
                "y": {"field": "predicted", "type": "quantitative", "title": "Predicted"},
                "order": {"field": "feature"}
              }
            }
          ]
        }`,
        parameters: z.object({
            table_name: z.string().describe('The name of the table to create/update chart for'),
            vega_spec: z
                .union([chartSpecSchema, z.string().describe('JSON string representing a Vega-Lite spec')])
                .describe(
                    'Single-view or layered Vega-Lite specification (object or JSON string, excluding data, width, height)'
                ),
        }),
        execute: async ({ table_name, vega_spec }) => {
            try {
                let specInput: Partial<VegaChartSpec>;

                if (typeof vega_spec === 'string') {
                    let parsedSpec: unknown;
                    try {
                        parsedSpec = JSON.parse(vega_spec);
                    } catch (parseError) {
                        return {
                            success: false,
                            message: `Failed to parse Vega-Lite JSON specification: ${
                                parseError instanceof Error ? parseError.message : 'Unknown error'
                            }`,
                        };
                    }

                    const parsedResult = chartSpecSchema.safeParse(parsedSpec);
                    if (!parsedResult.success) {
                        const issue = parsedResult.error.issues[0];
                        const issueMessage = issue?.message ?? 'Unknown validation error';
                        const issuePath = issue?.path?.length ? ` (${issue.path.join('.')})` : '';
                        return {
                            success: false,
                            message: `Invalid Vega-Lite specification${issuePath}: ${issueMessage}`,
                        };
                    }

                    specInput = parsedResult.data as Partial<VegaChartSpec>;
                } else {
                    specInput = vega_spec as Partial<VegaChartSpec>;
                }

                const processedSpec = processAIChartSpec(table_name, specInput);
                const specRecord = processedSpec as unknown as Record<string, unknown>;
                const hasTopLevelView = Boolean(specRecord.mark) && Boolean(specRecord.encoding);
                const layers = Array.isArray(specRecord.layer) ? (specRecord.layer as unknown[]) : [];
                const hasLayerView = layers.length > 0;

                if (!hasTopLevelView && !hasLayerView) {
                    return {
                        success: false,
                        message:
                            'Chart specification must include either a top-level mark + encoding or at least one layer definition.',
                    };
                }

                await onChartUpdate(table_name, processedSpec);

                return {
                    success: true,
                    message: `チャート「${table_name}」のグラフ設定を更新しました。`,
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Failed to update chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        },
    });
}

// Function to process and clean the Vega spec from AI
export function processAIChartSpec(tableName: string, aiSpec: Partial<VegaChartSpec>): VegaChartSpec {
    // Helper function to ensure field type is set and remove unnecessary aggregate
    const ensureFieldType = (field: unknown): unknown => {
        if (!field || typeof field !== 'object') return field;

        const fieldObj = { ...(field as Record<string, unknown>) };

        // Remove unnecessary aggregate that AI tends to add
        // Aggregate should only be used when explicitly needed for data aggregation
        // In most cases, AI adds "aggregate": "mean" unnecessarily, which breaks visualizations
        // by forcing Vega-Lite to aggregate data when we want to show individual data points
        if ('aggregate' in fieldObj) {
            delete fieldObj.aggregate;
        }

        // Fix incorrect sort patterns that AI tends to generate
        // AI often generates invalid patterns like "sort": "-x" or "sort": "-y"
        // Valid patterns: "ascending", "descending", or {"field": "...", "order": "..."}
        if ('sort' in fieldObj) {
            if (typeof fieldObj.sort === 'string') {
                const sortValue = fieldObj.sort;
                // Fix patterns like "-x", "-y" -> "descending"
                if (sortValue === '-x' || sortValue === '-y') {
                    fieldObj.sort = 'descending';
                }
                // Fix patterns like "x", "y" -> "ascending"
                else if (sortValue === 'x' || sortValue === 'y') {
                    fieldObj.sort = 'ascending';
                }
                // Ensure only valid string values are kept
                else if (!['ascending', 'descending'].includes(sortValue)) {
                    // If it's an invalid string, remove it
                    delete fieldObj.sort;
                }
            }
            // No need to modify sort objects - let Vega-Lite handle them as-is
        }

        // If type is already set and valid, keep it
        if (fieldObj.type && ['quantitative', 'nominal', 'ordinal', 'temporal'].includes(fieldObj.type as string)) {
            return fieldObj;
        }

        // Try to infer type from field name
        if (fieldObj.field && typeof fieldObj.field === 'string') {
            const fieldName = fieldObj.field.toLowerCase();
            let inferredType = 'nominal';

            // Check for quantitative fields
            if (
                fieldName.includes('count') ||
                fieldName.includes('total') ||
                fieldName.includes('sum') ||
                fieldName.includes('avg') ||
                fieldName.includes('balance') ||
                fieldName.includes('amount') ||
                fieldName.includes('price') ||
                fieldName.includes('cost') ||
                fieldName.includes('value') ||
                fieldName.includes('quantity') ||
                fieldName.includes('revenue') ||
                fieldName.includes('sales') ||
                fieldName.includes('score') ||
                fieldName.includes('rating') ||
                fieldName.includes('_count') ||
                fieldName.includes('_sum')
            ) {
                inferredType = 'quantitative';
            }
            // Check for temporal fields
            else if (
                fieldName.includes('date') ||
                fieldName.includes('time') ||
                fieldName.includes('year') ||
                fieldName.includes('month') ||
                fieldName.includes('day') ||
                fieldName.includes('created') ||
                fieldName.includes('updated')
            ) {
                inferredType = 'temporal';
            }
            // Check for nominal/categorical fields
            else if (
                fieldName.includes('id') ||
                fieldName.includes('name') ||
                fieldName.includes('category') ||
                fieldName.includes('type') ||
                fieldName.includes('segment') ||
                fieldName.includes('group') ||
                fieldName.includes('status') ||
                fieldName.includes('state') ||
                fieldName.includes('country') ||
                fieldName.includes('region') ||
                fieldName.includes('city') ||
                fieldName.includes('gender') ||
                fieldName.includes('department') ||
                fieldName.includes('brand')
            ) {
                inferredType = 'nominal';
            }

            // If there's an aggregate function, it's likely quantitative
            if (
                fieldObj.aggregate &&
                typeof fieldObj.aggregate === 'string' &&
                ['sum', 'mean', 'average', 'min', 'max', 'count', 'distinct'].includes(fieldObj.aggregate)
            ) {
                inferredType = 'quantitative';
            }

            return { ...fieldObj, type: inferredType };
        }

        return field;
    };

    // Remove width/height from aiSpec if present
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, @typescript-eslint/no-explicit-any
    const { width: _width, height: _height, ...restAiSpec } = aiSpec as any;

    // Ensure required Vega-Lite schema
    const processedSpec = {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        ...restAiSpec,
        // Add data with SQL query
        data: {
            sql: `SELECT * FROM ${tableName} LIMIT 1000`,
            values: [],
        },
        // Set responsive container sizing
        width: 'container',
        height: 'container',
    } as VegaChartSpec;

    // Ensure title exists - prefer user-provided title over generated one
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
export function createChartDeleteTool(onChartDelete?: (tableName: string) => Promise<void>) {
    if (!onChartDelete) return null;

    return tool({
        description:
            'Delete the Vega-Lite chart specification for a specific table. Use this when you want to remove a chart completely.',
        parameters: z.object({
            table_name: z.string().describe('The name of the table to delete chart for'),
        }),
        execute: async ({ table_name }) => {
            try {
                await onChartDelete(table_name);

                return {
                    success: true,
                    message: `テーブル「${table_name}」のグラフ設定を削除しました。`,
                };
            } catch (error) {
                return {
                    success: false,
                    message: `Failed to delete chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
                };
            }
        },
    });
}
