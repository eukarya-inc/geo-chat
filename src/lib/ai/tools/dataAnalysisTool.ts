import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { DataAnalyzer } from '../../../utils/dataAnalyzer';
import { store } from '../../../store';
import { getBestTableForViz } from './vizAwareTool';

export function createDataAnalysisTool(db: AsyncDuckDB) {
  return tool({
    description: `Analyze table structure and data with intelligent pattern detection and visualization suggestions.
    
This tool provides comprehensive data analysis including:
- Automatic field type detection (coordinates, time, categories, measures)
- Pattern recognition (spatial clusters, time series, distributions)
- Smart visualization suggestions based on data characteristics
- Data quality assessment and insights

Actions:
- describe_table: Get table schema and basic info
- analyze_column: Deep dive into a specific column
- get_sample_data: Retrieve sample rows
- full_analysis: Comprehensive analysis with field detection and suggestions
- detect_patterns: Find patterns like time series or geographic clusters`,

    parameters: z.object({
      action: z.enum(['describe_table', 'analyze_column', 'get_sample_data', 'full_analysis', 'detect_patterns'])
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
        const conn = await db.connect();
        
        try {
          switch (action) {
            case 'describe_table': {
              // Check for visualization table
              const { tableName: bestTable, isVizTable } = await getBestTableForViz(db, table_name);
              
              // Get table schema
              const schemaResult = await conn.query(`
                SELECT column_name, data_type, is_nullable
                FROM information_schema.columns 
                WHERE table_name = '${bestTable}'
                ORDER BY ordinal_position
              `);
              
              const columns = schemaResult.toArray();
              
              // Get row count
              const countResult = await conn.query(`SELECT COUNT(*) as total_rows FROM "${table_name}"`);
              const countArray = countResult.toArray();
              const totalRows = typeof countArray[0].total_rows === 'bigint' 
                ? countArray[0].total_rows.toString() 
                : countArray[0].total_rows;
              
              return {
                success: true,
                table_name: bestTable,
                original_table: table_name !== bestTable ? table_name : undefined,
                is_viz_table: isVizTable,
                total_rows: totalRows,
                columns: columns.map(col => ({
                  name: col.column_name,
                  type: col.data_type,
                  nullable: col.is_nullable === 'YES'
                })),
                message: `Table "${bestTable}" has ${columns.length} columns and ${totalRows} rows${isVizTable ? ' (using visualization-optimized table)' : ''}`,
                tip: isVizTable ? 'This is a visualization table with flattened properties - you can query columns directly without JSON extraction' : undefined
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
              
              const columnType = typeResult.toArray()[0]?.data_type;
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
                
                const stats = statsResult.toArray()[0];
                // Convert BigInt values to strings for JSON serialization
                const convertedStats = Object.fromEntries(
                  Object.entries(stats).map(([key, value]) => [
                    key,
                    typeof value === 'bigint' ? value.toString() : value
                  ])
                );
                analysis = { ...analysis, ...convertedStats };
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
                
                const uniqueValues = uniqueResult.toArray().map(row => ({
                  value: row.value,
                  count: typeof row.count === 'bigint' ? row.count.toString() : row.count
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
              // Use visualization table if available
              const { tableName: bestTable, isVizTable } = await getBestTableForViz(db, table_name);
              
              const sampleResult = await conn.query(`
                SELECT * FROM "${bestTable}" 
                LIMIT ${limit}
              `);
              
              const sampleData = sampleResult.toArray();
              
              return {
                success: true,
                table_name,
                sample_data: sampleData,
                message: `Retrieved ${sampleData.length} sample rows from "${table_name}"`
              };
            }

            case 'full_analysis': {
              // Get the dataset from Redux store
              const state = store.getState();
              const dataset = state.layers.datasets.find(d => d.id === table_name);
              
              if (!dataset) {
                // Fetch data if not in store
                const dataResult = await conn.query(`SELECT * FROM "${table_name}" LIMIT 5000`);
                const allData = dataResult.toArray();
                
                // Get schema for fields
                const schemaResult = await conn.query(`
                  SELECT column_name, data_type 
                  FROM information_schema.columns 
                  WHERE table_name = '${table_name}'
                  ORDER BY ordinal_position
                `);
                
                const fields = schemaResult.toArray().map(col => ({
                  name: col.column_name,
                  type: col.data_type.toLowerCase().includes('int') ? 'integer' as const :
                        col.data_type.toLowerCase().includes('float') || col.data_type.toLowerCase().includes('double') ? 'real' as const :
                        col.data_type.toLowerCase().includes('bool') ? 'boolean' as const :
                        col.data_type.toLowerCase().includes('date') ? 'date' as const :
                        col.data_type.toLowerCase().includes('time') ? 'timestamp' as const :
                        'string' as const,
                  format: col.data_type
                }));
                
                const tempDataset = {
                  id: table_name,
                  label: table_name,
                  color: [255, 0, 0] as [number, number, number],
                  allData,
                  fields
                };
                
                const analysis = DataAnalyzer.analyzeDataset(tempDataset);
                
                return {
                  success: true,
                  table_name,
                  analysis: {
                    summary: analysis.summary,
                    insights: analysis.insights,
                    suggestions: analysis.suggestions.slice(0, 3), // Top 3 suggestions
                    analyzedFields: {
                      geospatial: {
                        hasCoordinates: analysis.analyzedFields.geospatial.fieldPairs.length > 0,
                        hasGeometry: (analysis.analyzedFields.geospatial.geometry?.length || 0) > 0,
                        coordinateFields: analysis.analyzedFields.geospatial.fieldPairs.map(p => 
                          ({ lat: p.lat.name, lng: p.lng.name })
                        )
                      },
                      temporal: analysis.analyzedFields.temporal.map(f => f.name),
                      numeric: analysis.analyzedFields.numeric.map(f => f.name),
                      categorical: analysis.analyzedFields.categorical.map(f => f.name)
                    }
                  },
                  message: 'Comprehensive analysis complete. Found ' + 
                    (analysis.analyzedFields.geospatial.fieldPairs.length > 0 ? 'geospatial data suitable for mapping. ' : '') +
                    (analysis.suggestions.length > 0 ? `${analysis.suggestions.length} visualization suggestions available.` : '')
                };
              }
              
              const analysis = DataAnalyzer.analyzeDataset(dataset);
              
              return {
                success: true,
                table_name,
                analysis: {
                  summary: analysis.summary,
                  insights: analysis.insights,
                  suggestions: analysis.suggestions.slice(0, 3),
                  analyzedFields: {
                    geospatial: {
                      hasCoordinates: analysis.analyzedFields.geospatial.fieldPairs.length > 0,
                      hasGeometry: (analysis.analyzedFields.geospatial.geometry?.length || 0) > 0,
                      coordinateFields: analysis.analyzedFields.geospatial.fieldPairs.map(p => 
                        ({ lat: p.lat.name, lng: p.lng.name })
                      )
                    },
                    temporal: analysis.analyzedFields.temporal.map(f => f.name),
                    numeric: analysis.analyzedFields.numeric.map(f => f.name),
                    categorical: analysis.analyzedFields.categorical.map(f => f.name)
                  }
                },
                message: 'Comprehensive analysis complete'
              };
            }

            case 'detect_patterns': {
              // Get sample data for pattern detection
              const sampleResult = await conn.query(`SELECT * FROM "${table_name}" LIMIT 1000`);
              const sampleData = sampleResult.toArray();
              
              // Get schema
              const schemaResult = await conn.query(`
                SELECT column_name, data_type 
                FROM information_schema.columns 
                WHERE table_name = '${table_name}'
              `);
              
              const fields = schemaResult.toArray().map(col => ({
                name: col.column_name,
                type: 'string' as const,
                format: col.data_type
              }));
              
              // Simple pattern detection
              const patterns = [];
              
              // Check for time series
              const timeColumns = fields.filter(f => 
                f.name.toLowerCase().includes('date') || 
                f.name.toLowerCase().includes('time') ||
                f.format.toLowerCase().includes('timestamp')
              );
              
              if (timeColumns.length > 0) {
                patterns.push({
                  type: 'time_series',
                  description: 'Temporal data detected - suitable for time-based analysis',
                  fields: timeColumns.map(f => f.name)
                });
              }
              
              // Check for geographic patterns
              const latColumns = fields.filter(f => 
                ['lat', 'latitude', 'y'].includes(f.name.toLowerCase())
              );
              const lngColumns = fields.filter(f => 
                ['lng', 'lon', 'longitude', 'x'].includes(f.name.toLowerCase())
              );
              
              if (latColumns.length > 0 && lngColumns.length > 0) {
                patterns.push({
                  type: 'geospatial',
                  description: 'Geographic coordinates detected - can be visualized on a map',
                  fields: [latColumns[0].name, lngColumns[0].name]
                });
              }
              
              return {
                success: true,
                table_name,
                patterns,
                message: `Detected ${patterns.length} data patterns in table "${table_name}"`
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