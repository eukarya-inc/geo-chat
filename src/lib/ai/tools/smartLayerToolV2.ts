import { tool } from 'ai';
import { z } from 'zod';
import { store } from '../../../store';
import { addLayer } from '../../../store/slices/layerSlice';
import { DataAnalyzer } from '../../../utils/dataAnalyzer';
import { getSuggestedVisualChannels } from '../../../utils/dataUtils';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';

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
    const { connection: db } = state.duckdb;
    const { datasets } = state.layers;
    
    if (!db) {
      return { error: 'Database connection not available' };
    }
    
    // First check if dataset exists in Redux
    let dataset = datasets.find(d => d.id === datasetId);
    
    if (!dataset) {
      // Check if it's a _viz table in DuckDB that hasn't been synced yet
      const conn = await db.connect();
      try {
        // Check if the table exists in DuckDB
        const tableExists = await conn.query(`
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = '${datasetId}'
          LIMIT 1
        `);
        
        if (tableExists.numRows > 0) {
          // Table exists in DuckDB - create a temporary dataset for it
          const schemaResult = await conn.query(`DESCRIBE ${datasetId}`);
          const schema = schemaResult.toArray();
          
          // Get sample data
          const dataResult = await conn.query(`SELECT * FROM ${datasetId} LIMIT 1000`);
          const data = dataResult.toArray();
          
          // Create temporary dataset
          dataset = {
            id: datasetId,
            label: datasetId,
            color: [Math.floor(Math.random() * 256), Math.floor(Math.random() * 256), Math.floor(Math.random() * 256)] as [number, number, number],
            allData: data,
            fields: schema.map(col => ({
              name: col.column_name,
              type: col.column_type.toLowerCase().includes('int') ? 'integer' as const :
                    col.column_type.toLowerCase().includes('real') || col.column_type.toLowerCase().includes('double') ? 'real' as const :
                    col.column_type.toLowerCase().includes('bool') ? 'boolean' as const :
                    col.column_type.toLowerCase().includes('date') || col.column_type.toLowerCase().includes('time') ? 'timestamp' as const :
                    col.column_type.toLowerCase().includes('geometry') ? 'geometry' as const :
                    'string' as const,
              format: col.column_type
            }))
          };
          
          // Add it to Redux for future use
          const { addDataset } = await import('../../../store/slices/layerSlice');
          store.dispatch(addDataset(dataset));
        } else {
          // Table doesn't exist at all
          const availableTables = await getAvailableTables(db);
          const vizTables = availableTables.filter(t => t.endsWith('_viz'));
          
          return {
            error: `Table "${datasetId}" not found`,
            suggestion: vizTables.length > 0 
              ? `Available _viz tables: ${vizTables.join(', ')}. Use one of these for visualization.`
              : 'Please load your data file using the file processor first.',
            availableTables
          };
        }
      } finally {
        await conn.close();
      }
    }
    
    // Analyze the dataset
    const analysis = DataAnalyzer.analyzeDataset(dataset);
    const { analyzedFields, suggestions } = analysis;
    
    // Determine layer type
    let finalLayerType: string = layerType;
    if (layerType === 'auto') {
      if (suggestions.length > 0) {
        finalLayerType = suggestions[0].layerType;
      } else if (analyzedFields.geospatial.fieldPairs.length > 0) {
        finalLayerType = 'point';
      } else if (analyzedFields.geospatial.geometry?.length) {
        finalLayerType = 'geojson';
      } else {
        return { 
          error: 'No geospatial data found in dataset',
          suggestion: 'This dataset does not contain coordinate fields (lat/lng) or geometry columns. Please ensure your data has location information.',
          analyzedFields: {
            numeric: analyzedFields.numeric.map(f => f.name),
            categorical: analyzedFields.categorical.map(f => f.name),
            temporal: analyzedFields.temporal.map(f => f.name)
          }
        };
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
          return { 
            error: 'No coordinate fields found for point-based layer',
            suggestion: 'Point layers require latitude and longitude fields. Common names: lat/lng, latitude/longitude, y/x',
            availableFields: dataset.fields.map(f => f.name)
          };
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
          return { 
            error: 'No geometry field found for geometry layer',
            suggestion: 'This layer type requires a geometry column. For point data, use a point layer instead.',
            availableFields: dataset.fields.map(f => ({ name: f.name, type: f.type }))
          };
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
      message += `To apply these, use the map_expression tool:\n`;
      Object.entries(visualChannels).forEach(([channel, config]) => {
        if (channel === 'color') {
          message += `• Color by ${config.field}: map_expression with styleRequest="color by ${config.field}"\n`;
        } else if (channel === 'radius') {
          message += `• Size by ${config.field}: map_expression with styleRequest="size by ${config.field}"\n`;
        }
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
      visualChannels,
      nextSteps: [
        'Use map_expression to apply conditional styling',
        'Adjust layer visibility in the layer panel',
        'Create additional layers for different perspectives'
      ]
    };
  }
});

// Helper function to get available tables
async function getAvailableTables(db: AsyncDuckDB): Promise<string[]> {
  const conn = await db.connect();
  try {
    const result = await conn.query('SHOW TABLES');
    const tables: string[] = [];
    for (let i = 0; i < result.numRows; i++) {
      tables.push(result.getChildAt(0)?.get(i) as string);
    }
    return tables;
  } finally {
    await conn.close();
  }
}