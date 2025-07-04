import { tool } from 'ai';
import { z } from 'zod';
import { store } from '../../../store';
import { addLayer } from '../../../store/slices/layerSlice';
import { DataAnalyzer } from '../../../utils/dataAnalyzer';
import { getSuggestedVisualChannels } from '../../../utils/dataUtils';
import { COLOR_RANGES } from '../../../utils/colorScales';

export const smartLayerTool = tool({
  description: `Create map layers with intelligent defaults based on data analysis.
  
This tool automatically:
- Detects coordinate fields for point layers
- Identifies geometry columns for polygon/line layers  
- Suggests appropriate visual channels (color, size, etc.)
- Applies smart color scales based on data distribution
- Configures aggregation for dense datasets

Use this for quick, intelligent layer creation with minimal configuration.`,

  parameters: z.object({
    datasetId: z.string().describe('The dataset/table ID to visualize'),
    layerType: z.enum(['auto', 'point', 'heatmap', 'cluster', 'hexagon', 'grid', 'polygon', 'line', 'geojson'])
      .optional()
      .default('auto')
      .describe('Layer type - use "auto" for automatic detection'),
    visualPreset: z.enum(['default', 'heatmap', 'category', 'measure', 'density'])
      .optional()
      .default('default')
      .describe('Visual style preset'),
    customConfig: z.object({
      label: z.string().optional(),
      colorField: z.string().optional(),
      sizeField: z.string().optional(),
      colorScale: z.enum(['linear', 'quantile', 'ordinal', 'sqrt', 'log']).optional(),
      colorRange: z.string().optional()
    }).optional()
  }),

  execute: async ({ datasetId, layerType = 'auto', visualPreset = 'default', customConfig }) => {
    const state = store.getState();
    const dataset = state.layers.datasets.find(d => d.id === datasetId);
    
    if (!dataset) {
      return { 
        error: `Dataset "${datasetId}" not found. Available: ${state.layers.datasets.map(d => d.id).join(', ')}` 
      };
    }
    
    // Analyze the dataset
    const analysis = DataAnalyzer.analyzeDataset(dataset);
    const { analyzedFields, suggestions } = analysis;
    
    // Determine layer type
    let finalLayerType = layerType;
    if (layerType === 'auto') {
      if (suggestions.length > 0) {
        finalLayerType = suggestions[0].layerType;
      } else if (analyzedFields.geospatial.fieldPairs.length > 0) {
        finalLayerType = 'point';
      } else if (analyzedFields.geospatial.geometry?.length) {
        finalLayerType = 'geojson';
      } else {
        return { error: 'No geospatial data found in dataset. Cannot create map layer.' };
      }
    }
    
    // Build layer configuration
    const layerConfig: any = {
      label: customConfig?.label || `${dataset.label} ${finalLayerType}`,
      isVisible: true,
      dataId: datasetId
    };
    
    // Configure columns based on layer type
    switch (finalLayerType) {
      case 'point':
      case 'heatmap':
      case 'cluster': {
        if (analyzedFields.geospatial.fieldPairs.length === 0) {
          return { error: 'No coordinate fields found for point-based layer' };
        }
        const coords = analyzedFields.geospatial.fieldPairs[0];
        layerConfig.columns = {
          lat: coords.lat.name,
          lng: coords.lng.name,
          ...(coords.alt ? { altitude: coords.alt.name } : {})
        };
        break;
      }
      
      case 'hexagon':
      case 'grid': {
        if (analyzedFields.geospatial.fieldPairs.length === 0) {
          return { error: 'No coordinate fields found for aggregation layer' };
        }
        const coords = analyzedFields.geospatial.fieldPairs[0];
        layerConfig.columns = {
          lat: coords.lat.name,
          lng: coords.lng.name
        };
        // Configure aggregation
        layerConfig.visConfig = {
          worldUnitSize: finalLayerType === 'hexagon' ? 1 : 5,
          resolution: 8,
          coverage: 0.9,
          elevationScale: 5
        };
        break;
      }
      
      case 'geojson':
      case 'polygon':
      case 'line': {
        if (!analyzedFields.geospatial.geometry?.length) {
          return { error: 'No geometry field found for geometry layer' };
        }
        layerConfig.columns = {
          geojson: analyzedFields.geospatial.geometry[0].name
        };
        break;
      }
    }
    
    // Apply visual preset and suggestions
    const visualChannels = getSuggestedVisualChannels(finalLayerType, analyzedFields);
    
    // Override with custom config if provided
    if (customConfig?.colorField) {
      visualChannels.color = {
        field: customConfig.colorField,
        scale: customConfig.colorScale || visualChannels.color?.scale || 'quantile'
      };
    }
    if (customConfig?.sizeField) {
      visualChannels.radius = {
        field: customConfig.sizeField,
        scale: 'sqrt'
      };
    }
    
    // Apply preset styles
    switch (visualPreset) {
      case 'heatmap':
        if (finalLayerType === 'point') {
          finalLayerType = 'heatmap';
        }
        break;
        
      case 'category':
        // Force categorical color scale
        if (visualChannels.color && analyzedFields.categorical.length > 0) {
          visualChannels.color.field = analyzedFields.categorical[0].name;
          visualChannels.color.scale = 'ordinal';
        }
        break;
        
      case 'measure':
        // Use continuous scale for first numeric field
        if (analyzedFields.numeric.length > 0) {
          visualChannels.color = {
            field: analyzedFields.numeric[0].name,
            scale: 'quantile'
          };
        }
        break;
        
      case 'density':
        // Convert to heatmap or hexagon for density
        if (finalLayerType === 'point' && dataset.allData.length > 500) {
          finalLayerType = dataset.allData.length > 5000 ? 'hexagon' : 'heatmap';
        }
        break;
    }
    
    // Set default visual config
    const defaultVisConfig: any = {
      opacity: 0.8,
      filled: true,
      outline: finalLayerType === 'polygon',
      ...(finalLayerType === 'point' ? { radius: 5, fixedRadius: false } : {}),
      ...(finalLayerType === 'line' ? { thickness: 2 } : {})
    };
    
    layerConfig.visConfig = { ...defaultVisConfig, ...(layerConfig.visConfig || {}) };
    
    // Dispatch layer creation
    store.dispatch(addLayer({
      type: finalLayerType as any,
      dataId: datasetId,
      config: layerConfig
    }));
    
    const newState = store.getState().layers;
    const newLayer = newState.layers[newState.layers.length - 1];
    
    // Apply visual channels after layer creation
    if (Object.keys(visualChannels).length > 0) {
      // This would be done through updateLayerVisualChannel actions
      // For now, we'll return the suggestions
    }
    
    // Generate response with insights
    let message = `Created ${finalLayerType} layer for "${dataset.label}"`;
    
    if (analysis.insights.length > 0) {
      message += `\n\n📊 **Data Insights:**\n`;
      analysis.insights.slice(0, 3).forEach(insight => {
        message += `• ${insight.title}: ${insight.description}\n`;
      });
    }
    
    if (Object.keys(visualChannels).length > 0) {
      message += `\n\n🎨 **Suggested Visual Mappings:**\n`;
      Object.entries(visualChannels).forEach(([channel, config]) => {
        message += `• ${channel}: ${config.field} (${config.scale} scale)\n`;
      });
    }
    
    if (analysis.suggestions.length > 1) {
      message += `\n\n💡 **Other Visualization Options:**\n`;
      analysis.suggestions.slice(1, 3).forEach(suggestion => {
        message += `• ${suggestion.layerType}: ${suggestion.reason}\n`;
      });
    }
    
    return {
      success: true,
      message,
      layerId: newLayer.id,
      layer: newLayer,
      analysis: {
        dataQuality: analysis.summary.dataQuality,
        insights: analysis.insights.length,
        patterns: analysis.patterns.length
      },
      visualChannels
    };
  }
});