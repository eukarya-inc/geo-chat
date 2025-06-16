import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

export function createDuckDBTool(db: AsyncDuckDB) {
  return tool({
    description,
    parameters: z.object({
      sql: z.string().describe('SQL query to execute'),
    }),
    execute: async ({ sql }) => {
      try {
        console.log('Executing SQL:', sql);
        const conn = await db.connect();
        try {
          const result = await conn.query(sql);
          
          // If this looks like a DDL statement (CREATE, DROP, ALTER), commit and checkpoint to ensure visibility
          const upperSql = sql.trim().toUpperCase();
          const containsDDL = upperSql.includes('CREATE ') || upperSql.includes('DROP ') || upperSql.includes('ALTER ');
          if (containsDDL) {
            try {
              await conn.query('COMMIT;');
              await conn.query('CHECKPOINT;');
              console.log('Committed and checkpointed DDL statement for cross-connection visibility');
            } catch (commitError) {
              console.warn('Failed to commit/checkpoint DDL statement:', commitError);
              // Continue anyway, as the statement might still have succeeded
            }
          }
          
          const data = result.toArray().map(row => {
            const obj = Object.fromEntries(row);
            // Convert BigInt values to strings for JSON serialization
            return Object.fromEntries(
              Object.entries(obj).map(([key, value]) => [
                key,
                typeof value === 'bigint' ? value.toString() : value
              ])
            );
          });
          console.log('Query result:', data);
          
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
          console.error('Error executing SQL:', error);
          return {
            error: error instanceof Error ? error.message : 'Unknown error occurred',
            sql: sql
          };
        } finally {
          await conn.close();
        }
      } catch (error) {
        console.error('Failed to connect to DuckDB:', error);
        return {
          error: error instanceof Error ? error.message : 'Failed to connect to DuckDB',
          sql: sql
        };
      }
    },
  });
}

const description = `
This tool allows you to execute SQL queries on a DuckDB database. You can use it to run any valid SQL command, such as SELECT, INSERT, UPDATE, DELETE, and more. The results will be returned in a structured format.
Make sure your SQL queries are valid and do not contain any harmful commands. The tool will return the results of your query or an error message if something goes wrong.

# Example usage

\`\`\`sql
SELECT * FROM my_table WHERE id = 1;
\`\`\`
You can also use it to create tables, insert data, and perform complex queries.

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
