import { AsyncDuckDB } from '@duckdb/duckdb-wasm';

/**
 * Kepler.gl-inspired data transformation utilities
 * Transforms various data formats into visualization-ready structures
 */

export interface VizField {
  name: string;
  type: 'real' | 'integer' | 'string' | 'boolean' | 'timestamp' | 'geometry' | 'array' | 'object';
  format?: string;
  displayName?: string;
}

export interface VizRow {
  [key: string]: any;
}

export interface VizData {
  fields: VizField[];
  rows: VizRow[];
  metadata?: {
    totalRows: number;
    hasGeometry: boolean;
    coordinatePairs: Array<{ lat: string; lng: string; alt?: string }>;
  };
}

/**
 * Flatten nested JSON properties into dot-notation fields
 */
export function flattenObject(obj: any, prefix: string = ''): Record<string, any> {
  const flattened: Record<string, any> = {};
  
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const value = obj[key];
      const newKey = prefix ? `${prefix}.${key}` : key;
      
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Recursively flatten nested objects
        Object.assign(flattened, flattenObject(value, newKey));
      } else {
        flattened[newKey] = value;
      }
    }
  }
  
  return flattened;
}

/**
 * Extract coordinates from various geometry types
 */
export function extractCoordinates(geometry: any): { lat: number; lng: number } | null {
  if (!geometry) return null;
  
  try {
    // Handle different geometry types
    switch (geometry.type) {
      case 'Point':
        return {
          lng: geometry.coordinates[0],
          lat: geometry.coordinates[1]
        };
      
      case 'LineString':
        // Return first point of line
        return {
          lng: geometry.coordinates[0][0],
          lat: geometry.coordinates[0][1]
        };
      
      case 'Polygon':
        // Return centroid approximation (first point of outer ring)
        return {
          lng: geometry.coordinates[0][0][0],
          lat: geometry.coordinates[0][0][1]
        };
      
      case 'MultiPoint':
        // Return first point
        return {
          lng: geometry.coordinates[0][0],
          lat: geometry.coordinates[0][1]
        };
      
      default:
        return null;
    }
  } catch (e) {
    return null;
  }
}

/**
 * Transform GeoJSON data into visualization-ready format
 */
export async function transformGeoJSONTable(
  db: AsyncDuckDB,
  tableName: string,
  vizTableName?: string
): Promise<string> {
  const conn = await db.connect();
  const outputTable = vizTableName || `${tableName}_viz`;
  
  try {
    // First, analyze the GeoJSON structure
    const sampleResult = await conn.query(`
      SELECT 
        properties,
        geom,
        ST_GeometryType(geom) as geom_type
      FROM ${tableName} 
      LIMIT 100
    `);
    
    const samples = sampleResult.toArray();
    if (samples.length === 0) {
      throw new Error('No data found in table');
    }
    
    // Collect all unique property keys
    const allKeys = new Set<string>();
    const flattenedSamples: any[] = [];
    
    samples.forEach(row => {
      if (row.properties) {
        const flattened = flattenObject(row.properties);
        flattenedSamples.push(flattened);
        Object.keys(flattened).forEach(key => allKeys.add(key));
      }
    });
    
    // Determine field types from samples
    const fieldTypes = new Map<string, string>();
    allKeys.forEach(key => {
      let type = 'VARCHAR';
      const values = flattenedSamples.map(s => s[key]).filter(v => v != null);
      
      if (values.length > 0) {
        const sample = values[0];
        if (typeof sample === 'number') {
          type = Number.isInteger(sample) ? 'INTEGER' : 'DOUBLE';
        } else if (typeof sample === 'boolean') {
          type = 'BOOLEAN';
        } else if (sample instanceof Date) {
          type = 'TIMESTAMP';
        }
      }
      
      fieldTypes.set(key, type);
    });
    
    // Build the CREATE TABLE statement with flattened columns
    const columnDefs: string[] = [
      // Geometry-derived columns
      'ST_Y(geom) as _lat',
      'ST_X(geom) as _lng',
      'ST_AsText(geom) as _geom_wkt',
      'ST_GeometryType(geom) as _geom_type',
      // Keep original columns
      'geom',
      'properties as _properties_raw'
    ];
    
    // Add flattened property columns
    allKeys.forEach(key => {
      // Make SQL-safe column names
      let safeName = key.replace(/[^a-zA-Z0-9_]/g, '_');
      // If name starts with a number, prefix with underscore
      if (/^\d/.test(safeName)) {
        safeName = '_' + safeName;
      }
      // If name is empty or reserved, use a generic name
      if (!safeName || safeName.length === 0) {
        safeName = '_col_' + Array.from(allKeys).indexOf(key);
      }
      columnDefs.push(`properties->>'${key}' as "${safeName}"`);
    });
    
    // Create the visualization-ready table
    const createQuery = `
      CREATE OR REPLACE TABLE ${outputTable} AS
      SELECT 
        ${columnDefs.join(',\n        ')}
      FROM ${tableName}
      WHERE geom IS NOT NULL
    `;
    
    await conn.query(createQuery);
    
    // Also create a simpler version for point visualizations
    await conn.query(`
      CREATE OR REPLACE VIEW ${outputTable}_points AS
      SELECT * FROM ${outputTable}
      WHERE _geom_type = 'POINT'
    `);
    
    await conn.close();
    return outputTable;
  } catch (error) {
    await conn.close();
    throw error;
  }
}

/**
 * Transform any table with detected lat/lng columns
 */
export async function transformTableWithCoordinates(
  db: AsyncDuckDB,
  tableName: string,
  latColumn: string,
  lngColumn: string,
  vizTableName?: string
): Promise<string> {
  const conn = await db.connect();
  const outputTable = vizTableName || `${tableName}_viz`;
  
  try {
    // Get all columns
    const schemaResult = await conn.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${tableName}'
      ORDER BY ordinal_position
    `);
    
    const columns = schemaResult.toArray();
    
    // Build column list with standardized coordinate names
    const columnDefs = columns.map(col => {
      if (col.column_name === latColumn) {
        return `${col.column_name} as _lat`;
      } else if (col.column_name === lngColumn) {
        return `${col.column_name} as _lng`;
      } else {
        return col.column_name;
      }
    });
    
    // Add geometry column
    columnDefs.push(`ST_Point(${lngColumn}, ${latColumn}) as geom`);
    
    // Create visualization-ready table
    await conn.query(`
      CREATE OR REPLACE TABLE ${outputTable} AS
      SELECT ${columnDefs.join(', ')}
      FROM ${tableName}
      WHERE ${latColumn} IS NOT NULL 
        AND ${lngColumn} IS NOT NULL
        AND ${latColumn} BETWEEN -90 AND 90
        AND ${lngColumn} BETWEEN -180 AND 180
    `);
    
    await conn.close();
    return outputTable;
  } catch (error) {
    await conn.close();
    throw error;
  }
}

/**
 * Analyze table and create appropriate visualization view
 */
export async function createVisualizationView(
  db: AsyncDuckDB,
  tableName: string
): Promise<{ viewName: string; type: 'geojson' | 'coordinates' | 'standard' }> {
  const conn = await db.connect();
  
  try {
    // Check if it's a GeoJSON table
    const columnsResult = await conn.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${tableName}'
    `);
    
    const columns = columnsResult.toArray();
    const columnNames = columns.map(c => c.column_name);
    const columnTypes = new Map(columns.map(c => [c.column_name, c.data_type]));
    
    // Check for GeoJSON structure
    if (columnNames.includes('properties') && columnNames.includes('geom')) {
      const viewName = await transformGeoJSONTable(db, tableName);
      return { viewName, type: 'geojson' };
    }
    
    // Check for coordinate columns
    const latColumns = columnNames.filter(name => 
      ['lat', 'latitude', 'y', '_lat'].includes(name.toLowerCase())
    );
    const lngColumns = columnNames.filter(name => 
      ['lng', 'lon', 'longitude', 'x', '_lng'].includes(name.toLowerCase())
    );
    
    if (latColumns.length > 0 && lngColumns.length > 0) {
      const viewName = await transformTableWithCoordinates(
        db, 
        tableName, 
        latColumns[0], 
        lngColumns[0]
      );
      return { viewName, type: 'coordinates' };
    }
    
    // For standard tables, create a simple alias view
    const viewName = `${tableName}_viz`;
    await conn.query(`CREATE OR REPLACE VIEW ${viewName} AS SELECT * FROM ${tableName}`);
    
    await conn.close();
    return { viewName, type: 'standard' };
  } catch (error) {
    await conn.close();
    throw error;
  }
}

/**
 * Get visualization-ready data from any table
 */
export async function getVizData(
  db: AsyncDuckDB,
  tableName: string,
  limit: number = 1000
): Promise<VizData> {
  const conn = await db.connect();
  
  try {
    // Try to use visualization view if it exists
    const vizTableName = `${tableName}_viz`;
    let targetTable = tableName;
    
    // Check if viz view exists
    try {
      await conn.query(`SELECT 1 FROM ${vizTableName} LIMIT 1`);
      targetTable = vizTableName;
    } catch {
      // Viz view doesn't exist, use original table
    }
    
    // Get schema
    const schemaResult = await conn.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${targetTable}'
      ORDER BY ordinal_position
    `);
    
    const fields: VizField[] = schemaResult.toArray().map(col => ({
      name: col.column_name,
      type: mapDuckDBTypeToVizType(col.data_type),
      displayName: col.column_name.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())
    }));
    
    // Get data
    const dataResult = await conn.query(`SELECT * FROM ${targetTable} LIMIT ${limit}`);
    const rows = dataResult.toArray();
    
    // Detect coordinate pairs
    const coordinatePairs: Array<{ lat: string; lng: string; alt?: string }> = [];
    const fieldNames = fields.map(f => f.name);
    
    // Look for standard coordinate fields
    if (fieldNames.includes('_lat') && fieldNames.includes('_lng')) {
      coordinatePairs.push({ lat: '_lat', lng: '_lng' });
    }
    
    // Look for other coordinate patterns
    const latFields = fieldNames.filter(n => n.match(/^(.*_)?lat(itude)?$/i));
    const lngFields = fieldNames.filter(n => n.match(/^(.*_)?l(on|ng)(gitude)?$/i));
    
    latFields.forEach(latField => {
      const prefix = latField.replace(/lat(itude)?$/i, '');
      const matchingLng = lngFields.find(lngField => 
        lngField.replace(/l(on|ng)(gitude)?$/i, '') === prefix
      );
      if (matchingLng && !coordinatePairs.some(p => p.lat === latField)) {
        coordinatePairs.push({ lat: latField, lng: matchingLng });
      }
    });
    
    await conn.close();
    
    return {
      fields,
      rows,
      metadata: {
        totalRows: rows.length,
        hasGeometry: fields.some(f => f.type === 'geometry'),
        coordinatePairs
      }
    };
  } catch (error) {
    await conn.close();
    throw error;
  }
}

function mapDuckDBTypeToVizType(duckdbType: string): VizField['type'] {
  const type = duckdbType.toLowerCase();
  
  if (type.includes('int')) return 'integer';
  if (type.includes('float') || type.includes('double') || type.includes('decimal')) return 'real';
  if (type.includes('bool')) return 'boolean';
  if (type.includes('timestamp') || type.includes('date') || type.includes('time')) return 'timestamp';
  if (type.includes('geometry')) return 'geometry';
  if (type.includes('json')) return 'object';
  if (type.includes('array')) return 'array';
  
  return 'string';
}