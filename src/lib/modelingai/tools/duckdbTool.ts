import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../../../lib/duckdb/dbStateManager';
import { convertBigIntToString } from '../../../utils/bigIntSerializer';
import { generateSQLExplanation } from '../sqlExplanationService';
import { formatSQL } from '../../../utils/sqlFormatter';

export function createDuckDBTool(db: AsyncDuckDB, dbStateManager?: DBStateManager, apiKey?: string) {
  return tool({
    description,
    parameters: z.object({
      sql: z.string().describe('SQL query to execute'),
    }),
    execute: async ({ sql }) => {
      try {
        // Check for multiple SQL statements
        const trimmedSql = sql.trim();
        // Simple check for multiple statements - look for semicolons not in quotes
        const statementCount = trimmedSql.split(/;(?=(?:[^']*'[^']*')*[^']*$)/)
          .filter(s => s.trim().length > 0).length;
        
        if (statementCount > 1) {
          return {
            error: 'Multiple SQL statements detected. Please execute one statement at a time.',
            suggestion: 'Split your SQL statements and execute them separately.',
            sql: sql
          };
        }

        // Check if this is a DDL operation
        const upperSql = trimmedSql.toUpperCase();
        const isTableOperation = upperSql.includes('CREATE TABLE') ||
                                upperSql.includes('CREATE OR REPLACE TABLE') ||
                                upperSql.includes('DROP TABLE');

        // Use schema-aware connection if dbStateManager is available
        const conn = dbStateManager 
          ? await dbStateManager.connectWithSchema()
          : await db.connect();
        
        // Intercept SHOW TABLES to make it schema-aware
        let querySql = sql;
        if (dbStateManager && (upperSql.trim() === 'SHOW TABLES' || upperSql.trim() === 'SHOW TABLES;')) {
          const schemaName = dbStateManager.getCurrentSchema() || 'main';
          querySql = `
            SELECT table_name as name
            FROM information_schema.tables 
            WHERE table_schema = '${schemaName}'
              AND table_type = 'BASE TABLE'
            ORDER BY table_name
          `;
        }
        
        try {
          const result = await conn.query(querySql);

          // Convert BigInt values immediately after getting the result
          const data = convertBigIntToString(result.toArray()) as Record<string, unknown>[];

          // Simple table refresh for DDL operations
          let sqlExplanation: string | undefined;
          if (isTableOperation) {
            await conn.query('CHECKPOINT;');
            
            // Extract table name from CREATE TABLE statements
            let createdTableName: string | undefined;
            if (upperSql.includes('CREATE TABLE') || upperSql.includes('CREATE OR REPLACE TABLE')) {
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
                if (dbStateManager) {
                  dbStateManager.getSQLHistory().recordCreateTable(createdTableName, formattedSQL, 'ai-chat', sqlExplanation);
                }
              }
            }
            
            if (dbStateManager) {
              // Add more aggressive consistency checks for CREATE TABLE
              await conn.query('CHECKPOINT;');
              await conn.query('PRAGMA force_checkpoint;');
              
              // Increase timeout to ensure table is fully committed and visible
              setTimeout(() => {
                dbStateManager.notifyTableChange(createdTableName);
              }, 300);
            }
          }

          // Add metadata for large datasets
          const metadata: {
            success: boolean;
            data: Record<string, unknown>[];
            rowCount: number;
            sql: string;
            columns?: string[];
            columnCount?: number;
            suggestions?: string[];
            sqlExplanation?: string;
          } = {
            success: true,
            data,
            rowCount: data.length,
            sql: sql
          };
          
          // Add SQL explanation if available
          if (sqlExplanation) {
            metadata.sqlExplanation = sqlExplanation;
          }

          // Add column info for better understanding
          if (data.length > 0) {
            metadata.columns = Object.keys(data[0]);
            metadata.columnCount = metadata.columns.length;
          }

          // Add suggestions for large datasets
          if (data.length > 100) {
            metadata.suggestions = [
              'データが多いです。特定の条件でフィルタしてみませんか？',
              'COUNT(), AVG(), SUM()などの集計関数を使ってデータを要約できます',
              'LIMIT句を使って必要な行数のみを取得できます',
              'GROUP BYを使ってカテゴリ別の集計ができます'
            ];
          } else if (data.length > 20) {
            metadata.suggestions = [
              'データをさらに絞り込みたい場合はWHERE句を使用してください',
              'ORDER BYでデータを並び替えられます',
              '集計関数でデータの概要を把握できます'
            ];
          }

          return metadata;
        } finally {
          await conn.close();
        }
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
