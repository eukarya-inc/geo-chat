import { z } from 'zod';
import { store } from '@/store';
import { addLayer } from '@/store/slices/mapSlice';
import { LayerFactory } from '@/features/map/layers';
import { BaseTool, ToolContext, ToolResult } from './base';

export class CreateMapTool extends BaseTool {
  name = 'createMap';
  description = 'Create a map visualization from spatial data';
  
  parameters = z.object({
    query: z.string().describe('SQL query to get the data for the map'),
    layerType: z.enum(['point', 'polygon', 'line', 'heatmap', 'choropleth']).optional()
      .describe('Type of map layer to create. If not specified, will be auto-detected from geometry type'),
    colorBy: z.string().optional()
      .describe('Column name to use for coloring features'),
    sizeBy: z.string().optional()
      .describe('Column name to use for sizing features (point layers only)'),
    label: z.string().optional()
      .describe('Label for the layer')
  });

  async run(params: z.infer<typeof this.parameters>, context: ToolContext): Promise<any> {
    const { query, layerType, colorBy, sizeBy, label } = params;
    
    try {
      // Execute the query using context
      const data = await context.duckdb.executeQuery(query);
      
      if (!data || data.length === 0) {
        return {
          success: false,
          message: 'Query returned no results'
        };
      }

      // Get column information
      const columns = Object.keys(data[0] || {}).map(name => ({
        name,
        type: typeof data[0][name]
      }));

      // Find geometry column
      const geomColumn = columns.find(col => 
        col.name.toLowerCase() === 'geometry' || 
        col.name.toLowerCase() === 'geom' ||
        col.name.toLowerCase() === 'wkt'
      );

      if (!geomColumn && !columns.find(col => col.name.toLowerCase().includes('lat'))) {
        return {
          success: false,
          message: 'No geometry column found in query results. Please ensure your query includes a geometry column or latitude/longitude columns.'
        };
      }

      // Auto-detect layer type if not specified
      let detectedLayerType = layerType;
      if (!detectedLayerType && geomColumn && data[0][geomColumn.name]) {
        const firstGeom = data[0][geomColumn.name];
        let geomType = null;
        
        if (typeof firstGeom === 'string') {
          // Try to parse as JSON
          try {
            const parsed = JSON.parse(firstGeom);
            geomType = parsed.type;
          } catch {
            // Might be WKT
            if (firstGeom.startsWith('POINT')) geomType = 'Point';
            else if (firstGeom.startsWith('POLYGON') || firstGeom.startsWith('MULTIPOLYGON')) geomType = 'Polygon';
            else if (firstGeom.startsWith('LINESTRING') || firstGeom.startsWith('MULTILINESTRING')) geomType = 'LineString';
          }
        } else if (firstGeom && firstGeom.type) {
          geomType = firstGeom.type;
        }

        detectedLayerType = LayerFactory.getLayerTypeFromGeometry(geomType || '') || 'point';
      } else {
        detectedLayerType = 'point'; // Default to point for lat/lng data
      }

      // Create unique IDs
      const datasetId = `map_${Date.now()}`;
      const layerId = `layer_${Date.now()}`;

      // Create layer configuration
      const layerConfig = {
        id: layerId,
        type: detectedLayerType,
        sourceId: datasetId,
        visible: true,
        style: {
          label: label || 'Map Layer',
          color: '#4f46e5',
          ...(colorBy && {
            visualChannels: {
              color: {
                field: colorBy,
                scale: 'ordinal' as const
              }
            }
          }),
          ...(sizeBy && detectedLayerType === 'point' && {
            visualChannels: {
              ...((colorBy && {
                color: {
                  field: colorBy,
                  scale: 'ordinal' as const
                }
              })),
              size: {
                field: sizeBy,
                scale: 'linear' as const
              }
            }
          })
        }
      };

      // Dispatch action to add layer using store directly
      store.dispatch(addLayer(layerConfig));

      // Calculate bounds for zooming
      const bounds = null;
      if (geomColumn && data[0][geomColumn.name]) {
        // TODO: Calculate bounds from geometry
      }

      return {
        layerId,
        layerType: detectedLayerType,
        featureCount: data.length,
        bounds,
        datasetId
      };
    } catch (error) {
      console.error('Error creating map:', error);
      throw error;
    }
  }

  formatResult(result: any): ToolResult {
    const { layerId, layerType, featureCount, bounds, datasetId } = result;
    
    return {
      success: true,
      data: {
        layerId,
        layerType,
        featureCount,
        bounds,
        datasetId
      },
      message: `Created ${layerType} layer with ${featureCount} features`,
      visualization: {
        type: 'map',
        config: {
          layerId,
          bounds
        }
      }
    };
  }
}