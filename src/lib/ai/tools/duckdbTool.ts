import { tool } from 'ai';
import { z } from 'zod';
import type { DBContext } from '../../../lib/duckdb/dbContext';

export function createDuckDBTool(dbContext: DBContext) {
  return tool({
    description,
    parameters: z.object({
      sql: z.string().describe('SQL query to execute'),
    }),
    execute: async ({ sql }) => {
      try {
        // Check if this is a DDL operation
        const upperSql = sql.trim().toUpperCase();
        const isTableOperation = upperSql.includes('CREATE TABLE') ||
                                upperSql.includes('CREATE OR REPLACE TABLE') ||
                                upperSql.includes('DROP TABLE');

        // Use executeQuery which handles connections internally
        // Data is already converted from Arrow format by executeQuery
        const data = await dbContext.executeQuery(sql, null) as Record<string, unknown>[];

          // Simple table refresh for DDL operations
          if (isTableOperation && dbContext) {
            console.log('DuckDBTool: Table operation detected, triggering refresh');
            setTimeout(() => {
              dbContext.notifyTableChange();
            }, 100);
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
          } = {
            success: true,
            data,
            rowCount: data.length,
            sql: sql
          };

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
