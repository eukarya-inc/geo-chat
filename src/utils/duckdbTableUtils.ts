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
function convertSpecialValues(value: unknown): unknown {
  // Convert BigInt to string to avoid type issues
  if (typeof value === 'bigint') {
    return value.toString();
  }
  
  // Handle BLOB data (Uint8Array, ArrayBuffer, or objects with byteLength)
  if (value instanceof Uint8Array || 
      value instanceof ArrayBuffer || 
      (value && typeof value === 'object' && 'byteLength' in value)) {
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
    columnData[col.name] = data.map(row => convertSpecialValues(row[col.name]));
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
  columnIndex: number
): unknown {
  if (rowIndex >= arrowTable.numRows || columnIndex >= arrowTable.numCols) {
    return null;
  }
  
  const column = arrowTable.getChildAt(columnIndex);
  if (!column) {
    return null;
  }
  
  const value = column.get(rowIndex);
  return convertSpecialValues(value);
}