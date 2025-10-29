import type { RegressionResult } from '../utils/regression/ols';
import type { ColumnSummary, RegressionDataInfo } from './regression';

export interface SegmentRegressionResult {
    segmentValue: number | string;
    segmentLabel: string;
    dataInfo: RegressionDataInfo;
    regression: RegressionResult;
    columnSummaries: Record<string, ColumnSummary>;
    warnings?: string[];
}

export interface SegmentComparison {
    numSegments: number;
    rSquaredBySegment: number[];
    adjustedRSquaredBySegment: number[];
    coefficientsBySegment: Record<string, number[]>; // predictor -> [coef for seg0, seg1, ...]
}

export interface SegmentedRegressionAnalysisSuccess {
    success: true;
    message: string;
    tableName: string;
    segmentColumn: string;
    targetColumn: string;
    predictorColumns: string[];
    segments: SegmentRegressionResult[];
    comparison: SegmentComparison;
    warnings?: string[];
    suggestions?: string[];
}

export interface SegmentedRegressionAnalysisError {
    success: false;
    message: string;
    warnings?: string[];
}

export type SegmentedRegressionAnalysisResponse = SegmentedRegressionAnalysisSuccess | SegmentedRegressionAnalysisError;
