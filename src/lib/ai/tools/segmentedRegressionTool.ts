import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import type {
    SegmentedRegressionResponse,
    SegmentPlan,
    SegmentExecutionStep,
} from '../../../types/segmentedRegression';

const MAX_PREDICTORS = 6;
const MAX_SEGMENTS = 10;

export function createSegmentedRegressionTool(dbContext: DBContext, schema: string | null) {
    return tool({
        description: `Plan segmented regression analysis - analyze each segment/cluster separately.

IMPORTANT: This is a PLANNER tool that returns an execution plan.
After receiving the plan, you MUST execute ALL steps for ALL segments.

CRITICAL - PREDICTOR SELECTION:
- If explanatory_columns NOT specified, select_predictors_for_regression runs ONCE on source table (STEP 0)
- The SAME predictors are used for ALL segments for consistent comparison
- DO NOT auto-select predictors separately for each segment

When to use:
- "クラスター別に回帰分析"
- "セグメントごとに回帰分析"
- "地域別に分析"

Output: Execution plan with segments, steps, and tool calls`,
        inputSchema: z.object({
            table_name: z.string().describe('Table name to analyze'),
            target_column: z
                .string()
                .optional()
                .describe('Target variable. If omitted, will be auto-selected in each segment.'),
            explanatory_columns: z
                .array(z.string())
                .max(MAX_PREDICTORS)
                .optional()
                .describe('Predictor columns (max 6). If omitted, will be auto-selected in each segment.'),
            segment_column: z
                .string()
                .describe(
                    'Column defining segments (e.g., cluster, region, category). Required unless cluster_labels_table_name is provided.'
                )
                .optional(),
            cluster_labels_table_name: z
                .string()
                .optional()
                .describe(
                    'Cluster labels table from clusterTool (contains row_id and cluster columns). Creates temporary joined table.'
                ),
        }),
        execute: async ({
            table_name,
            target_column,
            explanatory_columns,
            segment_column,
            cluster_labels_table_name,
        }): Promise<SegmentedRegressionResponse> => {
            try {
                const tableName = table_name.trim();
                if (!tableName) {
                    return errorResponse('テーブル名が指定されていません。');
                }

                // Validate segment column specification
                if (!segment_column && !cluster_labels_table_name) {
                    return errorResponse(
                        'segment_column または cluster_labels_table_name のいずれかを指定してください。'
                    );
                }

                // Determine working table and segment column
                let workingTable: string;
                let actualSegmentColumn: string;
                let needsJoin = false;

                if (cluster_labels_table_name) {
                    workingTable = tableName;
                    actualSegmentColumn = 'cluster';
                    needsJoin = true;
                } else {
                    workingTable = tableName;
                    actualSegmentColumn = segment_column!;
                }

                const sanitizedTable = quoteIdentifier(workingTable);
                const qualifiedTable = schema ? `${quoteIdentifier(schema)}.${sanitizedTable}` : sanitizedTable;

                // Get unique segment values
                let segmentQuery: string;
                if (needsJoin) {
                    const sanitizedLabels = quoteIdentifier(cluster_labels_table_name!);
                    const qualifiedLabels = schema ? `${quoteIdentifier(schema)}.${sanitizedLabels}` : sanitizedLabels;
                    segmentQuery = `SELECT DISTINCT l.cluster as segment_value
                        FROM ${qualifiedLabels} l
                        ORDER BY l.cluster;`;
                } else {
                    segmentQuery = `SELECT DISTINCT ${quoteIdentifier(actualSegmentColumn)} as segment_value
                        FROM ${qualifiedTable}
                        WHERE ${quoteIdentifier(actualSegmentColumn)} IS NOT NULL
                        ORDER BY segment_value;`;
                }

                const segmentRows = await dbContext.executeQuery(segmentQuery, schema);

                if (!Array.isArray(segmentRows) || segmentRows.length === 0) {
                    return errorResponse(`セグメント値が見つかりませんでした。`);
                }

                const segmentValues = segmentRows.map(row => row.segment_value);

                if (segmentValues.length > MAX_SEGMENTS) {
                    return errorResponse(
                        `セグメント数が多すぎます（${segmentValues.length}個）。最大${MAX_SEGMENTS}個まで対応しています。`
                    );
                }

                // Create common steps for predictor selection (if needed)
                const commonSteps: SegmentExecutionStep[] = [];
                let globalStepNumber = 1;

                if (!explanatory_columns || explanatory_columns.length === 0) {
                    commonSteps.push({
                        stepNumber: globalStepNumber++,
                        tool: 'select_predictors_for_regression',
                        description: `Select predictors ONCE from source table: ${workingTable}`,
                        parameters: {
                            table_name: workingTable,
                            target_column: target_column,
                            top_k: 3,
                        },
                    });
                }

                // Build execution plan for each segment
                const segmentPlans: SegmentPlan[] = [];

                for (const segmentValue of segmentValues) {
                    const segmentLabel = `${actualSegmentColumn}=${segmentValue}`;
                    const segmentTableName = `${workingTable}_segment_${segmentValue}`;

                    // Get row count for this segment
                    let rowCountQuery: string;
                    if (needsJoin) {
                        const sanitizedLabels = quoteIdentifier(cluster_labels_table_name!);
                        const qualifiedLabels = schema
                            ? `${quoteIdentifier(schema)}.${sanitizedLabels}`
                            : sanitizedLabels;
                        rowCountQuery = `SELECT COUNT(*) as count
                            FROM ${qualifiedTable} t
                            JOIN ${qualifiedLabels} l ON ROW_NUMBER() OVER () = l.row_id
                            WHERE l.cluster = ${typeof segmentValue === 'string' ? `'${segmentValue.replace(/'/g, "''")}'` : segmentValue};`;
                    } else {
                        rowCountQuery = `SELECT COUNT(*) as count
                            FROM ${qualifiedTable}
                            WHERE ${quoteIdentifier(actualSegmentColumn)} = ${typeof segmentValue === 'string' ? `'${segmentValue.replace(/'/g, "''")}'` : segmentValue};`;
                    }

                    const countResult = await dbContext.executeQuery(rowCountQuery, schema);
                    const rowCount = countResult[0]?.count ?? 0;

                    // Build execution steps
                    const steps: SegmentExecutionStep[] = [];
                    let stepNumber = 1;

                    // Step 1: Create segment table
                    let createTableSQL: string;
                    if (needsJoin) {
                        const sanitizedLabels = quoteIdentifier(cluster_labels_table_name!);
                        const qualifiedLabels = schema
                            ? `${quoteIdentifier(schema)}.${sanitizedLabels}`
                            : sanitizedLabels;
                        createTableSQL = `CREATE TABLE ${quoteIdentifier(segmentTableName)} AS
SELECT t.*
FROM ${qualifiedTable} t
JOIN ${qualifiedLabels} l ON ROW_NUMBER() OVER () = l.row_id
WHERE l.cluster = ${typeof segmentValue === 'string' ? `'${segmentValue.replace(/'/g, "''")}'` : segmentValue};`;
                    } else {
                        createTableSQL = `CREATE TABLE ${quoteIdentifier(segmentTableName)} AS
SELECT * FROM ${qualifiedTable}
WHERE ${quoteIdentifier(actualSegmentColumn)} = ${typeof segmentValue === 'string' ? `'${segmentValue.replace(/'/g, "''")}'` : segmentValue};`;
                    }

                    steps.push({
                        stepNumber: stepNumber++,
                        tool: 'create_scatter_charts',
                        description: `Create segment table: ${segmentTableName}`,
                        parameters: {
                            sql: createTableSQL,
                            purpose: 'analysis',
                        },
                    });

                    // Step 2: Perform regression (using common predictors if auto-selected)
                    const regressionDescription =
                        !explanatory_columns || explanatory_columns.length === 0
                            ? `Perform regression for ${segmentLabel} using predictors selected in STEP 0 (DO NOT auto-select predictors again)`
                            : `Perform regression for ${segmentLabel}`;

                    steps.push({
                        stepNumber: stepNumber++,
                        tool: 'perform_regression_analysis',
                        description: regressionDescription,
                        parameters: {
                            table_name: segmentTableName,
                            target_column: target_column,
                            explanatory_columns: explanatory_columns,
                            note:
                                !explanatory_columns || explanatory_columns.length === 0
                                    ? 'Use predictors from STEP 0 - same predictors for all segments'
                                    : undefined,
                        },
                    });

                    // Step 3: Create scatter charts for ALL predictors
                    steps.push({
                        stepNumber: stepNumber++,
                        tool: 'create_scatter_charts',
                        description: `Create scatter + regression line charts for ALL predictors in ${segmentLabel}`,
                        parameters: {
                            note: 'Follow the regression visualization workflow for each predictor',
                        },
                    });

                    segmentPlans.push({
                        segmentValue,
                        segmentLabel,
                        segmentTable: segmentTableName,
                        rowCount,
                        steps,
                    });
                }

                // Build detailed instructions
                const instructions = buildInstructions(
                    segmentPlans,
                    tableName,
                    actualSegmentColumn,
                    target_column,
                    explanatory_columns,
                    commonSteps
                );

                const totalSteps = commonSteps.length + segmentPlans.reduce((sum, plan) => sum + plan.steps.length, 0);

                return {
                    success: true,
                    message: `${segmentPlans.length}個のセグメントに対する実行プランを作成しました。以下の指示に従って各ステップを順番に実行してください。`,
                    plan: {
                        totalSegments: segmentPlans.length,
                        totalSteps,
                        commonSteps: commonSteps.length > 0 ? commonSteps : undefined,
                        segments: segmentPlans,
                        sourceTable: tableName,
                        segmentColumn: actualSegmentColumn,
                        targetColumn: target_column,
                        predictorColumns: explanatory_columns,
                        instructions,
                    },
                };
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                return errorResponse(`セグメント別回帰分析プランの作成中にエラーが発生しました: ${message}`);
            }
        },
    });
}

function buildInstructions(
    segments: SegmentPlan[],
    sourceTable: string,
    segmentColumn: string,
    targetColumn?: string,
    predictorColumns?: string[],
    commonSteps?: SegmentExecutionStep[]
): string {
    const commonStepsSection =
        commonSteps && commonSteps.length > 0
            ? `
CRITICAL - STEP 0 (DO THIS FIRST, ONLY ONCE):
Explanatory variables are NOT specified. You MUST:
1. Run select_predictors_for_regression on "${sourceTable}" ONCE
2. Before calling it, run DESCRIBE "${sourceTable}" to check column types
3. If numeric columns < 10, investigate source tables (SHOW TABLES, check for raw data tables)
4. Store the selected predictors in a variable
5. Use the EXACT SAME predictors for ALL ${segments.length} segments below
6. DO NOT call select_predictors_for_regression again for individual segments
7. DO NOT let perform_regression_analysis auto-select predictors for each segment

`
            : '';

    return `
Execute ALL ${segments.length} segments. Each segment:
1. Create segment table
2. Perform regression
3. Create charts for each predictor

${commonStepsSection}
Segments:
${segments.map((seg, idx) => `${idx + 1}. ${seg.segmentLabel} (${seg.rowCount} rows)`).join('\n')}
`.trim();
}

function errorResponse(message: string, warnings?: string[]): SegmentedRegressionResponse {
    return {
        success: false,
        message,
        warnings,
    };
}

function quoteIdentifier(identifier: string): string {
    const sanitized = identifier.replace(/"/g, '""');
    return `"${sanitized}"`;
}
