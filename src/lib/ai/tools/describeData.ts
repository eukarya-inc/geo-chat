import { z } from 'zod';
import { BaseTool, ToolContext, ToolResult } from './base';

export class DescribeDataTool extends BaseTool {
  name = 'describeData';
  description = 'Get detailed information about the available datasets, tables, and their schemas. Use this to explore data structure and contents.';
  
  parameters = z.object({
    tableName: z.string().optional().describe('Specific table to describe. If not provided, lists all tables'),
  });

  async run(params: { tableName?: string }, context: ToolContext): Promise<any> {
    if (params.tableName) {
      // Get schema for specific table
      const schema = await context.duckdb.getTableSchema(params.tableName);
      const countResult = await context.duckdb.executeQuery(
        `SELECT COUNT(*) as count FROM ${params.tableName}`
      );
      
      return {
        tableName: params.tableName,
        schema,
        rowCount: Number(countResult[0].count),
      };
    } else {
      // List all tables with basic info
      const tables = await context.duckdb.getTableNames();
      
      // Use a more efficient approach - get basic info from information_schema
      const tableInfo = [];
      
      for (const table of tables) {
        try {
          // Get column count and check for geometry columns in one query
          const schemaResult = await context.duckdb.executeQuery(`
            SELECT 
              COUNT(*) as column_count,
              BOOL_OR(column_type = 'GEOMETRY' OR LOWER(column_name) LIKE '%geom%') as has_geometry
            FROM information_schema.columns 
            WHERE table_name = '${table}'
          `);
          
          // Get row count separately to avoid complex queries
          const countResult = await context.duckdb.executeQuery(
            `SELECT COUNT(*) as count FROM ${table}`
          );
          
          tableInfo.push({
            name: table,
            rowCount: Number(countResult[0]?.count || 0),
            columns: Number(schemaResult[0]?.column_count || 0),
            hasGeometry: Boolean(schemaResult[0]?.has_geometry || false),
          });
        } catch (error) {
          console.error(`Error describing table ${table}:`, error);
          // Skip tables that cause errors
        }
      }
      
      return {
        tables: tableInfo,
        datasets: context.state.datasets,
      };
    }
  }

  formatResult(result: any): ToolResult {
    if (result.tableName) {
      // Single table description
      const geometryColumns = result.schema.filter((col: any) => 
        col.column_type === 'GEOMETRY'
      );
      
      let schemaDetails = '\n\nSchema:\n';
      result.schema.forEach((col: any) => {
        schemaDetails += `- ${col.column_name} (${col.column_type})${col.null === 'YES' ? ' [nullable]' : ''}\n`;
      });
      
      return {
        success: true,
        data: result,
        message: `Table "${result.tableName}" has ${result.rowCount.toLocaleString()} rows and ${result.schema.length} columns${
          geometryColumns.length > 0 ? ` (including ${geometryColumns.length} geometry column${geometryColumns.length > 1 ? 's' : ''})` : ''
        }.${schemaDetails}`,
      };
    } else {
      // All tables description
      const totalTables = result.tables.length;
      const spatialTables = result.tables.filter((t: any) => t.hasGeometry).length;
      
      let tableList = '\n\nAvailable tables:\n';
      result.tables.forEach((table: any) => {
        tableList += `- ${table.name}: ${table.rowCount.toLocaleString()} rows, ${table.columns} columns${table.hasGeometry ? ' (spatial data)' : ''}\n`;
      });
      
      // Add dataset info if available
      let datasetInfo = '';
      if (result.datasets && result.datasets.length > 0) {
        datasetInfo = '\n\nLoaded datasets:\n';
        result.datasets.forEach((dataset: any) => {
          datasetInfo += `- ${dataset.name} (${dataset.type})${dataset.geometryType ? ` - ${dataset.geometryType}` : ''}\n`;
        });
      }
      
      return {
        success: true,
        data: result,
        message: `Found ${totalTables} table${totalTables !== 1 ? 's' : ''} in the database${
          spatialTables > 0 ? ` (${spatialTables} with spatial data)` : ''
        }.${tableList}${datasetInfo}`,
      };
    }
  }
}
