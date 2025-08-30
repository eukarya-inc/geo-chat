import { tool } from 'ai';
import { z } from 'zod';
import { parse } from 'sqloflow';
import type { DBContext } from '../../duckdb/dbContext';
import { generateSQLExplanation } from '../sqlExplanationService';
import { formatSQL } from '../../../utils/sqlFormatter';
import { checkSQLType } from '../../../utils/sqlTypeChecker';
import { getTableInfo } from '../../../utils/tableInfoUtils';
import type { ColumnStatistics } from '../../../utils/tableInfoUtils';

export type Result = {
  error: string;
  suggestion?: string;
  sql: string;
} | {
  success: boolean;
  data: Record<string, unknown>[];
  rowCount: number;
  totalRowCount?: number;
  sql: string;
  sqlExplanation?: string;
  suggestions?: string[];
  createdTable?: string;
  tableSchema?: {name: string, type: string}[];
  sampleData?: Record<string, unknown>[];
  columnStatistics?: Record<string, ColumnStatistics>;
  hasGeometry?: boolean;
  geometryInfo?: {columnName: string, geometryType: string}[];
  limitApplied?: boolean;
  dataTruncated?: boolean;
  warning?: string;
};

export function createDuckDBTool(dbContext: DBContext, schema: string | null, apiKey?: string) {
  return tool({
    description,
    parameters: z.object({
      sql: z.string().describe('SQL query to execute'),
    }),
    execute: async ({ sql }): Promise<Result> => {
      try {
        // Check SQL statement type and multiple statements
        const sqlType = checkSQLType(sql);

        // Check for multiple statements
        if (sqlType.hasMultipleStatements) {
          return {
            error: 'Multiple SQL statements detected. Please execute one statement at a time.',
            suggestion: 'Split your SQL statements and execute them separately.',
            sql: sql
          };
        }

        // Try parsing SQL for CREATE TABLE statements to validate syntax.
        // Note: The external parser may not support all DuckDB constructs (e.g., OR REPLACE, complex functions).
        // If parsing fails, proceed to execution and let DuckDB validate instead of blocking with a parse error.
        if (sqlType.isCreateTable) {
          try {
            parse(sql);
          } catch (parseError) {
            console.warn('[DuckDB Tool] Skipping external SQL parse validation for CREATE TABLE:', parseError);
          }
        }

        // Add automatic LIMIT for SELECT queries to prevent huge results
        let executeSql = sql;
        const MAX_ROWS = 100; // Maximum rows to fetch from DB

        if (sqlType.isSelect && !sql.toUpperCase().includes('LIMIT')) {
          // Check if it's a simple SELECT or has complex structure
          const hasOrderBy = sql.toUpperCase().includes('ORDER BY');
          if (hasOrderBy) {
            // Insert LIMIT before the semicolon if present
            executeSql = sql.replace(/;?\s*$/, ` LIMIT ${MAX_ROWS};`);
          } else {
            // Append LIMIT at the end
            executeSql = sql.replace(/;?\s*$/, ` LIMIT ${MAX_ROWS};`);
          }
          console.log(`[DuckDB Tool] Auto-adding LIMIT ${MAX_ROWS} to prevent large result set`);
        }

        // Execute query - executeQuery now handles DDL operations automatically
        const result = await dbContext.executeQuery(executeSql, schema);
        // Data is already converted from Arrow format by executeQuery
        let data = result as Record<string, unknown>[];

        // Hard limit on data returned to AI to prevent token limit issues
        const AI_RETURN_LIMIT = 100; // Maximum rows to actually return to AI
        let truncated = false;
        const originalLength = data.length;

        if (data.length > AI_RETURN_LIMIT) {
          console.log(`[DuckDB Tool] Truncating result from ${data.length} to ${AI_RETURN_LIMIT} rows for AI response`);
          data = data.slice(0, AI_RETURN_LIMIT);
          truncated = true;
        }

          // Simple table refresh for DDL operations
          let sqlExplanation: string | undefined;
          let createdTableName: string | undefined;

          if (sqlType.isTableOperation) {
            // Checkpoint is already handled by executeQuery for DDL operations

            // Extract table name from CREATE TABLE statements
            if (sqlType.isCreateTable) {
              const tableNameMatch = sql.match(/CREATE\s+(OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.)?(\w+)/i);
              if (tableNameMatch) {
                createdTableName = tableNameMatch[2];

                // Format SQL for both explanation and storage
                const formattedSQL = formatSQL(sql);

                // Generate explanation for CREATE TABLE using formatted SQL
                if (apiKey) {
                  sqlExplanation = await generateSQLExplanation(formattedSQL, apiKey);
                }

                // Record the CREATE TABLE SQL in history with explanation
                if (dbContext) {
                  dbContext.getSQLHistory().recordCreateTable(createdTableName, formattedSQL, 'ai-chat', sqlExplanation, schema);
                }
              }
            }

            if (dbContext) {
              // Force consistency is already handled by executeQuery for DDL operations
              // Just notify table change with schema
              setTimeout(() => {
                dbContext.notifyTableChange(createdTableName, schema);
              }, 300);
            }
          }

          // Add metadata for large datasets
          const toolResult: Result = {
            success: true,
            data,
            rowCount: data.length,
            sql: sql
          };

          // Add warnings for truncated data
          if (truncated) {
            toolResult.dataTruncated = true;
            toolResult.totalRowCount = originalLength;
            toolResult.warning = `クエリ結果が${originalLength}行ありましたが、AIへの応答は${AI_RETURN_LIMIT}行に制限されました。すべてのデータが必要な場合は、CREATE TABLE AS SELECT文で新しいテーブルを作成してください。`;
          } else if (executeSql !== sql && data.length === MAX_ROWS) {
            toolResult.limitApplied = true;
            toolResult.warning = `クエリに自動的にLIMIT ${MAX_ROWS}が追加されました。より多くの行が存在する可能性があります。`;
          }

          // Add SQL explanation if available
          if (sqlExplanation) {
            toolResult.sqlExplanation = sqlExplanation;
          }

          // Add createdTable if a table was created
          if (createdTableName) {
            toolResult.createdTable = createdTableName;

            try {
              // Get comprehensive table information using the shared utility
              const tableInfo = await getTableInfo(dbContext, createdTableName, schema);
              
              // Merge tableInfo into toolResult (excluding tableName and suggestions which need special handling)
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { tableName, suggestions, ...tableInfoToMerge } = tableInfo;
              Object.assign(toolResult, tableInfoToMerge);
              
              // Merge suggestions
              if (!toolResult.suggestions) {
                toolResult.suggestions = [];
              }
              if (suggestions) {
                toolResult.suggestions.push(...suggestions);
              }

            } catch (schemaError) {
              console.error('Failed to get table schema:', schemaError);
              // Continue without schema info if there's an error
              if (!toolResult.suggestions) {
                toolResult.suggestions = [];
              }
              toolResult.suggestions.unshift(`テーブル「${createdTableName}」が作成されました。このテーブルのVega-Liteチャート設定はまだ作成されていません。グラフを作成するには update_vega_chart_spec_for_table ツールを使用してください。`);
            }
          }

          // Add suggestions for large datasets (only if not already added by table creation)
          if (!createdTableName) {
            if (data.length > 100) {
              if (!toolResult.suggestions) {
                toolResult.suggestions = [];
              }
              toolResult.suggestions.push(
                'データが多いです。特定の条件でフィルタしてみませんか？',
                'COUNT(), AVG(), SUM()などの集計関数を使ってデータを要約できます',
                'LIMIT句を使って必要な行数のみを取得できます',
                'GROUP BYを使ってカテゴリ別の集計ができます'
              );
            } else if (data.length > 20) {
              if (!toolResult.suggestions) {
                toolResult.suggestions = [];
              }
              toolResult.suggestions.push(
                'データをさらに絞り込みたい場合はWHERE句を使用してください',
                'ORDER BYでデータを並び替えられます',
                '集計関数でデータの概要を把握できます'
              );
            }
          }

          return toolResult;
      } catch (error) {
        let errorMessage = 'Unknown error occurred';

        if (error instanceof Error) {
          errorMessage = error.message;
        } else if (typeof error === 'object' && error !== null) {
          // Handle WebAssembly exceptions and other objects
          errorMessage = error.toString();
          if (errorMessage === '[object WebAssembly.Exception]') {
            errorMessage = 'WebAssembly execution error - this usually indicates invalid SQL syntax, missing tables, or inaccessible external resources';
          }
        } else {
          errorMessage = String(error);
        }

        return {
          error: errorMessage,
          sql: sql
        };
      }
    },
  });
}

const description = `
This tool allows you to execute SQL queries on a DuckDB database. Use it for data analysis, filtering, aggregation, and visualization of existing data.

MAP VISUALIZATION REQUIREMENTS:
- For a table to be displayed on a map, it MUST have a geometry column
- Without geometry, data cannot be shown on a map - only in tables/charts
- To add geometry to data without it:
  * Use ST_Point(longitude, latitude) to create point geometry from coordinate columns
  * Join with a table that has geometry
  * Example: CREATE TABLE with_geom AS SELECT *, ST_Point(lon, lat) as geom FROM your_table

IMPORTANT GUIDELINES:
- ALWAYS use existing tables in the database - check with SHOW TABLES first
- AVOID creating new tables unless absolutely necessary
- For analysis, use SELECT queries with GROUP BY, aggregation functions, and filtering
- External URLs may not be accessible - work with existing data instead

**WHEN CREATING TABLES**: After executing CREATE TABLE, ALWAYS explain in natural language:
- What data the table contains
- What transformations were applied
- How the table structure supports visualization
Example: "I created a table 'productivity_ranking' that calculates productivity per employee by dividing revenue by employee count. This pre-calculated metric makes it easy to create ranking visualizations."

COMMON PATTERNS:
- Analyze existing data: SELECT column, COUNT(*) FROM existing_table GROUP BY column
- Extract from JSON: SELECT properties->>'field_name' as field FROM table
- Filter by date: SELECT * FROM table WHERE properties->>'date_field' LIKE '2022%'
- Aggregate by region: SELECT properties->>'prefecture' as prefecture, COUNT(*) FROM table GROUP BY prefecture

# Example usage

\`\`\`sql
-- Analyze existing data instead of creating new tables
SELECT properties->>'都道府県名' as prefecture, COUNT(*) as accident_count
FROM uc16_01_uav_accident
WHERE properties->>'都道府県名' IS NOT NULL
GROUP BY properties->>'都道府県名'
ORDER BY accident_count DESC;
\`\`\`

# How to load geo data

ST_Read is a function that allows you to read and import a variety of geospatial file formats using the GDAL library.

The ST_Read table function is based on the GDAL translator library and enables reading spatial data from a variety of geospatial vector file formats as if they were DuckDB tables.

\`\`\`sql
-- Read a Shapefile
SELECT * FROM ST_Read('some/file/path/filename.shp');

- Read a GeoJSON file
CREATE TABLE my_geojson_table AS SELECT * FROM ST_Read('some/file/path/filename.json');
\`\`\

Note: CSV, JSON, JSONL, and Parquet files can be read without the ST_Read function. Just use FROM 'file/path/filename.csv' directly in your SQL query.
\`\`\`
SELECT * FROM 'some/file/path/filename.csv';
SELECT * FROM 'some/file/path/filename.json';
SELECT * FROM 'some/file/path/filename.jsonl';
SELECT * FROM 'some/file/path/filename.parquet';
\`\`\`
`;
