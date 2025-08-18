import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../duckdb/dbContext';
import { convertBigIntToString } from '../../../utils/bigIntSerializer';

export function createDataAnalysisTool(dbContext: DBContext) {
  return tool({
    description: `Analyze table structure and data to understand available properties for map styling.
    
This tool helps you understand what columns and data are available in tables for creating conditional map styles.
Use this tool before applying complex styling to understand the data structure and value ranges.

Capabilities:
- List all columns in a table with their data types
- Get sample values and statistics for numeric columns
- Identify unique values for categorical columns
- Get value ranges for continuous variables`,

    parameters: z.object({
      action: z.enum(['describe_table', 'analyze_column', 'get_sample_data'])
        .describe('Type of analysis to perform'),
      table_name: z.string()
        .describe('Name of the table to analyze'),
      column_name: z.string().optional()
        .describe('Specific column to analyze (for analyze_column action)'),
      limit: z.number().optional().default(10)
        .describe('Number of sample rows to return (for get_sample_data)')
    }),

    execute: async ({ action, table_name, column_name, limit }) => {
      try {
        const conn = await dbContext.connect();
        
        try {
          switch (action) {
            case 'describe_table': {
              // Get table schema
              const schemaResult = await conn.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = '${table_name}'
                ORDER BY ordinal_position
              `);
              
              const columns = convertBigIntToString(schemaResult.toArray()) as Array<{
                column_name: string;
                data_type: string;
                is_nullable: string;
              }>;
              
              // Get row count
              const countResult = await conn.query(`SELECT COUNT(*) as total_rows FROM "${table_name}"`);
              const countArray = convertBigIntToString(countResult.toArray()) as Array<{
                total_rows: string | number;
              }>;
              const totalRows = countArray[0].total_rows;
              
              return {
                success: true,
                table_name,
                total_rows: totalRows,
                columns: columns.map(col => ({
                  name: col.column_name,
                  type: col.data_type,
                  nullable: col.is_nullable === 'YES'
                })),
                message: `Table "${table_name}" has ${columns.length} columns and ${totalRows} rows`
              };
            }

            case 'analyze_column': {
              if (!column_name) {
                return { success: false, error: 'column_name is required for analyze_column action' };
              }

              // Get column data type first
              const typeResult = await conn.query(`
                SELECT data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table_name}' AND column_name = '${column_name}'
              `);
              
              const columnTypeResult = convertBigIntToString(typeResult.toArray()) as Array<{
                data_type: string;
              }>;
              const columnType = columnTypeResult[0]?.data_type;
              if (!columnType) {
                return { success: false, error: `Column "${column_name}" not found in table "${table_name}"` };
              }

              let analysis: Record<string, unknown> = {
                column_name,
                data_type: columnType
              };

              // For numeric columns, get statistics
              if (columnType.includes('INTEGER') || columnType.includes('DOUBLE') || columnType.includes('DECIMAL') || columnType.includes('FLOAT')) {
                const statsResult = await conn.query(`
                  SELECT 
                    MIN("${column_name}") as min_value,
                    MAX("${column_name}") as max_value,
                    AVG("${column_name}") as avg_value,
                    COUNT(DISTINCT "${column_name}") as unique_values,
                    COUNT(*) as total_values,
                    COUNT(*) - COUNT("${column_name}") as null_values
                  FROM "${table_name}"
                `);
                
                const stats = (convertBigIntToString(statsResult.toArray()) as Array<Record<string, unknown>>)[0];
                analysis = { ...analysis, ...stats };
              } else {
                // For text/categorical columns, get unique values
                const uniqueResult = await conn.query(`
                  SELECT 
                    "${column_name}" as value,
                    COUNT(*) as count
                  FROM "${table_name}"
                  WHERE "${column_name}" IS NOT NULL
                  GROUP BY "${column_name}"
                  ORDER BY count DESC
                  LIMIT 20
                `);
                
                const uniqueValues = (convertBigIntToString(uniqueResult.toArray()) as Array<{
                  value: unknown;
                  count: string | number;
                }>).map(row => ({
                  value: row.value,
                  count: row.count
                }));
                analysis.unique_values = uniqueValues;
                analysis.total_unique = uniqueValues.length;
              }

              return {
                success: true,
                analysis,
                message: `Analysis complete for column "${column_name}"`
              };
            }

            case 'get_sample_data': {
              const sampleResult = await conn.query(`
                SELECT * FROM "${table_name}" 
                LIMIT ${limit}
              `);
              
              const sampleData = convertBigIntToString(sampleResult.toArray()) as Array<Record<string, unknown>>;
              
              return {
                success: true,
                table_name,
                sample_data: sampleData,
                message: `Retrieved ${sampleData.length} sample rows from "${table_name}"`
              };
            }

            default:
              return { success: false, error: `Unknown action: ${action}` };
          }
        } finally {
          await conn.close();
        }
      } catch (error) {
        return {
          success: false,
          error: `Error analyzing data: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}