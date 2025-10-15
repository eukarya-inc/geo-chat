import type { RegressionResult } from '../utils/regression/ols';

export interface ColumnSummary {
    column: string;
    count: number;
    mean: number;
    min: number;
    max: number;
    stdDev: number;
}

export interface RegressionDataInfo {
    totalRows: number;
    usedRows: number;
    skippedRows: number;
    samplingLimit: number;
}

export interface AutoSelectionInfo {
    target: boolean;
    predictors: boolean;
}

export interface RegressionAnalysisSuccess {
    success: true;
    message: string;
    tableName: string;
    targetColumn: string;
    predictorColumns: string[];
    dataInfo: RegressionDataInfo;
    autoSelection: AutoSelectionInfo;
    regression: RegressionResult;
    columnSummaries: Record<string, ColumnSummary>;
    warnings?: string[];
    suggestions?: string[];
}

export interface RegressionAnalysisError {
    success: false;
    message: string;
    warnings?: string[];
}

export type RegressionAnalysisResponse = RegressionAnalysisSuccess | RegressionAnalysisError;
