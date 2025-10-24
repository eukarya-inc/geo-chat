export interface FeatureCorrelation {
    feature: string;
    correlation: number;
    absoluteCorrelation: number;
    pairCount: number;
}

export interface ExcludedFeature {
    feature: string;
    correlation: number;
    reason: 'user_excluded' | 'high_correlation' | 'insufficient_data';
    details?: string;
}

export interface FeatureSelectionSuccess {
    success: true;
    message: string;
    tableName: string;
    targetColumn: string;
    selectedFeatures: string[];
    featureCorrelations: FeatureCorrelation[];
    excludedFeatures: ExcludedFeature[];
    candidateCount: number;
    selectionMethod: 'correlation_based';
    topK: number;
    warnings?: string[];
}

export interface FeatureSelectionError {
    success: false;
    message: string;
    warnings?: string[];
}

export type FeatureSelectionResponse = FeatureSelectionSuccess | FeatureSelectionError;
