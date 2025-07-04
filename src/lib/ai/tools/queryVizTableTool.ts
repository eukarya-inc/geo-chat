import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

export const queryVizTableTool = tool({
  description: `Run SQL queries on visualization tables (_viz tables).
  
This tool is optimized for:
- Querying _viz tables with flattened columns
- Getting statistics and aggregations
- Filtering data for specific conditions
- Preparing data for visualization

Use this when you need to:
- Get counts by prefecture or other dimensions
- Filter data for specific years or conditions
- Analyze data before visualization`,

  parameters: z.object({
    sql: z.string().describe('SQL query to execute on _viz tables'),
    tableName: z.string().optional().describe('Optional hint about which table to use')
  }),

  execute: async ({ sql, tableName }) => {
    const { store } = await import('../../../store');
    const state = store.getState();
    const db = state.duckdb.connection as AsyncDuckDB;
    
    if (!db) {
      return { error: 'Database connection not available' };
    }
    
    const conn = await db.connect();
    
    try {
      // If tableName hint provided, check if _viz version exists
      if (tableName && !tableName.endsWith('_viz')) {
        const vizTableName = `${tableName}_viz`;
        const checkResult = await conn.query(`
          SELECT 1 FROM information_schema.tables 
          WHERE table_name = '${vizTableName}'
          LIMIT 1
        `);
        
        if (checkResult.numRows > 0) {
          // Replace table name in SQL with _viz version
          const updatedSql = sql.replace(new RegExp(`\\b${tableName}\\b`, 'g'), vizTableName);
          if (updatedSql !== sql) {
            console.log(`Automatically using ${vizTableName} instead of ${tableName}`);
            sql = updatedSql;
          }
        }
      }
      
      // Execute the query
      const result = await conn.query(sql);
      const data = result.toArray();
      
      // Get column information
      const columns = [];
      const numColumns = result.numCols;
      for (let i = 0; i < numColumns; i++) {
        const field = result.schema.fields[i];
        columns.push(field.name);
      }
      
      // Prepare response based on data size
      let response: any = {
        success: true,
        data,
        columns,
        rowCount: data.length,
        columnCount: columns.length
      };
      
      // Add helpful context based on query pattern
      if (sql.toLowerCase().includes('count(*)') && sql.toLowerCase().includes('group by')) {
        // This looks like an aggregation query
        response.message = `Found ${data.length} groups`;
        
        // Find the top and bottom entries if it's sorted
        if (sql.toLowerCase().includes('order by')) {
          const isDesc = sql.toLowerCase().includes('desc');
          response.insights = {
            highest: isDesc ? data[0] : data[data.length - 1],
            lowest: isDesc ? data[data.length - 1] : data[0]
          };
        }
      }
      
      // Suggest visualization if appropriate
      if (columns.some(col => ['都道府県名', 'prefecture', '県', 'region'].includes(col.toLowerCase()))) {
        response.suggestions = [
          'Use smart_layer to visualize this data on the map',
          'Use smart_chart to create a bar chart',
          'Use map_expression to color by values'
        ];
      }
      
      return response;
      
    } catch (error) {
      // Check if it's because the table doesn't exist
      const errorMsg = error instanceof Error ? error.message : String(error);
      
      if (errorMsg.includes('does not exist') && tableName) {
        return {
          error: errorMsg,
          suggestion: `Table not found. First create the _viz table using: create_viz_table with tableName="${tableName}"`,
          availableTables: await getAvailableTables(conn)
        };
      }
      
      return {
        error: `Query failed: ${errorMsg}`,
        sql,
        suggestion: 'Check your SQL syntax and table names'
      };
    } finally {
      await conn.close();
    }
  }
});

async function getAvailableTables(conn: any): Promise<string[]> {
  try {
    const result = await conn.query('SHOW TABLES');
    const tables: string[] = [];
    for (let i = 0; i < result.numRows; i++) {
      const name = result.getChildAt(0)?.get(i) || result.toArray()[i]?.name;
      if (name) tables.push(name);
    }
    return tables.filter(t => t.endsWith('_viz'));
  } catch {
    return [];
  }
}