import { z } from 'zod';
import { BaseTool, ToolContext, ToolResult } from './base';

export class CreateMapTool extends BaseTool {
  name = 'createMap';
  description = 'Create a map visualization from spatial data';
  
  parameters = z.object({
    table: z.string().describe('The table containing spatial data'),
    type: z.enum(['point', 'polygon', 'line', 'heatmap', 'choropleth']).describe('The type of map layer to create'),
    colorBy: z.string().optional().describe('Column to use for coloring features'),
    sizeBy: z.string().optional().describe('Column to use for sizing points (point layers only)'),
    filter: z.string().optional().describe('SQL WHERE clause to filter data'),
    aggregation: z.string().optional().describe('Aggregation expression for choropleth maps'),
  });

  async run(params: any, context: ToolContext): Promise<any> {
    // Build the query
    let sql = `SELECT * FROM ${params.table}`;
    
    if (params.filter) {
      sql += ` WHERE ${params.filter}`;
    }
    
    // For choropleth, we might need to aggregate
    if (params.type === 'choropleth' && params.aggregation) {
      const geoCol = await this.findGeometryColumn(params.table, context);
      sql = `
        SELECT 
          ${geoCol},
          ${params.aggregation} as value
        FROM ${params.table}
        ${params.filter ? `WHERE ${params.filter}` : ''}
        GROUP BY ${geoCol}
      `;
    }
    
    // Execute query
    const data = await context.duckdb.executeQuery(sql);
    
    return {
      layerType: params.type,
      data,
      config: {
        colorBy: params.colorBy,
        sizeBy: params.sizeBy,
      },
      sql,
    };
  }

  async findGeometryColumn(table: string, context: ToolContext): Promise<string> {
    const schema = await context.duckdb.getTableSchema(table);
    const geoCol = schema.find((col: any) => 
      col.column_type === 'GEOMETRY' ||
      col.column_name.toLowerCase().includes('geom')
    );
    return geoCol?.column_name || 'geom';
  }

  formatResult(result: any): ToolResult {
    return {
      success: true,
      data: result.data,
      message: `Created ${result.layerType} map layer with ${result.data.length} features.`,
      visualization: {
        type: 'map',
        config: {
          layerType: result.layerType,
          data: result.data,
          paint: this.getDefaultPaint(result.layerType, result.config),
        },
      },
    };
  }

  private getDefaultPaint(layerType: string, config: any): any {
    switch (layerType) {
      case 'point':
        return {
          'circle-radius': config.sizeBy ? ['interpolate', ['linear'], ['get', config.sizeBy], 0, 4, 100, 20] : 6,
          'circle-color': config.colorBy ? ['interpolate', ['linear'], ['get', config.colorBy], 0, '#2166ac', 100, '#b2182b'] : '#3887be',
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1,
        };
      
      case 'polygon':
        return {
          'fill-color': config.colorBy ? ['interpolate', ['linear'], ['get', config.colorBy], 0, '#2166ac', 100, '#b2182b'] : '#088',
          'fill-opacity': 0.6,
        };
      
      case 'line':
        return {
          'line-color': config.colorBy ? ['interpolate', ['linear'], ['get', config.colorBy], 0, '#2166ac', 100, '#b2182b'] : '#3887be',
          'line-width': 3,
        };
      
      case 'heatmap':
        return {
          'heatmap-weight': config.sizeBy ? ['interpolate', ['linear'], ['get', config.sizeBy], 0, 0, 100, 1] : 1,
          'heatmap-intensity': 1,
          'heatmap-radius': 20,
        };
      
      case 'choropleth':
        return {
          'fill-color': ['interpolate', ['linear'], ['get', 'value'], 0, '#f7fbff', 100, '#08519c'],
          'fill-opacity': 0.7,
          'fill-outline-color': '#000000',
        };
      
      default:
        return {};
    }
  }
}
