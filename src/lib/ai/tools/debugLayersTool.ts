import { tool } from 'ai';
import { z } from 'zod';
import { MapStyleManager } from '../../../utils/mapStyleManager';

export function createDebugLayersTool(styleManager: MapStyleManager) {
  return tool({
    description: `Debug tool to get detailed information about map layers and their current state. Use this when layer detection is not working as expected.`,

    parameters: z.object({
      detailed: z.boolean().optional().default(true)
        .describe('Whether to show detailed debugging information')
    }),

    execute: async ({ detailed = true }) => {
      try {
        // Get layers immediately
        const immediateLayerIds = styleManager.getLayerIds();
        const immediateDataInfo = styleManager.getDataLayerInfo();
        
        // Get layers with retry
        const retryDataInfo = await styleManager.getDataLayerInfoWithRetry(5, 300);
        
        // Check global debug info if available
        const globalDebug = (window as { debugMapLayers?: unknown }).debugMapLayers as {
          allLayers?: string[];
          duckdbLayers?: string[];
          styleManager?: unknown;
          mapInstance?: {
            getStyle(): { layers?: { id: string }[] };
          };
        } | undefined;
        
        // Direct comparison: check if StyleManager map === global map
        const styleManagerMap = (styleManager as unknown as { map?: unknown }).map;
        const globalMap = globalDebug?.mapInstance;
        const mapsAreSame = styleManagerMap === globalMap;
        
        // Manual layer check on global map
        let globalMapLayers: string[] = [];
        if (globalMap) {
            try {
                const globalStyle = globalMap.getStyle();
                globalMapLayers = globalStyle?.layers?.map((l: { id: string }) => l.id) || [];
            } catch {
                // Error getting global map layers
            }
        }
        
        const debugInfo = {
          immediate: {
            allLayers: immediateLayerIds,
            dataLayers: immediateDataInfo,
            totalLayers: immediateLayerIds.length,
            duckdbCount: immediateDataInfo.duckdb.length,
            geojsonCount: immediateDataInfo.geojson.length
          },
          afterRetry: {
            dataLayers: retryDataInfo,
            duckdbCount: retryDataInfo.duckdb.length,
            geojsonCount: retryDataInfo.geojson.length
          },
          globalDebug: globalDebug ? {
            allLayers: globalDebug.allLayers,
            duckdbLayers: globalDebug.duckdbLayers,
            hasStyleManager: !!globalDebug.styleManager,
            hasMapInstance: !!globalDebug.mapInstance
          } : null,
          styleManagerStatus: {
            exists: !!styleManager,
            mapLoaded: styleManager ? (styleManager as unknown as { map?: { loaded(): boolean } }).map?.loaded() : false,
            styleLoaded: styleManager ? (styleManager as unknown as { map?: { isStyleLoaded(): boolean } }).map?.isStyleLoaded() : false
          },
          mapComparison: {
            styleManagerMapExists: !!styleManagerMap,
            globalMapExists: !!globalMap,
            mapsAreSame: mapsAreSame,
            globalMapLayers: globalMapLayers
          }
        };

        if (detailed) {
          return {
            success: true,
            debug: debugInfo,
            message: `Debug Info - Immediate: ${debugInfo.immediate.totalLayers} layers (${debugInfo.immediate.duckdbCount} DuckDB, ${debugInfo.immediate.geojsonCount} GeoJSON). After retry: ${debugInfo.afterRetry.duckdbCount} DuckDB, ${debugInfo.afterRetry.geojsonCount} GeoJSON.`
          };
        } else {
          const totalDataLayers = debugInfo.afterRetry.duckdbCount + debugInfo.afterRetry.geojsonCount;
          return {
            success: true,
            message: `Found ${totalDataLayers} data layers after retry: ${debugInfo.afterRetry.duckdbCount} DuckDB, ${debugInfo.afterRetry.geojsonCount} GeoJSON`
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Debug error: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}
