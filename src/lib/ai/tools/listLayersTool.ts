import { tool } from 'ai';
import { z } from 'zod';
import { MapStyleManager } from '../../../utils/mapStyleManager';

export function createListLayersTool(styleManager: MapStyleManager) {
  return tool({
    description: `List all available map layers and their types. Use this to check what layers exist before styling them.`,

    parameters: z.object({
      show_details: z.boolean().optional()
        .describe('Whether to show detailed information about each layer')
    }),

    execute: async ({ show_details = false }) => {
      try {
        console.log('listLayersTool: Getting layer information with retry mechanism...');
        const allLayers = styleManager.getLayerIds();
        console.log('listLayersTool: All layers:', allLayers);
        const dataLayerInfo = await styleManager.getDataLayerInfoWithRetry();
        console.log('listLayersTool: Data layer info after retry:', dataLayerInfo);
        
        const layersByType = {
          polygons: styleManager.findLayersByType('polygon'),
          lines: styleManager.findLayersByType('line'),
          points: styleManager.findLayersByType('point')
        };
        console.log('listLayersTool: Layers by type:', layersByType);

        if (show_details) {
          return {
            success: true,
            layers: {
              all: allLayers,
              duckdb: dataLayerInfo.duckdb,
              geojson: dataLayerInfo.geojson,
              by_geometry: layersByType
            },
            message: `Found ${allLayers.length} total layers: ${dataLayerInfo.duckdb.length} DuckDB layers, ${dataLayerInfo.geojson.length} GeoJSON layers`
          };
        } else {
          const dataLayers = [...dataLayerInfo.duckdb, ...dataLayerInfo.geojson];
          return {
            success: true,
            layers: dataLayers,
            message: `Available data layers: ${dataLayers.join(', ') || 'None'}`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Error listing layers: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}