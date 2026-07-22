/**
 * Segmented Regression Analysis Types (Planner Approach)
 *
 * This tool returns an execution plan for performing regression analysis
 * on each segment, rather than executing the analysis itself.
 */

export interface SegmentExecutionStep {
    /** Step number within the segment */
    stepNumber: number;
    /** Tool name to execute */
    tool: 'select_predictors_for_regression' | 'perform_regression_analysis' | 'create_scatter_charts';
    /** Step description */
    description: string;
    /** Tool parameters (when applicable) */
    parameters?: Record<string, unknown>;
}

export interface SegmentPlan {
    /** Segment value (e.g., cluster number, region name) */
    segmentValue: string | number;
    /** Segment label for display */
    segmentLabel: string;
    /** Table name for this segment */
    segmentTable: string;
    /** Number of rows in this segment */
    rowCount?: number;
    /** Execution steps for this segment */
    steps: SegmentExecutionStep[];
}

export interface SegmentedRegressionPlan {
    /** Total number of segments */
    totalSegments: number;
    /** Total number of steps across all segments */
    totalSteps: number;
    /** Common steps to execute once before segment analysis (e.g., predictor selection) */
    commonSteps?: SegmentExecutionStep[];
    /** Execution plan for each segment */
    segments: SegmentPlan[];
    /** Original table name */
    sourceTable: string;
    /** Segment column name */
    segmentColumn: string;
    /** Target column for regression */
    targetColumn?: string;
    /** Predictor columns (if specified) */
    predictorColumns?: string[];
    /** Detailed instructions for AI execution */
    instructions: string;
}

export interface SegmentedRegressionSuccess {
    success: true;
    message: string;
    plan: SegmentedRegressionPlan;
    warnings?: string[];
}

export interface SegmentedRegressionError {
    success: false;
    message: string;
    warnings?: string[];
}

export type SegmentedRegressionResponse = SegmentedRegressionSuccess | SegmentedRegressionError;
