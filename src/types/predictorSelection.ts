export interface PredictorCorrelation {
    predictor: string;
    correlation: number;
    absoluteCorrelation: number;
    pairCount: number;
}

export interface ExcludedPredictor {
    predictor: string;
    correlation: number;
    reason: 'user_excluded' | 'high_correlation' | 'insufficient_data';
    details?: string;
}

export interface PredictorSelectionSuccess {
    success: true;
    message: string;
    tableName: string;
    targetColumn: string;
    selectedPredictors: string[];
    predictorCorrelations: PredictorCorrelation[];
    excludedPredictors: ExcludedPredictor[];
    candidateCount: number;
    selectionMethod: 'correlation_based';
    topK: number;
    warnings?: string[];
}

export interface PredictorSelectionError {
    success: false;
    message: string;
    warnings?: string[];
}

export type PredictorSelectionResponse = PredictorSelectionSuccess | PredictorSelectionError;
