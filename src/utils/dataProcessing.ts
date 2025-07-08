export interface FieldInfo {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'null';
  nullable: boolean;
}

interface GeoJSONFeature {
  type: string;
  properties?: Record<string, any>;
  geometry: any;
}

/**
 * Analyzes GeoJSON features to determine property fields and their types
 */
export function analyzeGeoJSONProperties(features: GeoJSONFeature[]): FieldInfo[] {
  const fieldMap = new Map<string, { types: Set<string>; nullable: boolean }>();

  // Analyze all features to determine fields and types
  features.forEach(feature => {
    const properties = feature.properties || {};
    
    Object.entries(properties).forEach(([key, value]) => {
      if (!fieldMap.has(key)) {
        fieldMap.set(key, { types: new Set(), nullable: false });
      }
      
      const field = fieldMap.get(key)!;
      
      if (value === null || value === undefined) {
        field.nullable = true;
      } else if (typeof value === 'string') {
        field.types.add('string');
      } else if (typeof value === 'number') {
        field.types.add('number');
      } else if (typeof value === 'boolean') {
        field.types.add('boolean');
      } else if (typeof value === 'object') {
        field.types.add('json');
      }
    });
  });

  // Check for missing fields in some features
  features.forEach(feature => {
    const properties = feature.properties || {};
    fieldMap.forEach((field, key) => {
      if (!(key in properties)) {
        field.nullable = true;
      }
    });
  });

  // Convert to FieldInfo array
  const fields: FieldInfo[] = [];
  fieldMap.forEach((field, name) => {
    // Determine the dominant type
    let type: FieldInfo['type'] = 'string'; // default
    if (field.types.size === 1) {
      type = Array.from(field.types)[0] as FieldInfo['type'];
    } else if (field.types.has('number') && field.types.has('string')) {
      // Mixed types, use string
      type = 'string';
    } else if (field.types.size === 0) {
      type = 'null';
    }
    
    fields.push({ name, type, nullable: field.nullable });
  });

  return fields;
}

/**
 * Converts a JavaScript value to a SQL-safe string
 */
export function valueToSQL(value: any, type: FieldInfo['type']): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }

  switch (type) {
    case 'string':
      return `'${String(value).replace(/'/g, "''")}'`;
    case 'number':
      return String(value);
    case 'boolean':
      return value ? 'TRUE' : 'FALSE';
    case 'json':
      return `'${JSON.stringify(value).replace(/'/g, "''")}'::JSON`;
    case 'null':
      return 'NULL';
    default:
      return `'${String(value).replace(/'/g, "''")}'`;
  }
}

/**
 * Gets the SQL type for a field type
 */
export function getSQLType(type: FieldInfo['type']): string {
  switch (type) {
    case 'string':
      return 'VARCHAR';
    case 'number':
      return 'DOUBLE';
    case 'boolean':
      return 'BOOLEAN';
    case 'json':
      return 'JSON';
    case 'null':
      return 'VARCHAR';
    default:
      return 'VARCHAR';
  }
}

/**
 * Creates a SQL CREATE TABLE statement for GeoJSON with flattened properties
 */
export function createGeoJSONTableSQL(tableName: string, fields: FieldInfo[]): string {
  const columns: string[] = [
    '_geojson JSON', // Special column to store the entire feature
  ];

  // Add property columns
  fields.forEach(field => {
    const sqlType = getSQLType(field.type);
    columns.push(`"${field.name}" ${sqlType}`);
  });

  // Add geometry column
  columns.push('geom GEOMETRY');

  return `CREATE TABLE ${tableName} (${columns.join(', ')})`;
}

/**
 * Creates INSERT VALUES for a batch of GeoJSON features
 */
export function createGeoJSONInsertValues(features: GeoJSONFeature[], fields: FieldInfo[]): string {
  return features.map(feature => {
    const values: string[] = [];
    
    // Add _geojson column
    values.push(`'${JSON.stringify(feature).replace(/'/g, "''")}'::JSON`);
    
    // Add property values in field order
    const properties = feature.properties || {};
    fields.forEach(field => {
      const value = properties[field.name];
      values.push(valueToSQL(value, field.type));
    });
    
    // Add geometry
    const geom = JSON.stringify(feature.geometry).replace(/'/g, "''");
    values.push(`ST_GeomFromGeoJSON('${geom}')`);
    
    return `(${values.join(', ')})`;
  }).join(',');
}