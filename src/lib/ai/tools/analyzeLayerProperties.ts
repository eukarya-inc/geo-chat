import { tool } from 'ai';
import { z } from 'zod';
import maplibregl from 'maplibre-gl';

export function createAnalyzeLayerPropertiesTool(getMap: () => maplibregl.Map | null) {
  return tool({
    description: `Analyze the actual properties available in map layer features. This shows the properties as they exist in the rendered features (after any transformations like flattening), not the original table schema. Use this before creating conditional styles to understand what properties are available.`,
    
    parameters: z.object({
      layer_id: z.string()
        .describe('ID of the layer to analyze (e.g., duckdb-points, duckdb-polygons, geojson-lines)'),
      sample_size: z.number()
        .optional()
        .default(10)
        .describe('Number of features to sample for analysis'),
    }),
    
    execute: async ({ layer_id, sample_size = 10 }) => {
      const map = getMap();
      if (!map) {
        return {
          success: false,
          error: 'Map is not available'
        };
      }
      
      try {
        // Check if layer exists
        const layer = map.getLayer(layer_id);
        if (!layer) {
          const allLayers = map.getStyle().layers?.map(l => l.id) || [];
          const dataLayers = allLayers.filter(id => 
            id.startsWith('duckdb-') || id.startsWith('geojson-')
          );
          
          return {
            success: false,
            error: `Layer '${layer_id}' not found. Available data layers: ${dataLayers.join(', ')}`
          };
        }
        
        // Query rendered features from the layer
        const features = map.queryRenderedFeatures(undefined, {
          layers: [layer_id]
        });
        
        if (features.length === 0) {
          return {
            success: false,
            error: `No features found in layer '${layer_id}'. The layer might be empty or not visible at the current zoom/extent.`
          };
        }
        
        // Analyze properties from sample features
        const sampleFeatures = features.slice(0, sample_size);
        const allPropertyKeys = new Set<string>();
        const propertyTypes: Record<string, Set<string>> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const propertyExamples: Record<string, any[]> = {};
        
        // Collect all unique property keys and their types
        sampleFeatures.forEach(feature => {
          const props = feature.properties || {};
          Object.entries(props).forEach(([key, value]) => {
            allPropertyKeys.add(key);
            
            // Track property types
            if (!propertyTypes[key]) {
              propertyTypes[key] = new Set();
              propertyExamples[key] = [];
            }
            
            const valueType = value === null ? 'null' : typeof value;
            propertyTypes[key].add(valueType);
            
            // Collect unique examples (limit to 5)
            if (propertyExamples[key].length < 5 && 
                !propertyExamples[key].some(ex => JSON.stringify(ex) === JSON.stringify(value))) {
              propertyExamples[key].push(value);
            }
          });
        });
        
        // Build property summary
        const propertySummary = Array.from(allPropertyKeys).map(key => {
          const types = Array.from(propertyTypes[key] || []).join(' | ');
          const examples = propertyExamples[key] || [];
          const nonNullExamples = examples.filter(ex => ex !== null);
          
          return {
            property: key,
            types: types,
            examples: nonNullExamples.slice(0, 3),
            nullCount: examples.filter(ex => ex === null).length,
            nonNullCount: examples.filter(ex => ex !== null).length
          };
        }).sort((a, b) => a.property.localeCompare(b.property));
        
        // Get layer type
        const layerType = layer.type;
        const geometryType = features[0]?.geometry?.type || 'Unknown';
        
        return {
          success: true,
          layer_id: layer_id,
          layer_type: layerType,
          geometry_type: geometryType,
          total_features: features.length,
          sample_size: sampleFeatures.length,
          properties: propertySummary,
          style_examples: {
            'Basic property access': `["get", "propertyName"]`,
            'Conditional color': `["case", [">=", ["get", "propertyName"], value], "red", "blue"]`,
            'Multiple conditions': `["case", ["<", ["get", "propertyName"], 100], "green", ["<", ["get", "propertyName"], 1000], "yellow", "red"]`,
            'Interpolated color': `["interpolate", ["linear"], ["get", "propertyName"], minValue, "lightblue", maxValue, "darkblue"]`
          }
        };
        
      } catch (error) {
        return {
          success: false,
          error: `Error analyzing layer: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}
