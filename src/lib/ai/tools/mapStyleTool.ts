import { tool } from 'ai';
import { z } from 'zod';
import { MapStyleManager, MapStyleUpdate } from '../../../utils/mapStyleManager';

export function createMapStyleTool(styleManager: MapStyleManager) {
  return tool({
    description: `Update MapLibre GL map styles including colors, opacity, visibility, and conditional styling using MapLibre GL expressions.

IMPORTANT: Always check available layers first before applying styles. Layer names depend on data source:
- DuckDB data creates: duckdb-polygons, duckdb-lines, duckdb-points
- GeoJSON data creates: geojson-polygons, geojson-lines, geojson-points

Use 'auto' as layer_id to automatically detect the best matching layer.

CONDITIONAL STYLING WITH MAPLIBRE GL EXPRESSIONS:
You can create conditional styles using MapLibre GL expression syntax:
- Basic conditional: ["case", ["<", ["get", "property"], 100], "red", "blue"]
- Multi-condition: ["case", ["<", ["get", "pop"], 1000], "#fee", ["<", ["get", "pop"], 10000], "#fcc", "#f00"]
- Categorical: ["case", ["==", ["get", "type"], "urban"], "red", ["==", ["get", "type"], "rural"], "green", "gray"]
- Interpolated: ["interpolate", ["linear"], ["get", "value"], 0, "blue", 100, "red"]

For choropleth maps, use expressions like:
["interpolate", ["linear"], ["get", "property_name"], min_value, "light_color", max_value, "dark_color"]

For categorical styling:
["case", ["==", ["get", "category"], "A"], "red", ["==", ["get", "category"], "B"], "blue", "gray"]

Common paint properties:
- fill-color, fill-opacity, fill-outline-color (for polygons)
- line-color, line-width, line-opacity (for lines)
- circle-color, circle-radius, circle-stroke-width, circle-stroke-color (for points)

Layout properties:
- visibility: 'visible' or 'none' to show/hide layers`,

    parameters: z.object({
      update_type: z.enum(['layer-paint', 'layer-layout', 'layer-filter'])
        .describe('Type of style update to perform'),
      layer_id: z.string()
        .describe('ID of the layer to modify (e.g., duckdb-polygons, geojson-lines) or "auto" to auto-detect'),
      properties: z.record(z.any())
        .describe('Style properties to update as key-value pairs'),
      description: z.string()
        .describe('Human-readable description of what this style change does')
    }),

    execute: async ({ update_type, layer_id, properties, description }) => {
      try {
        let targetLayerId = layer_id;
        
        // Handle auto-detection
        if (layer_id === 'auto') {
          targetLayerId = styleManager.findBestLayerMatch(description) || '';
          if (!targetLayerId) {
            // Try with retry mechanism to handle timing issues
            console.log('mapStyleTool: No layer found with immediate detection, trying with retry...');
            const dataLayerInfo = await styleManager.getDataLayerInfoWithRetry();
            const availableLayers = [...dataLayerInfo.duckdb, ...dataLayerInfo.geojson];
            
            if (availableLayers.length > 0) {
              // Use the first available layer as a fallback
              targetLayerId = availableLayers[0];
              console.log('mapStyleTool: Using fallback layer:', targetLayerId);
            } else {
              return {
                success: false,
                error: `No suitable layer found for auto-detection. Available layers: ${availableLayers.join(', ')}`
              };
            }
          }
        }
        
        // Get available layers for better error messages
        const availableLayers = styleManager.getLayerIds();
        const dataLayers = availableLayers.filter(id => 
          id.startsWith('duckdb-') || id.startsWith('geojson-')
        );
        
        if (!availableLayers.includes(targetLayerId)) {
          return {
            success: false,
            error: `Layer '${targetLayerId}' does not exist. Available data layers: ${dataLayers.join(', ')}`
          };
        }

        const update: MapStyleUpdate = {
          type: update_type,
          layerId: targetLayerId,
          properties: properties
        };

        const success = styleManager.applyStyleUpdate(update);

        if (success) {
          return {
            success: true,
            message: `${description} (Applied to: ${targetLayerId})`,
            appliedUpdate: update
          };
        } else {
          return {
            success: false,
            error: `Failed to apply style update to layer '${targetLayerId}'`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Error applying style update: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}