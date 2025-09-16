/**
 * Helper functions for handling table creation from URLs
 */

/**
 * Detects if SQL is a CREATE TABLE FROM URL pattern and extracts table name and URL
 * Supports patterns like:
 * - CREATE TABLE tablename AS SELECT * FROM 'http://...'
 * - CREATE TABLE tablename AS SELECT * FROM read_csv_auto('http://...')
 * - CREATE TABLE tablename AS SELECT * FROM st_read('http://...')
 */
export function detectCreateTableFromUrl(sql: string): { tableName: string; url: string } | null {
  // First, try to match direct URL pattern
  const directUrlMatch = sql.match(/CREATE\s+TABLE\s+(\w+)\s+AS\s+SELECT\s+\*\s+FROM\s+'(https?:\/\/[^']+)'/i);
  if (directUrlMatch) {
    return {
      tableName: directUrlMatch[1],
      url: directUrlMatch[2]
    };
  }
  
  // Try to match function-based patterns (read_csv_auto, st_read, etc.)
  const functionMatch = sql.match(/CREATE\s+TABLE\s+(\w+)\s+AS\s+SELECT\s+\*\s+FROM\s+(?:read_csv_auto|st_read|read_parquet)\s*\(\s*'(https?:\/\/[^']+)'[^)]*\)/i);
  if (functionMatch) {
    return {
      tableName: functionMatch[1],
      url: functionMatch[2]
    };
  }
  
  return null;
}

/**
 * Generates a valid table name from a URL
 * Extracts the filename from the URL and converts it to a valid SQL table name
 */
export function generateTableNameFromUrl(url: string): string {
  // Extract file name from URL
  const fileName = url.split('/').pop() || 'remote_file';
  const decodedFileName = decodeURIComponent(fileName);
  
  // Remove extension
  const nameWithoutExt = decodedFileName.split('.')[0];
  
  // Convert to valid table name
  let tableName: string;
  
  // Check for non-ASCII characters (e.g., Japanese)
  // eslint-disable-next-line no-control-regex
  if (/[^\x00-\x7F]/.test(nameWithoutExt)) {
    // For non-ASCII characters, generate a simple hash
    const hash = nameWithoutExt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0).toString(16);
    tableName = `table_${hash}`;
  } else {
    // For ASCII only, replace invalid characters with underscores
    tableName = nameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_');
    // Ensure it doesn't start with a number
    if (/^\d/.test(tableName)) {
      tableName = `t_${tableName}`;
    }
  }
  
  return tableName;
}

/**
 * Determines the appropriate FROM clause for a given URL based on file extension
 * Returns the SQL FROM clause (without CREATE TABLE part)
 */
export function getFromClauseForUrl(url: string): string {
  // Remove query parameters to check extension
  const urlWithoutQuery = url.split('?')[0];
  const lowerUrl = urlWithoutQuery.toLowerCase();
  
  const isParquet = lowerUrl.endsWith('.parquet');
  const isCSV = lowerUrl.endsWith('.csv');
  
  if (isParquet) {
    return `'${url}'`;
  } else if (isCSV) {
    return `read_csv_auto('${url}')`;
  } else {
    // Assume it's a geospatial file (GeoJSON, Shapefile, etc.)
    return `st_read('${url}')`;
  }
}