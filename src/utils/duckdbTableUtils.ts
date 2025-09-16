import type { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { Table as ArrowTable, tableFromArrays } from "apache-arrow";

export interface TableColumn {
  name: string;
  type: string;
}

export interface TableDataResult {
  columns: TableColumn[];
  arrowTable: ArrowTable;
  totalRows: number;
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
      if (columnType && (columnType.toUpperCase() === 'DATE')) {
        return `${year}-${month}-${day}`;
      }
    }
    
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  // Handle BLOB data (Uint8Array, ArrayBuffer, or objects with byteLength)
  if (value instanceof Uint8Array ||
      value instanceof ArrayBuffer ||
      (value && typeof value === 'object' && 'byteLength' in value)) {
    // Check if this is a geometry column based on column type
    if (columnType && (
      columnType.toUpperCase().includes('GEOMETRY') ||
      columnType.toUpperCase().includes('POINT') ||
      columnType.toUpperCase().includes('LINESTRING') ||
      columnType.toUpperCase().includes('POLYGON') ||
      columnType.toUpperCase().includes('MULTIPOINT') ||
      columnType.toUpperCase().includes('MULTILINESTRING') ||
      columnType.toUpperCase().includes('MULTIPOLYGON') ||
      columnType.toUpperCase().includes('GEOMETRYCOLLECTION')
    )) {
      // Try to extract geometry type from WKB if possible
      if (value instanceof Uint8Array && value.length > 5) {
        try {
          // WKB format: byte order (1 byte) + type (4 bytes)
          const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
          const byteOrder = value[0]; // 0 = big endian, 1 = little endian
          const typeCode = byteOrder === 1
            ? view.getUint32(1, true)  // little endian
            : view.getUint32(1, false); // big endian

          // Geometry type codes
          const geomTypes: Record<number, string> = {
            1: 'POINT',
            2: 'LINESTRING',
            3: 'POLYGON',
            4: 'MULTIPOINT',
            5: 'MULTILINESTRING',
            6: 'MULTIPOLYGON',
            7: 'GEOMETRYCOLLECTION'
          };

          const baseType = typeCode & 0xFF; // Get base type without dimension flags
          const typeName = geomTypes[baseType] || 'GEOMETRY';

          // For POINT geometry, try to extract coordinates
          if (baseType === 1 && value.length >= 21) {
            const x = byteOrder === 1
              ? view.getFloat64(5, true)
              : view.getFloat64(5, false);
            const y = byteOrder === 1
              ? view.getFloat64(13, true)
              : view.getFloat64(13, false);

            // Format coordinates with reasonable precision
            return `POINT(${x.toFixed(6)} ${y.toFixed(6)})`;
          }

          return `[${typeName}]`;
        } catch {
          // If parsing fails, fall back to column type
        }
      }

      // For geometry types, show a more descriptive label based on column type
      const geomType = columnType.toUpperCase().replace('MULTI', 'MULTI ');
      return `[${geomType}]`;
    }

    // For other BLOB data, try to show size information
    let byteLength = 0;
    if (value instanceof Uint8Array) {
      byteLength = value.byteLength;
    } else if (value instanceof ArrayBuffer) {
      byteLength = value.byteLength;
    } else if (value && typeof value === 'object' && 'byteLength' in value) {
      byteLength = (value as { byteLength: number }).byteLength;
    }

    if (byteLength > 0) {
      // Format byte size in a human-readable way
      if (byteLength < 1024) {
        return `[BLOB: ${byteLength} bytes]`;
      } else if (byteLength < 1024 * 1024) {
        return `[BLOB: ${(byteLength / 1024).toFixed(1)} KB]`;
      } else {
        return `[BLOB: ${(byteLength / (1024 * 1024)).toFixed(1)} MB]`;
      }
    }

    return '[BLOB]';
  }

  return value;
}

/**
 * Build column names string for SQL queries
 */
function buildColumnNamesString(columns: TableColumn[]): string {
  return columns.map(col => `"${col.name}"`).join(", ");
}

/**
 * Convert query result data to Arrow table format
 */
function convertToArrowTable(data: Record<string, unknown>[], columns: TableColumn[]): ArrowTable {
  if (data.length === 0) {
    return new ArrowTable();
  }

  // Don't apply convertSpecialValues here - keep original data for Arrow
  // The conversion should only happen when displaying values
  const columnData: Record<string, unknown[]> = {};
  for (const col of columns) {
    columnData[col.name] = data.map(row => {
      const value = row[col.name];
      // Only convert BigInt here as it can't be stored in Arrow directly
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
  }

  return tableFromArrays(columnData);
}

export async function getTableSchema(
  connection: AsyncDuckDBConnection,
  tableName: string
): Promise<TableColumn[]> {
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

export async function getTableRowCount(
  connection: AsyncDuckDBConnection,
  tableName: string
): Promise<number> {
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
  const arrowTable = convertToArrowTable(data, columns);

  return {
    columns,
    arrowTable,
    totalRows,
  };
}

export async function getTableDataByWindow(
  connection: AsyncDuckDBConnection,
  tableName: string,
  startRow: number,
  endRow: number,
  sortColumn?: string,
  sortDirection: 'ASC' | 'DESC' = 'ASC'
): Promise<ArrowTable> {
  const columns = await getTableSchema(connection, tableName);
  
  // If no columns found, return empty table
  if (columns.length === 0) {
    return new ArrowTable();
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
  return convertToArrowTable(data, columns);
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
