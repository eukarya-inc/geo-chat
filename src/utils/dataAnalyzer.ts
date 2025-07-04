import { Dataset, Field } from '../types/layer.types';
import { 
  analyzeFields, 
  getSuggestedLayerType, 
  getSuggestedVisualChannels,
  calculateFieldStats,
  detectDataPatterns,
  AnalyzedFields
} from './dataUtils';

export interface DataInsight {
  type: 'info' | 'warning' | 'suggestion';
  title: string;
  description: string;
  action?: {
    type: string;
    params: any;
  };
}

export interface VisualizationSuggestion {
  layerType: string;
  config: any;
  visualChannels: Record<string, any>;
  reason: string;
  priority: number;
}

export interface DataAnalysisResult {
  summary: {
    rowCount: number;
    columnCount: number;
    hasGeospatialData: boolean;
    hasTemporalData: boolean;
    dataQuality: 'high' | 'medium' | 'low';
  };
  analyzedFields: AnalyzedFields;
  fieldStats: Record<string, any>;
  insights: DataInsight[];
  suggestions: VisualizationSuggestion[];
  patterns: any[];
}

export class DataAnalyzer {
  // Analyze a dataset and provide insights
  static analyzeDataset(dataset: Dataset): DataAnalysisResult {
    const { fields, allData } = dataset;
    
    // Basic analysis
    const analyzedFields = analyzeFields(fields, allData);
    
    // Calculate statistics for numeric fields
    const fieldStats: Record<string, any> = {};
    analyzedFields.numeric.forEach(field => {
      const stats = calculateFieldStats(field.name, allData);
      if (stats) {
        fieldStats[field.name] = stats;
      }
    });
    
    // Detect patterns
    const patterns = detectDataPatterns(fields, analyzedFields, allData);
    
    // Generate insights
    const insights = this.generateInsights(dataset, analyzedFields, fieldStats);
    
    // Generate visualization suggestions
    const suggestions = this.generateSuggestions(dataset, analyzedFields, patterns);
    
    // Data quality assessment
    const dataQuality = this.assessDataQuality(dataset, analyzedFields);
    
    return {
      summary: {
        rowCount: allData.length,
        columnCount: fields.length,
        hasGeospatialData: this.hasGeospatialData(analyzedFields),
        hasTemporalData: analyzedFields.temporal.length > 0,
        dataQuality
      },
      analyzedFields,
      fieldStats,
      insights,
      suggestions,
      patterns
    };
  }
  
  // Generate insights about the data
  private static generateInsights(
    dataset: Dataset,
    analyzedFields: AnalyzedFields,
    fieldStats: Record<string, any>
  ): DataInsight[] {
    const insights: DataInsight[] = [];
    
    // Geospatial insights
    if (analyzedFields.geospatial.fieldPairs.length > 0) {
      insights.push({
        type: 'info',
        title: 'Geographic data detected',
        description: `Found ${analyzedFields.geospatial.fieldPairs.length} coordinate pair(s) that can be plotted on a map`
      });
    } else if (analyzedFields.geospatial.geometry?.length) {
      insights.push({
        type: 'info',
        title: 'Geometry data detected',
        description: `Found ${analyzedFields.geospatial.geometry.length} geometry field(s) for map visualization`
      });
    }
    
    // Temporal insights
    if (analyzedFields.temporal.length > 0) {
      insights.push({
        type: 'info',
        title: 'Time data detected',
        description: `Found ${analyzedFields.temporal.length} time field(s) that can be used for temporal analysis`,
        action: {
          type: 'enable_time_filter',
          params: { field: analyzedFields.temporal[0].name }
        }
      });
    }
    
    // Data quality insights
    const nullCounts = this.countNulls(dataset);
    const highNullFields = Object.entries(nullCounts)
      .filter(([_, count]) => count > dataset.allData.length * 0.5)
      .map(([field, _]) => field);
    
    if (highNullFields.length > 0) {
      insights.push({
        type: 'warning',
        title: 'High null values detected',
        description: `Fields with >50% null values: ${highNullFields.join(', ')}`
      });
    }
    
    // Distribution insights
    Object.entries(fieldStats).forEach(([fieldName, stats]) => {
      if (stats.stdDev > stats.mean * 2) {
        insights.push({
          type: 'info',
          title: `High variance in ${fieldName}`,
          description: 'Consider using logarithmic scale for better visualization'
        });
      }
    });
    
    // Categorical insights
    if (analyzedFields.categorical.length > 0) {
      const categoricalField = analyzedFields.categorical[0];
      const uniqueValues = new Set(
        dataset.allData.map(row => row[categoricalField.name])
      ).size;
      
      if (uniqueValues <= 10) {
        insights.push({
          type: 'suggestion',
          title: 'Good categorical field for color coding',
          description: `${categoricalField.name} has ${uniqueValues} unique values`,
          action: {
            type: 'set_color_field',
            params: { field: categoricalField.name }
          }
        });
      }
    }
    
    return insights;
  }
  
  // Generate visualization suggestions
  private static generateSuggestions(
    dataset: Dataset,
    analyzedFields: AnalyzedFields,
    patterns: any[]
  ): VisualizationSuggestion[] {
    const suggestions: VisualizationSuggestion[] = [];
    
    // Map visualization suggestions
    if (this.hasGeospatialData(analyzedFields)) {
      // Point layer suggestion
      if (analyzedFields.geospatial.fieldPairs.length > 0) {
        const pair = analyzedFields.geospatial.fieldPairs[0];
        suggestions.push({
          layerType: 'point',
          config: {
            label: `${dataset.label} Points`,
            isVisible: true,
            columns: {
              lat: pair.lat.name,
              lng: pair.lng.name,
              ...(pair.alt ? { altitude: pair.alt.name } : {})
            }
          },
          visualChannels: getSuggestedVisualChannels('point', analyzedFields),
          reason: 'Dataset contains latitude/longitude coordinates',
          priority: 10
        });
        
        // Heatmap suggestion for dense points
        if (dataset.allData.length > 1000) {
          suggestions.push({
            layerType: 'heatmap',
            config: {
              label: `${dataset.label} Heatmap`,
              isVisible: true,
              columns: {
                lat: pair.lat.name,
                lng: pair.lng.name
              }
            },
            visualChannels: {},
            reason: 'Large number of points - heatmap can show density patterns',
            priority: 8
          });
        }
        
        // Cluster suggestion
        if (patterns.some(p => p.type === 'spatial_cluster')) {
          suggestions.push({
            layerType: 'cluster',
            config: {
              label: `${dataset.label} Clusters`,
              isVisible: true,
              columns: {
                lat: pair.lat.name,
                lng: pair.lng.name
              }
            },
            visualChannels: {},
            reason: 'Points appear to be clustered geographically',
            priority: 7
          });
        }
      }
      
      // Polygon/Line suggestions for geometry
      if (analyzedFields.geospatial.geometry?.length) {
        suggestions.push({
          layerType: 'geojson',
          config: {
            label: `${dataset.label} Geometry`,
            isVisible: true,
            columns: {
              geojson: analyzedFields.geospatial.geometry[0].name
            }
          },
          visualChannels: getSuggestedVisualChannels('geojson', analyzedFields),
          reason: 'Dataset contains geometry data',
          priority: 10
        });
      }
    }
    
    // Time series visualization
    if (patterns.some(p => p.type === 'time_series')) {
      const timeField = analyzedFields.temporal[0];
      const valueField = analyzedFields.numeric[0];
      
      suggestions.push({
        layerType: 'chart',
        config: {
          type: 'line',
          x: timeField.name,
          y: valueField.name,
          title: `${valueField.name} over time`
        },
        visualChannels: {},
        reason: 'Time series data detected',
        priority: 9
      });
    }
    
    // Grid/Hexagon suggestions for aggregation
    if (analyzedFields.geospatial.fieldPairs.length > 0 && 
        analyzedFields.numeric.length > 0 &&
        dataset.allData.length > 100) {
      const pair = analyzedFields.geospatial.fieldPairs[0];
      const aggregateField = analyzedFields.numeric[0];
      
      suggestions.push({
        layerType: 'hexagon',
        config: {
          label: `${dataset.label} Hexbin`,
          isVisible: true,
          columns: {
            lat: pair.lat.name,
            lng: pair.lng.name
          },
          visConfig: {
            worldUnitSize: 1,
            resolution: 8,
            coverage: 0.9
          }
        },
        visualChannels: {
          colorField: aggregateField.name,
          colorAggregation: 'sum'
        },
        reason: 'Aggregate spatial data into hexagonal bins',
        priority: 6
      });
    }
    
    // Sort by priority
    return suggestions.sort((a, b) => b.priority - a.priority);
  }
  
  // Assess data quality
  private static assessDataQuality(
    dataset: Dataset,
    analyzedFields: AnalyzedFields
  ): 'high' | 'medium' | 'low' {
    let score = 100;
    
    // Penalize for missing geospatial data if expected
    if (!this.hasGeospatialData(analyzedFields) && 
        dataset.fields.some(f => f.name.toLowerCase().includes('address'))) {
      score -= 20;
    }
    
    // Penalize for high null counts
    const nullCounts = this.countNulls(dataset);
    const avgNullPercentage = Object.values(nullCounts)
      .reduce((sum, count) => sum + count, 0) / 
      (dataset.fields.length * dataset.allData.length);
    
    if (avgNullPercentage > 0.3) score -= 30;
    else if (avgNullPercentage > 0.1) score -= 10;
    
    // Penalize for low data volume
    if (dataset.allData.length < 10) score -= 20;
    else if (dataset.allData.length < 100) score -= 10;
    
    // Bonus for diverse data types
    const dataTypeCount = [
      analyzedFields.geospatial.fieldPairs.length > 0,
      analyzedFields.temporal.length > 0,
      analyzedFields.numeric.length > 0,
      analyzedFields.categorical.length > 0
    ].filter(Boolean).length;
    
    if (dataTypeCount >= 3) score += 10;
    
    if (score >= 80) return 'high';
    if (score >= 50) return 'medium';
    return 'low';
  }
  
  // Helper methods
  private static hasGeospatialData(analyzedFields: AnalyzedFields): boolean {
    return analyzedFields.geospatial.fieldPairs.length > 0 ||
           (analyzedFields.geospatial.geometry?.length || 0) > 0;
  }
  
  private static countNulls(dataset: Dataset): Record<string, number> {
    const nullCounts: Record<string, number> = {};
    
    dataset.fields.forEach(field => {
      nullCounts[field.name] = dataset.allData.filter(
        row => row[field.name] == null || row[field.name] === ''
      ).length;
    });
    
    return nullCounts;
  }
}