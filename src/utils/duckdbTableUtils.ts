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
 * Convert special values (BigInt, BLOB) to display-friendly formats
 */
function convertSpecialValues(value: unknown, columnType?: string): unknown {
  // Convert BigInt to string to avoid type issues
  if (typeof value === 'bigint') {
    return value.toString();
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
  
  const columnData: Record<string, unknown[]> = {};
  for (const col of columns) {
    columnData[col.name] = data.map(row => convertSpecialValues(row[col.name], col.type));
  }
  
  return tableFromArrays(columnData);
}

export async function getTableSchema(
  connection: AsyncDuckDBConnection,
  tableName: string
): Promise<TableColumn[]> {
  const result = await connection.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = '${tableName}'
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
  const result = await connection.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
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
  limit: number = 100
): Promise<TableDataResult> {
  const [columns, totalRows] = await Promise.all([
    getTableSchema(connection, tableName),
    getTableRowCount(connection, tableName),
  ]);

  const columnNames = buildColumnNamesString(columns);
  const result = await connection.query(
    `SELECT ${columnNames} FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`
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
  endRow: number
): Promise<ArrowTable> {
  const columns = await getTableSchema(connection, tableName);
  const limit = endRow - startRow;
  const offset = startRow;

  const columnNames = buildColumnNamesString(columns);
  const result = await connection.query(
    `SELECT ${columnNames} FROM "${tableName}" LIMIT ${limit} OFFSET ${offset}`
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
