import { AsyncDuckDB } from '@duckdb/duckdb-wasm';

/**
 * Utilities for AI tools to work with visualization-ready data
 */

/**
 * Get the best table name for visualization
 * Prefers _viz tables over raw tables
 */
export async function getBestTableForViz(
  db: AsyncDuckDB,
  tableName: string
): Promise<{ tableName: string; isVizTable: boolean }> {
  const conn = await db.connect();
  
  try {
    // Check if a _viz version exists
    const vizTableName = `${tableName}_viz`;
    try {
      await conn.query(`SELECT 1 FROM ${vizTableName} LIMIT 1`);
      await conn.close();
      return { tableName: vizTableName, isVizTable: true };
    } catch {
      // Viz table doesn't exist
    }
    
    // Check if the table itself is already a viz table
    if (tableName.endsWith('_viz')) {
      await conn.close();
      return { tableName, isVizTable: true };
    }
    
    await conn.close();
    return { tableName, isVizTable: false };
  } catch (error) {
    await conn.close();
    throw error;
  }
}

/**
 * Get columns suitable for visualization from a table
 */
export async function getVizColumns(
  db: AsyncDuckDB,
  tableName: string
): Promise<{
  coordinateColumns: { lat?: string; lng?: string; geom?: string };
  propertyColumns: string[];
  allColumns: Array<{ name: string; type: string }>;
}> {
  const conn = await db.connect();
  
  try {
    // Get best table for viz
    const { tableName: bestTable } = await getBestTableForViz(db, tableName);
    
    // Get all columns
    const columnsResult = await conn.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${bestTable}'
      ORDER BY ordinal_position
    `);
    
    const columns = columnsResult.toArray();
    const coordinateColumns: { lat?: string; lng?: string; geom?: string } = {};
    const propertyColumns: string[] = [];
    
    columns.forEach(col => {
      const name = col.column_name;
      const type = col.data_type.toLowerCase();
      
      // Check for coordinate columns
      if (name === '_lat' || name.toLowerCase().match(/^(.*_)?lat(itude)?$/)) {
        coordinateColumns.lat = name;
      } else if (name === '_lng' || name.toLowerCase().match(/^(.*_)?l(on|ng)(gitude)?$/)) {
        coordinateColumns.lng = name;
      } else if (type.includes('geometry')) {
        coordinateColumns.geom = name;
      } else if (!name.startsWith('_') && !type.includes('geometry')) {
        // Regular property columns
        propertyColumns.push(name);
      }
    });
    
    await conn.close();
    
    return {
      coordinateColumns,
      propertyColumns,
      allColumns: columns.map(c => ({ name: c.column_name, type: c.data_type }))
    };
  } catch (error) {
    await conn.close();
    throw error;
  }
}

/**
 * Build a SQL query that works with both raw and viz tables
 */
export function buildVizAwareQuery(
  tableName: string,
  fields: string[],
  isVizTable: boolean,
  whereClause?: string,
  groupBy?: string[],
  orderBy?: string[],
  limit?: number
): string {
  // For viz tables, fields are already flattened
  // For raw tables (especially GeoJSON), we might need to extract from properties
  const selectFields = fields.map(field => {
    if (isVizTable) {
      return field;
    }
    
    // Check if this might be a nested property field
    if (!field.includes('(') && !field.includes('AS') && !field.includes('as')) {
      // For raw GeoJSON tables, try to extract from properties
      return `COALESCE(${field}, properties->>'${field}', ${field}) as ${field}`;
    }
    
    return field;
  });
  
  let query = `SELECT ${selectFields.join(', ')} FROM ${tableName}`;
  
  if (whereClause) {
    query += ` WHERE ${whereClause}`;
  }
  
  if (groupBy && groupBy.length > 0) {
    query += ` GROUP BY ${groupBy.join(', ')}`;
  }
  
  if (orderBy && orderBy.length > 0) {
    query += ` ORDER BY ${orderBy.join(', ')}`;
  }
  
  if (limit) {
    query += ` LIMIT ${limit}`;
  }
  
  return query;
}

/**
 * Helper to suggest using viz table when available
 */
export function suggestVizTable(originalTable: string, vizTable: string): string {
  return `💡 **Tip**: For better visualization performance, you can use the flattened table \`${vizTable}\` which has all properties extracted as columns. This makes it easier to create charts and maps without complex JSON queries.`;
}