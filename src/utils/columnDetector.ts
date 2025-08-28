/**
 * Column detection utilities for DuckDB tables
 */

export interface ColumnInfo {
  column_name: string;
  column_type: string;
}

/**
 * Detects and filters columns from a DuckDB table schema
 * Excludes GEOMETRY and BLOB types, and optionally a specific geometry column
 * 
 * @param schemaData - Array of column information from DESCRIBE query
 * @param geometryColumnName - Optional name of geometry column to exclude
 * @returns Array of column names suitable for data display
 */
export function detectDisplayColumns(
  schemaData: ColumnInfo[],
  geometryColumnName?: string
): string[] {
  return schemaData
    .filter(col => {
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
 * Finds all geometry columns in a table schema
 * 
 * @param schemaData - Array of column information from DESCRIBE query
 * @returns Array of geometry column names
 */
export function findGeometryColumns(schemaData: ColumnInfo[]): string[] {
  return schemaData
    .filter(col => isGeometryColumn(col.column_type))
    .map(col => col.column_name);
}