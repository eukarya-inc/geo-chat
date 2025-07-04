import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { MapStyleManager } from '../../../utils/mapStyleManager';
import { store } from '../../../store';

// MapLibre GL expression types
type Expression = any[];

interface PropertyInfo {
  name: string;
  type: string;
  sampleValues?: any[];
  uniqueCount?: number;
  min?: number;
  max?: number;
  isFromJSON?: boolean; // Track if this property is from JSON extraction
}

/**
 * Analyzes table structure to understand available properties
 * For GeoJSON data, this extracts properties from the JSON column
 */
async function analyzeTableProperties(
  db: AsyncDuckDB,
  tableName: string
): Promise<{ properties: PropertyInfo[]; isGeoJSON: boolean }> {
  const conn = await db.connect();
  
  try {
    // Get table structure
    const schemaResult = await conn.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${tableName}'
      ORDER BY ordinal_position
    `);
    
    const columns = schemaResult.toArray();
    let isGeoJSON = false;
    let properties: PropertyInfo[] = [];
    
    // Check if this is a GeoJSON table (has properties and geom columns)
    const hasProperties = columns.some(col => col.column_name === 'properties' && col.data_type === 'JSON');
    const hasGeom = columns.some(col => col.column_name === 'geom');
    isGeoJSON = hasProperties && hasGeom;
    
    if (isGeoJSON) {
      // For GeoJSON, analyze the JSON properties
      try {
        // Get a sample of properties to understand structure
        const sampleResult = await conn.query(`
          SELECT properties 
          FROM "${tableName}" 
          WHERE properties IS NOT NULL 
          LIMIT 100
        `);
        
        const samples = sampleResult.toArray();
        const allKeys = new Set<string>();
        
        // Collect all unique keys from properties
        samples.forEach(row => {
          if (row.properties && typeof row.properties === 'object') {
            Object.keys(row.properties).forEach(key => allKeys.add(key));
          }
        });
        
        // Analyze each property
        for (const key of allKeys) {
          const propInfo: PropertyInfo = {
            name: key,
            type: 'unknown',
            isFromJSON: true
          };
          
          try {
            // Get sample values and type info
            const valueResult = await conn.query(`
              SELECT DISTINCT properties->>'${key}' as value
              FROM "${tableName}"
              WHERE properties->>'${key}' IS NOT NULL
              LIMIT 20
            `);
            
            const values = valueResult.toArray().map(row => row.value);
            propInfo.sampleValues = values;
            propInfo.uniqueCount = values.length;
            
            // Infer type from values
            if (values.length > 0) {
              const firstValue = values[0];
              if (!isNaN(Number(firstValue))) {
                propInfo.type = 'numeric';
                
                // Get min/max for numeric
                const statsResult = await conn.query(`
                  SELECT 
                    MIN(CAST(properties->>'${key}' AS DOUBLE)) as min_val,
                    MAX(CAST(properties->>'${key}' AS DOUBLE)) as max_val
                  FROM "${tableName}"
                  WHERE properties->>'${key}' IS NOT NULL
                    AND TRY_CAST(properties->>'${key}' AS DOUBLE) IS NOT NULL
                `);
                
                const stats = statsResult.toArray()[0];
                if (stats) {
                  propInfo.min = stats.min_val;
                  propInfo.max = stats.max_val;
                }
              } else {
                propInfo.type = 'string';
              }
            }
          } catch (e) {
            console.warn(`Could not analyze property ${key}:`, e);
          }
          
          properties.push(propInfo);
        }
      } catch (e) {
        console.error('Error analyzing GeoJSON properties:', e);
      }
    } else {
      // For non-GeoJSON tables, analyze regular columns
      for (const col of columns) {
        if (col.data_type.toLowerCase().includes('geometry')) {
          continue; // Skip geometry columns
        }
        
        const propInfo: PropertyInfo = {
          name: col.column_name,
          type: col.data_type,
          isFromJSON: false
        };
        
        // Get sample values and statistics
        try {
          if (col.data_type.includes('INT') || col.data_type.includes('DOUBLE') || col.data_type.includes('FLOAT')) {
            propInfo.type = 'numeric';
            
            const statsResult = await conn.query(`
              SELECT 
                MIN("${col.column_name}") as min_val,
                MAX("${col.column_name}") as max_val,
                COUNT(DISTINCT "${col.column_name}") as unique_count
              FROM "${tableName}"
              WHERE "${col.column_name}" IS NOT NULL
            `);
            
            const stats = statsResult.toArray()[0];
            propInfo.min = stats.min_val;
            propInfo.max = stats.max_val;
            propInfo.uniqueCount = stats.unique_count;
          } else {
            propInfo.type = 'string';
            
            const valuesResult = await conn.query(`
              SELECT DISTINCT "${col.column_name}" as value
              FROM "${tableName}"
              WHERE "${col.column_name}" IS NOT NULL
              LIMIT 20
            `);
            
            propInfo.sampleValues = valuesResult.toArray().map(row => row.value);
            propInfo.uniqueCount = propInfo.sampleValues.length;
          }
        } catch (e) {
          console.warn(`Could not analyze column ${col.column_name}:`, e);
        }
        
        properties.push(propInfo);
      }
    }
    
    return { properties, isGeoJSON };
  } finally {
    await conn.close();
  }
}

/**
 * Generates MapLibre GL expressions for GeoJSON and regular data
 */
function generateExpression(
  request: string,
  properties: PropertyInfo[],
  expressionType: 'filter' | 'paint',
  isGeoJSON: boolean
): { expression: Expression; explanation: string } | { error: string; suggestions: string[]; askUser?: string } {
  const requestLower = request.toLowerCase();
  
  // Helper to create property accessor
  const getPropAccessor = (propName: string, propInfo?: PropertyInfo) => {
    if (isGeoJSON || propInfo?.isFromJSON) {
      // For GeoJSON properties, use nested accessor
      return ["get", propName, ["get", "properties"]];
    }
    return ["get", propName];
  };
  
  // Find properties that might be referenced in the request
  const mentionedProps = properties.filter(prop => {
    const propNameLower = prop.name.toLowerCase();
    const propNameSpaced = prop.name.replace(/[_-]/g, ' ').toLowerCase();
    
    // Check for exact matches or partial matches
    return requestLower.includes(propNameLower) ||
           requestLower.includes(propNameSpaced) ||
           request.includes(prop.name) || // Original case for non-ASCII
           // Special handling for Japanese property names
           (prop.name === '都道府県名' && (requestLower.includes('prefecture') || requestLower.includes('都道府県'))) ||
           (prop.name === '発生年' && requestLower.includes('year')) ||
           (prop.name === '事故等区分' && requestLower.includes('accident type'));
  });
  
  // If no properties mentioned, ask for clarification
  if (mentionedProps.length === 0 && !requestLower.includes('all')) {
    return {
      error: 'No properties identified in your request',
      suggestions: properties.slice(0, 5).map(p => 
        `Use "${p.name}"${p.sampleValues ? ` (e.g., ${p.sampleValues.slice(0, 3).join(', ')})` : ''}`
      ),
      askUser: 'Which property would you like to use for styling?'
    };
  }
  
  // Handle "by prefecture" or similar categorical coloring
  if ((requestLower.includes('by') || requestLower.includes('ごと')) && requestLower.includes('color')) {
    let categoricalProp = mentionedProps.find(p => p.type === 'string' || p.sampleValues);
    
    if (!categoricalProp && requestLower.includes('prefecture')) {
      // Look specifically for prefecture property
      categoricalProp = properties.find(p => 
        p.name === '都道府県名' || p.name.toLowerCase().includes('prefecture')
      );
    }
    
    if (!categoricalProp) {
      return {
        error: 'No categorical property found for coloring',
        suggestions: properties
          .filter(p => p.sampleValues && p.sampleValues.length > 0)
          .slice(0, 3)
          .map(p => `Color by "${p.name}"`),
        askUser: 'Which property should be used for categorical coloring?'
      };
    }
    
    // Generate categorical color expression
    const colors = [
      "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
      "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5",
      "#fdc086", "#beaed4", "#386cb0", "#f0027f", "#bf5b17"
    ];
    
    const expression: Expression = ["case"];
    const values = categoricalProp.sampleValues || [];
    
    values.slice(0, colors.length).forEach((value, index) => {
      expression.push(["==", getPropAccessor(categoricalProp.name, categoricalProp), value]);
      expression.push(colors[index % colors.length]);
    });
    expression.push("#cccccc"); // default color
    
    return {
      expression,
      explanation: `Colors based on ${categoricalProp.name} values`
    };
  }
  
  // Handle gradient/scale requests
  if (requestLower.includes('gradient') || requestLower.includes('scale') || requestLower.includes('heat')) {
    const numericProp = mentionedProps.find(p => p.type === 'numeric') ||
                       properties.find(p => p.type === 'numeric');
    
    if (!numericProp) {
      return {
        error: 'No numeric property found for gradient',
        suggestions: properties
          .filter(p => p.type === 'numeric')
          .map(p => `Create gradient using "${p.name}" (${p.min} to ${p.max})`),
        askUser: 'Which numeric property should be used for the gradient?'
      };
    }
    
    // Determine if it's for color or size
    if (requestLower.includes('size') || requestLower.includes('radius')) {
      return {
        expression: [
          "interpolate",
          ["linear"],
          getPropAccessor(numericProp.name, numericProp),
          numericProp.min || 0, 5,
          numericProp.max || 100, 30
        ],
        explanation: `Size scaled from ${numericProp.min} to ${numericProp.max} using ${numericProp.name}`
      };
    } else {
      // Color gradient
      const colorScheme = requestLower.includes('heat') 
        ? ["rgba(0, 0, 255, 0.5)", "rgba(255, 255, 0, 0.7)", "rgba(255, 0, 0, 1)"]
        : ["#f7fbff", "#6baed6", "#08306b"];
      
      return {
        expression: [
          "interpolate",
          ["linear"],
          getPropAccessor(numericProp.name, numericProp),
          numericProp.min || 0, colorScheme[0],
          (numericProp.min || 0) + ((numericProp.max || 100) - (numericProp.min || 0)) * 0.5, colorScheme[1],
          numericProp.max || 100, colorScheme[2]
        ],
        explanation: `Color gradient based on ${numericProp.name} from ${numericProp.min} to ${numericProp.max}`
      };
    }
  }
  
  // Handle filter expressions
  if (expressionType === 'filter' || requestLower.includes('show') || requestLower.includes('only')) {
    const prop = mentionedProps[0];
    
    if (!prop) {
      return {
        error: 'No property specified for filtering',
        suggestions: properties.slice(0, 5).map(p => `Filter by ${p.name}`),
        askUser: 'Which property should be used for filtering?'
      };
    }
    
    // Extract value from request
    const valueMatch = request.match(/(?:is|equals?|=|が|は)\s*['"]?([^'"]+)['"]?/i);
    
    if (!valueMatch) {
      return {
        error: `No value specified for filtering by ${prop.name}`,
        suggestions: prop.sampleValues 
          ? prop.sampleValues.slice(0, 5).map(v => `Show only where ${prop.name} is "${v}"`)
          : [`Specify a value for ${prop.name}`],
        askUser: `What value of ${prop.name} would you like to filter for?`
      };
    }
    
    return {
      expression: ["==", getPropAccessor(prop.name, prop), valueMatch[1]],
      explanation: `Show only features where ${prop.name} equals "${valueMatch[1]}"`
    };
  }
  
  return {
    error: 'Could not understand the styling request',
    suggestions: [
      'Try: "color by prefecture"',
      'Try: "size by accident count"',
      'Try: "show only Tokyo"',
      'Try: "gradient based on year"'
    ],
    askUser: 'What kind of styling would you like to apply?'
  };
}

export const mapExpressionTool = tool({
  description: `Generate and apply MapLibre GL conditional expressions for map styling.

This tool works with both regular tables and GeoJSON data to create:
- Categorical coloring (e.g., "color by prefecture")
- Gradient/interpolated styling (e.g., "gradient by population")
- Size scaling (e.g., "size by accident count")
- Filters (e.g., "show only Tokyo")

For GeoJSON data, it automatically handles nested properties.
When unclear, it will ask for user guidance.`,

  parameters: z.object({
    layerId: z.string().describe('The layer ID to apply styling to (or "auto" to detect)'),
    datasetId: z.string().describe('The dataset/table name to analyze'),
    styleRequest: z.string().describe('Natural language description of desired styling'),
    property: z.enum(['circle-color', 'circle-radius', 'circle-opacity', 'fill-color', 'fill-opacity', 'line-color', 'line-width', 'line-opacity', 'filter'])
      .describe('The style property to modify')
  }),

  execute: async ({ layerId, datasetId, styleRequest, property }) => {
    const state = store.getState();
    const { connection: db } = state.duckdb;
    const { styleManager } = state.map;
    
    if (!db) {
      return { error: 'Database connection not available' };
    }
    
    if (!styleManager) {
      return { error: 'Map style manager not available' };
    }
    
    try {
      // Analyze table properties
      const { properties, isGeoJSON } = await analyzeTableProperties(db, datasetId);
      
      if (properties.length === 0) {
        return { 
          error: 'No properties found in the dataset',
          suggestion: 'Please check that the table exists and has data'
        };
      }
      
      // Generate expression
      const expressionType = property === 'filter' ? 'filter' : 'paint';
      const result = generateExpression(styleRequest, properties, expressionType, isGeoJSON);
      
      if ('error' in result) {
        // Return error with guidance
        return {
          error: result.error,
          suggestions: result.suggestions,
          availableProperties: properties.map(p => ({
            name: p.name,
            type: p.type,
            ...(p.sampleValues ? { sampleValues: p.sampleValues.slice(0, 5) } : {}),
            ...(p.min !== undefined ? { range: [p.min, p.max] } : {})
          })),
          askUser: result.askUser,
          needsUserInput: true
        };
      }
      
      // Apply the expression
      let finalLayerId = layerId;
      
      if (layerId === 'auto') {
        // Auto-detect layer based on data type
        const layerIds = styleManager.getLayerIds();
        const candidates = layerIds.filter((id: string) => {
          // For GeoJSON, prefer geojson layers
          if (isGeoJSON && id.includes('geojson')) return true;
          // For DuckDB data, prefer duckdb layers
          if (!isGeoJSON && id.includes('duckdb')) return true;
          // Fallback to any point/polygon/line layer
          return id.includes('point') || id.includes('circle') || 
                 id.includes('polygon') || id.includes('fill') ||
                 id.includes('line');
        });
        
        if (candidates.length === 0) {
          return { 
            error: 'No suitable layers found on the map',
            suggestion: 'Please create a layer for this dataset first using the layer tools'
          };
        }
        
        finalLayerId = candidates[0];
      }
      
      // Apply the style
      const update: any = {
        type: property === 'filter' ? 'layer-filter' : 'layer-paint',
        layerId: finalLayerId,
        properties: property === 'filter' ? undefined : { [property]: result.expression },
        filter: property === 'filter' ? result.expression : undefined
      };
      
      const updateResult = styleManager.applyStyleUpdate(update);
      
      if (!updateResult) {
        return { 
          error: 'Failed to apply style update',
          suggestion: 'Please check that the layer exists and is visible'
        };
      }
      
      return {
        success: true,
        message: `Applied ${property} expression to layer ${finalLayerId}`,
        expression: result.expression,
        explanation: result.explanation,
        affectedLayer: finalLayerId,
        dataType: isGeoJSON ? 'GeoJSON' : 'Table',
        hint: isGeoJSON 
          ? 'Expression uses nested property access for GeoJSON data'
          : 'Expression uses direct column access'
      };
      
    } catch (error) {
      return {
        error: `Failed to generate expression: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Please check the table name and try again'
      };
    }
  }
});