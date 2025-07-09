import { z } from 'zod';
import { BaseTool, ToolContext, ToolResult } from './base';

export class ExecuteQueryTool extends BaseTool {
  name = 'executeQuery';
  description = 'Execute a SQL query on the loaded data using DuckDB';
  
  parameters = z.object({
    sql: z.string().describe('The SQL query to execute'),
    explain: z.boolean().optional().describe('Whether to explain the query results'),
  });

  async run(params: { sql: string; explain?: boolean }, context: ToolContext): Promise<any> {
    // Execute the query
    const results = await context.duckdb.executeQuery(params.sql);
    
    return {
      results,
      rowCount: results.length,
      sql: params.sql,
      explain: params.explain,
    };
  }

  formatResult(result: any): ToolResult {
    const { results, rowCount } = result;
    
    // Determine if results contain geometry
    const hasGeometry = results.length > 0 && 
      Object.keys(results[0]).some(key => 
        key.toLowerCase().includes('geom') || 
        key.toLowerCase().includes('geometry')
      );
    
    // Determine visualization type
    let visualization = undefined;
    if (hasGeometry) {
      visualization = {
        type: 'map' as const,
        config: {
          data: results,
          geometryColumn: Object.keys(results[0]).find(key => 
            key.toLowerCase().includes('geom') || 
            key.toLowerCase().includes('geometry')
          ),
        },
      };
    } else if (rowCount <= 100) {
      visualization = {
        type: 'table' as const,
        config: {
          data: results,
          columns: Object.keys(results[0] || {}),
        },
      };
    }
    
    return {
      success: true,
      data: results,
      message: `Query executed successfully. Returned ${rowCount} rows.`,
      visualization,
    };
  }
}
