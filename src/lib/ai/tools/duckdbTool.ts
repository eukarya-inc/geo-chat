import { tool } from 'ai';
import { z } from 'zod';
import { parse } from 'sqloflow';
import type { DBContext } from '../../duckdb/dbContext';
import { generateSQLExplanation } from '../sqlExplanationService';
import { formatSQL } from '../../../utils/sqlFormatter';
import { checkSQLType } from '../../../utils/sqlTypeChecker';
import { getTableInfo } from '../../../utils/tableInfo';
import type { ColumnStatistics } from '../../../utils/tableInfo';
import { simplifyDataForAI } from '../../../utils/dataSimplifier';

export type Result =
    | {
          error: string;
          suggestion?: string;
          sql: string;
      }
    | {
          success: boolean;
          data: Record<string, unknown>[];
          rowCount: number;
          totalRowCount?: number;
          sql: string;
          sqlExplanation?: string;
          suggestions?: string[];
          createdTable?: string;
          tableSchema?: { name: string; type: string }[];
          sampleData?: Record<string, unknown>[];
          columnStatistics?: Record<string, ColumnStatistics>;
          hasGeometry?: boolean;
          geometryInfo?: { columnName: string; geometryType: string }[];
          limitApplied?: boolean;
          dataTruncated?: boolean;
          warning?: string;
      };

export function createDuckDBTool(
    dbContext: DBContext,
    schema: string | null,
    apiKey?: string,
    onChartDelete?: (tableName: string) => Promise<void>,
    onMapStyleDelete?: (tableName: string) => Promise<void>
) {
    return tool({
        description,
        inputSchema: z.object({
            sql: z.string().describe('SQL query to execute'),
            purpose: z
                .enum(['chart', 'map', 'both', 'analysis', 'none'])
                .optional()
                .describe(
                    'Purpose of the table being created: chart (for chart visualization), map (for map visualization), both (for both chart and map), analysis (for data analysis only), none (no specific visualization purpose)'
                ),
        }),
        execute: async ({ sql, purpose }): Promise<Result> => {
            try {
                // Check SQL statement type and multiple statements
                const sqlType = checkSQLType(sql);

                // Check for multiple statements
                if (sqlType.hasMultipleStatements) {
                    return {
                        error: 'Multiple SQL statements detected. Please execute one statement at a time.',
                        suggestion: 'Split your SQL statements and execute them separately.',
                        sql: sql,
                    };
                }

                // Try parsing SQL for CREATE TABLE statements to validate syntax.
                // Note: The external parser may not support all DuckDB constructs (e.g., OR REPLACE, complex functions).
                // If parsing fails, proceed to execution and let DuckDB validate instead of blocking with a parse error.
                if (sqlType.isCreateTable) {
                    try {
                        parse(sql);
                    } catch (parseError) {
                        console.warn(
                            '[DuckDB Tool] Skipping external SQL parse validation for CREATE TABLE:',
                            parseError
                        );
                    }
                }

                // For CREATE TABLE, get table list before execution to detect newly created table
                const tablesBefore: string[] = sqlType.isCreateTable
                    ? await (async () => {
                          try {
                              return await dbContext.getTables(schema);
                          } catch (err) {
                              console.warn('[DuckDB Tool] Failed to get tables before CREATE TABLE:', err);
                              return [];
                          }
                      })()
                    : [];

                // For DROP TABLE, get table list before execution to detect dropped table
                const tablesBeforeDrop: string[] = sqlType.isDropTable
                    ? await (async () => {
                          try {
                              return await dbContext.getTables(schema);
                          } catch (err) {
                              console.warn('[DuckDB Tool] Failed to get tables before DROP TABLE:', err);
                              return [];
                          }
                      })()
                    : [];

                // Execute query directly without auto-adding LIMIT
                // AI_RETURN_LIMIT will still truncate results for token cost control
                const executeSql = sql;

                // Execute query - executeQuery now handles DDL operations automatically
                const result = await dbContext.executeQuery(executeSql, schema);
                // Data is already converted from Arrow format by executeQuery
                let data = result as Record<string, unknown>[];

                // Hard limit on data returned to AI to prevent token limit issues
                const AI_RETURN_LIMIT = 5; // Maximum rows to actually return to AI
                let truncated = false;
                const originalLength = data.length;

                if (data.length > AI_RETURN_LIMIT) {
                    console.log(
                        `[DuckDB Tool] Truncating result from ${data.length} to ${AI_RETURN_LIMIT} rows for AI response`
                    );
                    data = data.slice(0, AI_RETURN_LIMIT);
                    truncated = true;
                }

                // Simplify data for AI consumption (replace blob/geometry with placeholders)
                // Only if we have data to simplify
                if (data.length > 0 && !sqlType.isTableOperation) {
                    try {
                        // For SELECT queries, get schema to properly simplify binary data
                        // Extract table name from SQL for DESCRIBE (basic implementation)
                        // This is a best-effort approach - complex queries may not extract table name correctly
                        const fromMatch = executeSql.match(/FROM\s+([^\s,;()]+)/i);
                        if (fromMatch && fromMatch[1]) {
                            const tableName = fromMatch[1].replace(/['"]/g, '');
                            const schemaData = await dbContext.executeQuery(`DESCRIBE ${tableName}`, schema);
                            data = simplifyDataForAI(
                                data,
                                schemaData as Array<{ column_name: string; column_type: string }>
                            );
                        }
                    } catch (schemaError) {
                        // If we can't get schema, continue without simplification
                        console.warn('[DuckDB Tool] Could not get schema for data simplification:', schemaError);
                    }
                }

                // Simple table refresh for DDL operations
                let sqlExplanation: string | undefined;
                let createdTableName: string | undefined;

                if (sqlType.isTableOperation) {
                    // Checkpoint is already handled by executeQuery for DDL operations

                    // Detect newly created table by comparing table lists
                    if (sqlType.isCreateTable) {
                        try {
                            const tablesAfter = await dbContext.getTables(schema);
                            const newTables = tablesAfter.filter(t => !tablesBefore.includes(t));

                            if (newTables.length > 0) {
                                // Take the first new table (there should only be one from a single CREATE TABLE)
                                createdTableName = newTables[0];
                                console.log(`[DuckDB Tool] Detected newly created table: ${createdTableName}`);
                            } else {
                                // For CREATE OR REPLACE TABLE, table already exists
                                // Try to extract table name from SQL
                                // Support both quoted and unquoted table names
                                // Quoted names (in double quotes) can contain any characters
                                // Unquoted names can contain ASCII letters, digits, underscores, and Unicode letters (including CJK)
                                const quotedTablePattern =
                                    /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"([^"]+)"/i;
                                const unquotedTablePattern =
                                    /CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\S+?)(?:\s+AS|\s*\()/i;

                                const quotedMatch = sql.match(quotedTablePattern);
                                const unquotedMatch = sql.match(unquotedTablePattern);
                                const match = quotedMatch || unquotedMatch;

                                if (match && match[1]) {
                                    createdTableName = match[1];
                                    console.log(
                                        `[DuckDB Tool] Detected CREATE OR REPLACE or IF NOT EXISTS table: ${createdTableName}`
                                    );
                                } else {
                                    console.warn('[DuckDB Tool] Could not extract table name from CREATE TABLE SQL');
                                }
                            }

                            if (createdTableName) {
                                // Format SQL for both explanation and storage
                                const formattedSQL = formatSQL(sql);

                                // Generate explanation for CREATE TABLE using formatted SQL
                                if (apiKey) {
                                    sqlExplanation = await generateSQLExplanation(formattedSQL, apiKey);
                                }

                                // Record the CREATE TABLE SQL in history with explanation
                                if (dbContext) {
                                    dbContext
                                        .getSQLHistory()
                                        .recordCreateTable(
                                            createdTableName,
                                            formattedSQL,
                                            'ai-chat',
                                            sqlExplanation,
                                            schema
                                        );
                                }
                            }
                        } catch (err) {
                            console.error('[DuckDB Tool] Failed to detect created table:', err);
                        }
                    }

                    // Detect dropped table by comparing table lists
                    if (sqlType.isDropTable) {
                        try {
                            const tablesAfterDrop = await dbContext.getTables(schema);
                            const droppedTables = tablesBeforeDrop.filter(t => !tablesAfterDrop.includes(t));

                            if (droppedTables.length > 0) {
                                // Take the first dropped table (there should only be one from a single DROP TABLE)
                                const droppedTableName = droppedTables[0];
                                console.log(`[DuckDB Tool] Detected dropped table: ${droppedTableName}`);

                                // Delete associated chart and map specs
                                if (onChartDelete) {
                                    try {
                                        await onChartDelete(droppedTableName);
                                        console.log(
                                            `[DuckDB Tool] Deleted chart spec for dropped table: ${droppedTableName}`
                                        );
                                    } catch (error) {
                                        console.error(
                                            `Failed to delete chart spec for table ${droppedTableName}:`,
                                            error
                                        );
                                    }
                                }

                                if (onMapStyleDelete) {
                                    try {
                                        await onMapStyleDelete(droppedTableName);
                                        console.log(
                                            `[DuckDB Tool] Deleted map style for dropped table: ${droppedTableName}`
                                        );
                                    } catch (error) {
                                        console.error(
                                            `Failed to delete map style for table ${droppedTableName}:`,
                                            error
                                        );
                                    }
                                }
                            } else {
                                console.warn('[DuckDB Tool] DROP TABLE executed but no dropped table detected');
                            }
                        } catch (err) {
                            console.error('[DuckDB Tool] Failed to detect dropped table:', err);
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
                    sql: sql,
                };

                // Add warnings for truncated data
                if (truncated) {
                    toolResult.dataTruncated = true;
                    toolResult.totalRowCount = originalLength;
                    toolResult.warning = `クエリ結果が${originalLength}行ありましたが、AIへの応答は${AI_RETURN_LIMIT}行に制限されました。すべてのデータが必要な場合は、CREATE TABLE AS SELECT文で新しいテーブルを作成してください。`;
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

                        // Validate based on purpose
                        if (purpose && purpose !== 'none' && purpose !== 'analysis') {
                            // Check for 0 records - drop table if empty
                            if (tableInfo.rowCount === 0) {
                                console.log(`[DuckDB Tool] Dropping table ${createdTableName} - 0 records found`);
                                try {
                                    await dbContext.dropTable(createdTableName, schema);
                                } catch (dropError) {
                                    console.error('Failed to drop table:', dropError);
                                }

                                return {
                                    error: `テーブル「${createdTableName}」は作成されましたが、レコードが0件でした。テーブルは削除されました。条件を見直してデータが取得できるようにしてください。`,
                                    suggestion:
                                        'Check your WHERE conditions, JOIN clauses, or source data to ensure records are returned. You may need to adjust filters or date ranges.',
                                    sql: sql,
                                };
                            }

                            // Check for geometry columns if purpose includes map
                            if ((purpose === 'map' || purpose === 'both') && !tableInfo.hasGeometry) {
                                // Drop the table since it doesn't meet requirements
                                console.log(
                                    `[DuckDB Tool] Dropping table ${createdTableName} - no geometry column found for map visualization`
                                );
                                try {
                                    await dbContext.dropTable(createdTableName, schema);
                                } catch (dropError) {
                                    console.error('Failed to drop table:', dropError);
                                }

                                return {
                                    error: `テーブル「${createdTableName}」は地図表示用に作成されましたが、ジオメトリカラムが含まれていません。テーブルは削除されました。ST_Point()やST_Read()を使用してジオメトリカラムを追加してください。`,
                                    suggestion:
                                        'For map visualization, ensure your table includes a geometry column. Example: CREATE TABLE with_geom AS SELECT *, ST_Point(longitude, latitude) as geometry FROM your_table',
                                    sql: sql,
                                };
                            }

                            // Check for single record warning
                            if (
                                (purpose === 'chart' || purpose === 'map' || purpose === 'both') &&
                                tableInfo.rowCount === 1
                            ) {
                                if (!toolResult.warning) {
                                    toolResult.warning = `⚠️ テーブル「${createdTableName}」には1件のレコードしかありません。可視化には複数のデータポイントが推奨されます。`;
                                }
                                if (!toolResult.suggestions) {
                                    toolResult.suggestions = [];
                                }
                                toolResult.suggestions.unshift(
                                    '単一レコードのため、グラフや地図での可視化効果が限定的です。',
                                    'より多くのデータを取得するか、集計条件を見直すことをお勧めします。'
                                );
                            }
                        }
                    } catch (schemaError) {
                        console.error('Failed to get table schema:', schemaError);
                        // Continue without schema info if there's an error
                        if (!toolResult.suggestions) {
                            toolResult.suggestions = [];
                        }
                        toolResult.suggestions.unshift(
                            `テーブル「${createdTableName}」が作成されました。このテーブルのVega-Liteチャート設定はまだ作成されていません。グラフを作成するには update_vega_chart_spec_for_table ツールを使用してください。`
                        );
                    }
                }

                // Add suggestions for large datasets (only if not already added by table creation)
                if (!createdTableName) {
                    if (originalLength > 100) {
                        if (!toolResult.suggestions) {
                            toolResult.suggestions = [];
                        }
                        toolResult.suggestions.push(
                            'データが多いです。特定の条件でフィルタしてみませんか？',
                            'COUNT(), AVG(), SUM()などの集計関数を使ってデータを要約できます',
                            'LIMIT句を使って必要な行数のみを取得できます',
                            'GROUP BYを使ってカテゴリ別の集計ができます'
                        );
                    } else if (originalLength > 20) {
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
                        errorMessage =
                            'WebAssembly execution error - this usually indicates invalid SQL syntax, missing tables, or inaccessible external resources';
                    }
                } else {
                    errorMessage = String(error);
                }

                return {
                    error: errorMessage,
                    sql: sql,
                };
            }
        },
    });
}

const description = `
This tool allows you to execute SQL queries on a DuckDB database. Use it for data analysis, filtering, aggregation, and visualization of existing data.

PURPOSE PARAMETER:
- **ONLY for CREATE TABLE statements**: ALWAYS specify the 'purpose' parameter when creating tables
  * 'chart': Table will be used for chart visualization only
  * 'map': Table will be used for map visualization (REQUIRES geometry column - table will be dropped if missing)
  * 'both': Table will be used for both chart and map (REQUIRES geometry column)
  * 'analysis': Table is for data analysis only, not for visualization
- **For ALL other queries (SELECT, UPDATE, etc.)**: Use 'none' or omit the parameter entirely

VALIDATION RULES (only apply to CREATE TABLE):
- If table has 0 records, it will be AUTOMATICALLY DROPPED
- If purpose is 'map' or 'both' and no geometry column exists, the table will be AUTOMATICALLY DROPPED
- If purpose is 'chart', 'map', or 'both' and only 1 record exists, a warning will be shown

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
