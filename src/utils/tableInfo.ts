import type { DBContext } from '../lib/duckdb/dbContext';
import { analyzeTableGeometry, formatGeometryInfo } from '../lib/ai/tools/geometryDetector';
import type { GeometryInfo } from '../lib/ai/tools/geometryDetector';

export interface ColumnStatistics {
    // For numeric columns
    min?: number;
    max?: number;
    avg?: number;
    median?: number;
    p50?: number;
    p75?: number;
    p90?: number;
    p95?: number;
    stddev?: number;
    nullCount?: number;
    // For string columns
    minLength?: number;
    maxLength?: number;
    avgLength?: number;
    distinctCount?: number;
    // For datetime columns
    minDate?: string;
    maxDate?: string;
    // Common
    dataType: string;
}

export interface TableInfo {
    tableName: string;
    tableSchema?: Array<{ name: string; type: string }>;
    hasGeometry?: boolean;
    geometryInfo?: GeometryInfo[];
    sampleData?: Record<string, unknown>[];
    rowCount?: number;
    columnStatistics?: Record<string, ColumnStatistics>;
    suggestions?: string[];
    sampleDataTruncated?: boolean;
    totalNonGeometryColumns?: number;
}

/**
 * Check if a column type is numeric
 */
function isNumericType(type: string): boolean {
    const numericTypes = [
        'INTEGER',
        'BIGINT',
        'SMALLINT',
        'TINYINT',
        'HUGEINT',
        'FLOAT',
        'DOUBLE',
        'REAL',
        'DECIMAL',
        'NUMERIC',
        'INT',
        'INT2',
        'INT4',
        'INT8',
        'INT1',
    ];
    const upperType = type.toUpperCase();
    return numericTypes.some(t => upperType.includes(t));
}

/**
 * Check if a column type is datetime
 */
function isDateTimeType(type: string): boolean {
    const dateTimeTypes = ['DATE', 'TIME', 'TIMESTAMP', 'DATETIME'];
    const upperType = type.toUpperCase();
    return dateTimeTypes.some(t => upperType.includes(t));
}

/**
 * Check if a column type is string
 */
function isStringType(type: string): boolean {
    const stringTypes = ['VARCHAR', 'CHAR', 'TEXT', 'STRING', 'BLOB'];
    const upperType = type.toUpperCase();
    return stringTypes.some(t => upperType.includes(t));
}

/**
 * Check if a column type is a complex type that doesn't support aggregate functions
 */
function isComplexType(type: string): boolean {
    const complexTypes = ['STRUCT', 'LIST', 'MAP', 'ARRAY', 'JSON', 'UNION'];
    const upperType = type.toUpperCase();
    return complexTypes.some(t => upperType.includes(t));
}

/**
 * Get statistics for a single column
 */
async function getColumnStatistics(
    dbContext: DBContext,
    tableName: string,
    columnName: string,
    columnType: string,
    schema: string | null
): Promise<ColumnStatistics> {
    const stats: ColumnStatistics = { dataType: columnType };
    const tableRef = schema ? `${schema}.${tableName}` : tableName;

    // Skip statistics for complex types that don't support aggregate functions
    if (isComplexType(columnType)) {
        return stats;
    }

    try {
        // Get null count for all column types
        const nullQuery = `SELECT COUNT(*) FILTER (WHERE "${columnName}" IS NULL) as null_count FROM ${tableRef}`;
        const nullResult = await dbContext.executeQuery(nullQuery, schema);
        if (nullResult && Array.isArray(nullResult) && nullResult.length > 0) {
            const nullCount = (nullResult[0] as Record<string, number | null>).null_count;
            stats.nullCount = nullCount ?? undefined;
        }

        // Get distinct count for non-geometry and non-complex columns
        if (!columnType.toUpperCase().includes('GEOMETRY') && !isComplexType(columnType)) {
            const distinctQuery = `SELECT COUNT(DISTINCT "${columnName}") as distinct_count FROM ${tableRef}`;
            const distinctResult = await dbContext.executeQuery(distinctQuery, schema);
            if (distinctResult && Array.isArray(distinctResult) && distinctResult.length > 0) {
                const distinctCount = (distinctResult[0] as Record<string, number | null>).distinct_count;
                stats.distinctCount = distinctCount ?? undefined;
            }
        }

        if (isNumericType(columnType)) {
            // Get numeric statistics
            const statsQuery = `
        SELECT 
          MIN("${columnName}") as min_val,
          MAX("${columnName}") as max_val,
          AVG("${columnName}") as avg_val,
          MEDIAN("${columnName}") as median_val,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "${columnName}") as p50,
          PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY "${columnName}") as p75,
          PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY "${columnName}") as p90,
          PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY "${columnName}") as p95,
          STDDEV("${columnName}") as stddev_val
        FROM ${tableRef}
        WHERE "${columnName}" IS NOT NULL
      `;
            const result = await dbContext.executeQuery(statsQuery, schema);
            if (result && Array.isArray(result) && result.length > 0) {
                const row = result[0] as Record<string, number | null>;
                stats.min = row.min_val ?? undefined;
                stats.max = row.max_val ?? undefined;
                stats.avg = row.avg_val ?? undefined;
                stats.median = row.median_val ?? undefined;
                stats.p50 = row.p50 ?? undefined;
                stats.p75 = row.p75 ?? undefined;
                stats.p90 = row.p90 ?? undefined;
                stats.p95 = row.p95 ?? undefined;
                stats.stddev = row.stddev_val ?? undefined;
            }
        } else if (isDateTimeType(columnType)) {
            // Get datetime statistics
            const dateStatsQuery = `
        SELECT 
          MIN("${columnName}")::VARCHAR as min_date,
          MAX("${columnName}")::VARCHAR as max_date
        FROM ${tableRef}
        WHERE "${columnName}" IS NOT NULL
      `;
            const result = await dbContext.executeQuery(dateStatsQuery, schema);
            if (result && Array.isArray(result) && result.length > 0) {
                const row = result[0] as Record<string, string | null>;
                stats.minDate = row.min_date ?? undefined;
                stats.maxDate = row.max_date ?? undefined;
            }
        } else if (isStringType(columnType)) {
            // Get string statistics
            const stringStatsQuery = `
        SELECT 
          MIN(LENGTH("${columnName}")) as min_len,
          MAX(LENGTH("${columnName}")) as max_len,
          AVG(LENGTH("${columnName}")) as avg_len
        FROM ${tableRef}
        WHERE "${columnName}" IS NOT NULL
      `;
            const result = await dbContext.executeQuery(stringStatsQuery, schema);
            if (result && Array.isArray(result) && result.length > 0) {
                const row = result[0] as Record<string, number | null>;
                stats.minLength = row.min_len ?? undefined;
                stats.maxLength = row.max_len ?? undefined;
                stats.avgLength = row.avg_len ?? undefined;
            }
        }
    } catch (error) {
        console.warn(`Failed to get statistics for column ${columnName}:`, error);
    }

    return stats;
}

/**
 * Get comprehensive information about a table for AI context
 */
export async function getTableInfo(dbContext: DBContext, tableName: string, schema: string | null): Promise<TableInfo> {
    const info: TableInfo = {
        tableName,
    };

    try {
        // Get table schema
        const schemaQuery = schema ? `DESCRIBE ${schema}.${tableName}` : `DESCRIBE ${tableName}`;
        const schemaResult = await dbContext.executeQuery(schemaQuery, schema);
        const schemaData = schemaResult as Array<{ column_name: string; column_type: string }>;

        info.tableSchema = schemaData.map(row => ({
            name: row.column_name,
            type: row.column_type,
        }));

        // Analyze geometry columns
        const geometryAnalysis = await analyzeTableGeometry(dbContext, tableName, schema);
        info.hasGeometry = geometryAnalysis.hasGeometry;
        info.geometryInfo = geometryAnalysis.geometryInfo;

        // Get sample data (reduced to 3 rows to save context)
        // Limit columns to max 10 if table has many columns
        const columnsToSelect: string[] = [];
        for (const col of schemaData) {
            const upperType = col.column_type.toUpperCase();
            // Skip only geometry and blob types in sample data
            // STRUCT/LIST/ARRAY/JSON can be represented in JSON format
            if (!upperType.includes('GEOMETRY') && !upperType.includes('BLOB')) {
                columnsToSelect.push(`"${col.column_name}"`);
            }
        }

        // Limit to first 10 columns if there are too many (to save context)
        const MAX_SAMPLE_COLUMNS = 10;
        const limitedColumns = columnsToSelect.slice(0, MAX_SAMPLE_COLUMNS);
        const hasMoreColumns = columnsToSelect.length > MAX_SAMPLE_COLUMNS;

        if (limitedColumns.length > 0) {
            const sampleQuery = schema
                ? `SELECT ${limitedColumns.join(', ')} FROM ${schema}.${tableName} LIMIT 3`
                : `SELECT ${limitedColumns.join(', ')} FROM ${tableName} LIMIT 3`;
            const sampleResult = await dbContext.executeQuery(sampleQuery, schema);
            info.sampleData = sampleResult as Record<string, unknown>[];

            // Store info about truncated columns for later display
            if (hasMoreColumns) {
                info.sampleDataTruncated = true;
                info.totalNonGeometryColumns = columnsToSelect.length;
            }
        } else {
            // If all columns are geometry/blob, don't include sample data
            info.sampleData = [];
        }

        // Get row count
        const countQuery = schema
            ? `SELECT COUNT(*) as count FROM ${schema}.${tableName}`
            : `SELECT COUNT(*) as count FROM ${tableName}`;
        const countResult = await dbContext.executeQuery(countQuery, schema);
        const countData = countResult as Array<{ count: number }>;
        if (countData.length > 0) {
            info.rowCount = countData[0].count;
        }

        // Get column statistics (but don't fail if statistics collection fails)
        // For tables with many columns (>30), limit statistics collection to save context
        const STATS_COLUMN_THRESHOLD = 30;
        const shouldLimitStats = schemaData.length > STATS_COLUMN_THRESHOLD;

        try {
            info.columnStatistics = {};

            if (shouldLimitStats) {
                // For large tables, collect minimal statistics (just data type and distinct count for key columns)
                const MAX_STATS_COLUMNS = 15;
                let statsCount = 0;

                for (const column of schemaData) {
                    // Always include data type
                    info.columnStatistics[column.column_name] = { dataType: column.column_type };

                    // Only collect detailed stats for first few non-geometry, non-complex columns
                    if (
                        statsCount < MAX_STATS_COLUMNS &&
                        !column.column_type.toUpperCase().includes('GEOMETRY') &&
                        !isComplexType(column.column_type)
                    ) {
                        try {
                            const stats = await getColumnStatistics(
                                dbContext,
                                tableName,
                                column.column_name,
                                column.column_type,
                                schema
                            );
                            info.columnStatistics[column.column_name] = stats;
                            statsCount++;
                        } catch (colError) {
                            console.warn(`Failed to get statistics for column ${column.column_name}:`, colError);
                        }
                    }
                }
            } else {
                // For smaller tables, collect full statistics as before
                for (const column of schemaData) {
                    // Skip geometry and complex columns for statistics
                    if (!column.column_type.toUpperCase().includes('GEOMETRY') && !isComplexType(column.column_type)) {
                        try {
                            const stats = await getColumnStatistics(
                                dbContext,
                                tableName,
                                column.column_name,
                                column.column_type,
                                schema
                            );
                            info.columnStatistics[column.column_name] = stats;
                        } catch (colError) {
                            console.warn(`Failed to get statistics for column ${column.column_name}:`, colError);
                            // Set basic statistics with just the data type
                            info.columnStatistics[column.column_name] = { dataType: column.column_type };
                        }
                    } else {
                        // For geometry and complex types, just store the data type
                        info.columnStatistics[column.column_name] = { dataType: column.column_type };
                    }
                }
            }
        } catch (statsError) {
            console.warn('Failed to get column statistics:', statsError);
            // Continue without statistics
        }

        // Add suggestions based on geometry presence
        // Limit to max 5 suggestions to save context
        info.suggestions = [];
        const MAX_SUGGESTIONS = 5;

        if (info.hasGeometry && info.geometryInfo) {
            const geometryInfoStr = formatGeometryInfo(info.geometryInfo);
            info.suggestions.push(
                `テーブル「${tableName}」が作成されました。ジオメトリカラムが検出されました: ${geometryInfoStr}`,
                `地図スタイルを設定するには update_map_style_for_table ツールを使用してください。`
            );
        } else {
            info.suggestions.push(
                `テーブル「${tableName}」が作成されました。グラフ作成は update_vega_chart_spec_for_table ツールを使用してください。`
            );
        }

        // Add visualization suggestions based on column statistics (limited to save context)
        if (info.columnStatistics && info.suggestions.length < MAX_SUGGESTIONS) {
            const numericColumns = Object.entries(info.columnStatistics)
                .filter(([, stats]) => stats.min !== undefined && stats.max !== undefined)
                .map(([name, stats]) => ({ name, stats }));

            const categoricalColumns = Object.entries(info.columnStatistics)
                .filter(([, stats]) => stats.distinctCount !== undefined && stats.distinctCount < 20)
                .map(([name, stats]) => ({ name, stats }));

            // Only add 1-2 most important suggestions to stay within limit
            const remainingSlots = MAX_SUGGESTIONS - info.suggestions.length;

            if (remainingSlots > 0 && numericColumns.length > 0) {
                const firstNumeric = numericColumns[0];
                info.suggestions.push(
                    `「${firstNumeric.name}」は数値データ（${firstNumeric.stats.min?.toFixed(0)}-${firstNumeric.stats.max?.toFixed(0)}）です。`
                );
            }

            if (remainingSlots > 1 && categoricalColumns.length > 0) {
                const firstCategorical = categoricalColumns[0];
                info.suggestions.push(
                    `「${firstCategorical.name}」はカテゴリカルデータ（${firstCategorical.stats.distinctCount}個）です。`
                );
            }
        }

        // Trim suggestions to max limit
        if (info.suggestions.length > MAX_SUGGESTIONS) {
            info.suggestions = info.suggestions.slice(0, MAX_SUGGESTIONS);
        }
    } catch (error) {
        console.error('Failed to get table info:', error);
        // Return minimal info if there's an error
        info.suggestions = [`テーブル「${tableName}」が作成されました。`];
    }

    return info;
}

/**
 * Format column statistics for display
 */
function formatColumnStatistics(stats: ColumnStatistics): string {
    const parts: string[] = [];

    try {
        if (isNumericType(stats.dataType)) {
            if (stats.min !== undefined && stats.min !== null && stats.max !== undefined && stats.max !== null) {
                parts.push(`range: [${stats.min}, ${stats.max}]`);
            }
            if (stats.avg !== undefined && stats.avg !== null) {
                parts.push(`avg: ${typeof stats.avg === 'number' ? stats.avg.toFixed(2) : stats.avg}`);
            }
            if (stats.median !== undefined && stats.median !== null) {
                parts.push(`median: ${stats.median}`);
            }
            if (stats.p75 !== undefined && stats.p75 !== null) {
                parts.push(`p75: ${stats.p75}`);
            }
            if (stats.p90 !== undefined && stats.p90 !== null) {
                parts.push(`p90: ${stats.p90}`);
            }
            if (stats.p95 !== undefined && stats.p95 !== null) {
                parts.push(`p95: ${stats.p95}`);
            }
            if (stats.stddev !== undefined && stats.stddev !== null) {
                parts.push(`stddev: ${typeof stats.stddev === 'number' ? stats.stddev.toFixed(2) : stats.stddev}`);
            }
        } else if (isDateTimeType(stats.dataType)) {
            if (stats.minDate && stats.maxDate) {
                parts.push(`range: [${stats.minDate}, ${stats.maxDate}]`);
            }
        } else if (isStringType(stats.dataType)) {
            if (
                stats.minLength !== undefined &&
                stats.minLength !== null &&
                stats.maxLength !== undefined &&
                stats.maxLength !== null
            ) {
                parts.push(`length: [${stats.minLength}, ${stats.maxLength}]`);
            }
            if (stats.avgLength !== undefined && stats.avgLength !== null) {
                parts.push(
                    `avg_length: ${typeof stats.avgLength === 'number' ? stats.avgLength.toFixed(1) : stats.avgLength}`
                );
            }
        }

        if (stats.distinctCount !== undefined && stats.distinctCount !== null) {
            parts.push(`distinct: ${stats.distinctCount}`);
        }
        if (stats.nullCount !== undefined && stats.nullCount !== null && stats.nullCount > 0) {
            parts.push(`nulls: ${stats.nullCount}`);
        }
    } catch (error) {
        console.warn('Error formatting column statistics:', error);
    }

    return parts.join(', ');
}

/**
 * Format table info for AI context (not for UI rendering)
 */
export function formatTableInfoForAI(info: TableInfo): string {
    const parts: string[] = [];

    parts.push(`Table: ${info.tableName}`);

    if (info.rowCount !== undefined) {
        const columnCount = info.tableSchema?.length || 0;
        parts.push(`Size: ${info.rowCount} rows × ${columnCount} columns`);
    }

    if (info.tableSchema) {
        parts.push('Schema with statistics:');
        info.tableSchema.forEach(col => {
            let line = `  - ${col.name}: ${col.type}`;
            if (info.columnStatistics && info.columnStatistics[col.name]) {
                const statsStr = formatColumnStatistics(info.columnStatistics[col.name]);
                if (statsStr) {
                    line += ` (${statsStr})`;
                }
            }
            parts.push(line);
        });
    }

    if (info.hasGeometry && info.geometryInfo) {
        parts.push(`Geometry: ${formatGeometryInfo(info.geometryInfo)}`);
    }

    if (info.sampleData && info.sampleData.length > 0) {
        // Check if we excluded any columns from sample data
        const hasExcludedColumns = info.tableSchema?.some(col => {
            const upperType = col.type.toUpperCase();
            return upperType.includes('GEOMETRY') || upperType.includes('BLOB');
        });

        const sampleDataTruncated = info.sampleDataTruncated;
        const totalNonGeometryColumns = info.totalNonGeometryColumns;

        let sampleLabel = 'Sample data (first 3 rows';
        if (hasExcludedColumns) {
            sampleLabel += ', excluding GEOMETRY/BLOB';
        }
        if (sampleDataTruncated) {
            sampleLabel += `, showing ${Object.keys(info.sampleData[0] || {}).length} of ${totalNonGeometryColumns} columns`;
        }
        sampleLabel += '):';

        parts.push(sampleLabel);
        parts.push(JSON.stringify(info.sampleData, null, 2));
    }

    if (info.suggestions && info.suggestions.length > 0) {
        parts.push('Suggestions:');
        info.suggestions.forEach(s => parts.push(`  - ${s}`));
    }

    return parts.join('\n');
}
