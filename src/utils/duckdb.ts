import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { Table as ArrowTable, tableFromArrays } from 'apache-arrow';
import { convertArrowToJS } from './arrowConverter';

export interface TableColumn {
    name: string;
    type: string;
}

export interface TableDataResult {
    columns: TableColumn[];
    arrowTable: ArrowTable;
    totalRows: number;
    rawData?: Map<string, unknown>[]; // Keep raw data for efficient binary access
}

export interface TableWindowResult {
    arrowTable: ArrowTable;
    rawData: Map<string, unknown>[]; // Keep raw data for efficient binary access
}

/**
 * Convert special values (BigInt, BLOB, Date) to display-friendly formats
 */
function convertSpecialValues(value: unknown, columnType?: string): unknown {
    // Convert BigInt to string to avoid type issues
    if (typeof value === 'bigint') {
        return value.toString();
    }

    // Handle Date/Timestamp values
    // DuckDB may return timestamps as Date objects or as numbers (milliseconds since epoch)
    let dateValue: Date | null = null;

    if (value instanceof Date) {
        dateValue = value;
    } else if (typeof value === 'number' && columnType) {
        // Check if this is a timestamp column
        const upperType = columnType.toUpperCase();
        if (upperType.includes('TIMESTAMP') || upperType.includes('DATETIME') || upperType === 'DATE') {
            // DuckDB returns timestamps as milliseconds since epoch
            dateValue = new Date(value);

            // Validate that the date is reasonable (between 1900 and 2100)
            const year = dateValue.getFullYear();
            if (year < 1900 || year > 2100) {
                // Might be in seconds instead of milliseconds
                dateValue = new Date(value * 1000);
                // Check again
                const newYear = dateValue.getFullYear();
                if (newYear < 1900 || newYear > 2100) {
                    // Not a valid date, return as-is
                    return value;
                }
            }
        }
    }

    if (dateValue && !isNaN(dateValue.getTime())) {
        // Format as YYYY-MM-DD HH:mm:ss
        const year = dateValue.getFullYear();
        const month = String(dateValue.getMonth() + 1).padStart(2, '0');
        const day = String(dateValue.getDate()).padStart(2, '0');
        const hours = String(dateValue.getHours()).padStart(2, '0');
        const minutes = String(dateValue.getMinutes()).padStart(2, '0');
        const seconds = String(dateValue.getSeconds()).padStart(2, '0');

        // Check if it's just a date (time is 00:00:00) or includes time
        if (hours === '00' && minutes === '00' && seconds === '00') {
            // Check column type to determine if we should show time
            if (columnType && columnType.toUpperCase() === 'DATE') {
                return `${year}-${month}-${day}`;
            }
        }

        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    // Return BLOB data as-is for further processing in the view layer
    // The view layer will decide how to format it for display

    return value;
}

/**
 * Build column names string for SQL queries
 * Converts GEOMETRY columns to WKB format for proper parsing
 */
function buildColumnNamesString(columns: TableColumn[]): string {
    return columns
        .map(col => {
            // Convert GEOMETRY columns to standard WKB format
            if (isGeometryColumn(col.type)) {
                return `ST_AsWKB("${col.name}") as "${col.name}"`;
            }
            return `"${col.name}"`;
        })
        .join(', ');
}

/**
 * Convert complex types to displayable format for Arrow
 * Note: Integer type conversions (HUGEINT, etc.) are now handled by convertArrowToJS
 *
 * @internal Exported for testing purposes only
 */
export function convertComplexTypesForArrow(value: unknown, columnType?: string): unknown {
    // Handle null/undefined values first
    if (value === null || value === undefined) {
        // For GEOMETRY and BLOB types, return empty Uint8Array for type consistency
        if (columnType && (columnType.includes('GEOMETRY') || columnType.includes('BLOB'))) {
            return new Uint8Array(0);
        }
        // For other complex types (JSON, STRUCT, arrays), return empty string
        if (columnType && (columnType.includes('JSON') || columnType.includes('STRUCT') || columnType.includes('[]'))) {
            return '';
        }
        return null;
    }

    // Handle binary data (BLOB, GEOMETRY) - keep as-is since we now use rawData cache
    // The Arrow table conversion will still happen, but we don't use it for binary data
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
        // Return the binary data as-is for rawData cache
        return value;
    }

    // Handle objects that look like typed arrays with numeric keys
    // These come from DuckDB's Arrow result when BLOB/GEOMETRY data is deserialized
    // Note: Sometimes byteLength property is missing, so we check for numeric keys
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
        const keys = Object.keys(value);
        // Check if most keys are numeric
        const numericKeys = keys.filter(k => /^\d+$/.test(k));
        const hasNumericKeys = numericKeys.length > 0 && numericKeys.length >= Math.max(1, keys.length - 1);

        if (hasNumericKeys) {
            // Convert to Uint8Array
            // If byteLength exists, use it; otherwise, find the max numeric key + 1
            let byteLength: number;
            if ('byteLength' in value && typeof (value as { byteLength: unknown }).byteLength === 'number') {
                byteLength = (value as { byteLength: number }).byteLength;
            } else {
                // Find max numeric key and add 1
                const maxKey = Math.max(...numericKeys.map(k => parseInt(k, 10)));
                byteLength = maxKey + 1;
            }

            const arr = new Uint8Array(byteLength);
            for (let i = 0; i < byteLength; i++) {
                const val = (value as Record<string, number>)[String(i)];
                if (val !== undefined) {
                    arr[i] = val;
                }
            }
            return arr;
        }
    }

    // Handle objects and arrays - convert to JSON string
    if (typeof value === 'object' && value !== null) {
        // Skip Date objects
        if (value instanceof Date) {
            return value;
        }
        // Convert all other objects and arrays to JSON strings
        try {
            return JSON.stringify(value);
        } catch {
            return String(value);
        }
    }

    return value;
}

/**
 * Convert query result data to Arrow table format
 *
 * @internal Exported for testing purposes only
 */
export function convertToArrowTable(data: Record<string, unknown>[], columns: TableColumn[]): ArrowTable {
    if (data.length === 0) {
        return new ArrowTable();
    }

    // Create a Map of column types for the shared conversion logic
    const columnTypes = new Map<string, string>();
    for (const col of columns) {
        columnTypes.set(col.name, col.type);
    }

    // First, apply the shared conversion logic to all rows
    // This handles integer type conversions (including HUGEINT as string)
    // Keep as Record for Arrow table creation (Arrow needs plain objects)
    const convertedData = data.map(row => convertArrowToJS(row, columnTypes) as Record<string, unknown>);

    // Then, convert complex types that Arrow can't handle directly
    const columnData: Record<string, unknown[]> = {};

    // Process each column
    for (const col of columns) {
        columnData[col.name] = convertedData.map(row => {
            const value = row[col.name];
            // Convert special types for Arrow display (BLOB, GEOMETRY, etc.)
            return convertComplexTypesForArrow(value, col.type);
        });
    }

    return tableFromArrays(columnData);
}

export async function getTableSchema(connection: AsyncDuckDBConnection, tableName: string): Promise<TableColumn[]> {
    // First, try using DESCRIBE which respects the current search_path
    try {
        const result = await connection.query(`DESCRIBE ${tableName}`);
        const columns: TableColumn[] = [];

        for (const row of result.toArray()) {
            columns.push({
                name: row.column_name as string,
                type: row.column_type as string,
            });
        }

        if (columns.length > 0) {
            return columns;
        }
    } catch {
        // If DESCRIBE fails, fall back to information_schema query
    }

    // Fall back to information_schema query if DESCRIBE fails
    // Split schema and table name if present
    const parts = tableName.split('.');
    let schemaName = 'main';
    let actualTableName = tableName;

    if (parts.length === 2) {
        schemaName = parts[0];
        actualTableName = parts[1];
    } else {
        // If no schema specified, try to get current schema from search_path
        try {
            const searchPathResult = await connection.query(`SELECT current_schema()`);
            const currentSchema = searchPathResult.toArray()[0]?.current_schema;
            if (currentSchema) {
                schemaName = currentSchema as string;
            }
        } catch {
            // Ignore error, use 'main' as default
        }
    }

    const result = await connection.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = '${schemaName}'
      AND table_name = '${actualTableName}'
    ORDER BY ordinal_position
  `);

    const columns: TableColumn[] = [];
    for (const row of result.toArray()) {
        columns.push({
            name: row.column_name as string,
            type: row.data_type as string,
        });
    }

    return columns;
}

async function getTableRowCount(connection: AsyncDuckDBConnection, tableName: string): Promise<number> {
    // Use the table name as-is (it might already include schema prefix)
    const result = await connection.query(`SELECT COUNT(*) as count FROM ${tableName}`);
    const row = result.toArray()[0];
    const count = row.count;

    // Convert BigInt to number, handling potential overflow
    if (typeof count === 'bigint') {
        // For very large numbers, cap at Number.MAX_SAFE_INTEGER
        if (count > BigInt(Number.MAX_SAFE_INTEGER)) {
            return Number.MAX_SAFE_INTEGER;
        }
        return Number(count);
    }

    return count as number;
}

export async function getTableData(
    connection: AsyncDuckDBConnection,
    tableName: string,
    offset: number = 0,
    limit: number = 100,
    sortColumn?: string,
    sortDirection: 'ASC' | 'DESC' = 'ASC'
): Promise<TableDataResult> {
    const [columns, totalRows] = await Promise.all([
        getTableSchema(connection, tableName),
        getTableRowCount(connection, tableName),
    ]);

    // If no columns found, throw a meaningful error
    if (columns.length === 0) {
        throw new Error(`No columns found for table ${tableName}`);
    }

    const columnNames = buildColumnNamesString(columns);
    // Build ORDER BY clause if sorting is requested
    const orderByClause = sortColumn ? ` ORDER BY "${sortColumn}" ${sortDirection}` : '';
    // Use the table name as-is (it might already include schema prefix)
    const result = await connection.query(
        `SELECT ${columnNames} FROM ${tableName}${orderByClause} LIMIT ${limit} OFFSET ${offset}`
    );

    const data = result.toArray();

    // Create a Map of column types
    const columnTypes = new Map<string, string>();
    for (const col of columns) {
        columnTypes.set(col.name, col.type);
    }

    // Apply convertArrowToJS and convert to Map for efficient access
    const convertedData = data.map(row => {
        const converted = convertArrowToJS(row, columnTypes) as Record<string, unknown>;
        return new Map(Object.entries(converted));
    });

    const arrowTable = convertToArrowTable(data, columns);

    return {
        columns,
        arrowTable,
        totalRows,
        rawData: convertedData, // Store raw data for efficient access
    };
}

export async function getTableDataByWindow(
    connection: AsyncDuckDBConnection,
    tableName: string,
    startRow: number,
    endRow: number,
    sortColumn?: string,
    sortDirection: 'ASC' | 'DESC' = 'ASC'
): Promise<TableWindowResult> {
    const columns = await getTableSchema(connection, tableName);

    // If no columns found, return empty result
    if (columns.length === 0) {
        return {
            arrowTable: new ArrowTable(),
            rawData: [],
        };
    }

    const limit = endRow - startRow;
    const offset = startRow;

    const columnNames = buildColumnNamesString(columns);
    // Build ORDER BY clause if sorting is requested
    const orderByClause = sortColumn ? ` ORDER BY "${sortColumn}" ${sortDirection}` : '';
    // Use the table name as-is (it might already include schema prefix)
    const result = await connection.query(
        `SELECT ${columnNames} FROM ${tableName}${orderByClause} LIMIT ${limit} OFFSET ${offset}`
    );

    const data = result.toArray();

    // Create a Map of column types
    const columnTypes = new Map<string, string>();
    for (const col of columns) {
        columnTypes.set(col.name, col.type);
    }

    // Apply convertArrowToJS and convert to Map for efficient access
    const convertedData = data.map(row => {
        const converted = convertArrowToJS(row, columnTypes) as Record<string, unknown>;
        return new Map(Object.entries(converted));
    });

    return {
        arrowTable: convertToArrowTable(data, columns),
        rawData: convertedData,
    };
}

export function getValueFromArrowTable(
    arrowTable: ArrowTable,
    rowIndex: number,
    columnIndex: number,
    columnType?: string
): unknown {
    if (rowIndex >= arrowTable.numRows || columnIndex >= arrowTable.numCols) {
        return null;
    }

    const column = arrowTable.getChildAt(columnIndex);
    if (!column) {
        return null;
    }

    const value = column.get(rowIndex);
    return convertSpecialValues(value, columnType);
}

/**
 * Get value from raw data array (more efficient for binary data)
 */
export function getValueFromRawData(
    rawData: Map<string, unknown>[],
    rowIndex: number,
    columnName: string,
    columnType?: string
): unknown {
    if (rowIndex >= rawData.length) {
        return null;
    }

    const row = rawData[rowIndex];
    if (!row) {
        return null;
    }

    const value = row.get(columnName);
    return convertSpecialValues(value, columnType);
}

export interface ColumnInfo {
    column_name: string;
    column_type: string;
}

export interface GeometryCheckResult {
    hasGeometry: boolean;
    geometryColumnName: string | null;
    geometryColumns: string[];
    allColumns: string[];
    nonGeometryColumns: string[];
}

/**
 * Detects and filters columns from a DuckDB table schema
 * Excludes GEOMETRY and BLOB types, and optionally a specific geometry column
 *
 * @param schemaData - Array of column information from DESCRIBE query
 * @param geometryColumnName - Optional name of geometry column to exclude
 * @returns Array of column names suitable for data display
 */
export function detectDisplayColumns(schemaData: ColumnInfo[], geometryColumnName?: string): string[] {
    return schemaData
        .filter(col => {
            if (!col.column_type) {
                return false;
            }
            const typeUpper = col.column_type.toUpperCase();

            // Exclude GEOMETRY types
            if (typeUpper === 'GEOMETRY' || typeUpper.startsWith('GEOMETRY(')) {
                return false;
            }

            // Exclude BLOB types
            if (typeUpper.includes('BLOB')) {
                return false;
            }

            // Exclude the specified geometry column if provided
            if (geometryColumnName && col.column_name === geometryColumnName) {
                return false;
            }

            return true;
        })
        .map(col => col.column_name);
}

/**
 * Checks if a column type is a GEOMETRY type
 *
 * @param columnType - The column type string from DuckDB
 * @returns true if the column is a GEOMETRY type
 */
export function isGeometryColumn(columnType: string): boolean {
    const typeUpper = columnType.toUpperCase();
    return typeUpper === 'GEOMETRY' || typeUpper.startsWith('GEOMETRY(');
}

/**
 * Checks if a column type is a BLOB type
 *
 * @param columnType - The column type string from DuckDB
 * @returns true if the column is a BLOB type
 */
export function isBlobColumn(columnType: string): boolean {
    const typeUpper = columnType.toUpperCase();
    return typeUpper.includes('BLOB');
}

/**
 * Check if a table has a geometry column and return column information
 */
export async function checkTableGeometry(
    connection: AsyncDuckDBConnection,
    tableName: string
): Promise<GeometryCheckResult> {
    try {
        // Query table schema using PRAGMA table_info
        const result = await connection.query(`PRAGMA table_info('${tableName}')`);
        const columns = result.toArray();

        // Extract column information
        const columnInfo: ColumnInfo[] = columns.map(row => {
            const rowData = row as Record<string, unknown>;
            return {
                column_name: String(rowData.name || ''),
                column_type: String(rowData.type || ''),
            };
        });

        const allColumns = columnInfo.map(col => col.column_name).filter(name => name);

        // Find all geometry columns
        const geometryColumns = columnInfo
            .filter(col => col.column_type && col.column_type.toUpperCase().includes('GEOMETRY'))
            .map(col => col.column_name);

        const hasGeometry = geometryColumns.length > 0;
        const geometryColumnName = geometryColumns[0] || null;

        // Get non-geometry columns
        const nonGeometryColumns = columnInfo
            .filter(col => !col.column_type || !col.column_type.toUpperCase().includes('GEOMETRY'))
            .map(col => col.column_name);

        return {
            hasGeometry,
            geometryColumnName,
            geometryColumns,
            allColumns,
            nonGeometryColumns,
        };
    } catch (error) {
        console.error('Error checking table geometry:', error);
        return {
            hasGeometry: false,
            geometryColumnName: null,
            geometryColumns: [],
            allColumns: [],
            nonGeometryColumns: [],
        };
    }
}
