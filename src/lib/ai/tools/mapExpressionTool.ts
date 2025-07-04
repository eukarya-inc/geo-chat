import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { MapStyleManager } from '../../../utils/mapStyleManager';
import { store } from '../../../store';
import { getBestTableForViz, getVizColumns } from './vizAwareTool';

// MapLibre GL expression types
type Expression = any[];

interface PropertyInfo {
  name: string;
  type: string;
  sampleValues?: any[];
  uniqueCount?: number;
  min?: number;
  max?: number;
}

/**
 * Analyzes table schema and data to understand available properties
 */
async function analyzeLayerProperties(
  db: AsyncDuckDB,
  tableName: string
): Promise<PropertyInfo[]> {
  const conn = await db.connect();
  
  try {
    // Check for viz table
    const { tableName: bestTable, isVizTable } = await getBestTableForViz(db, tableName);
    const vizColumns = await getVizColumns(db, tableName);
    
    const properties: PropertyInfo[] = [];
    
    // Get column information
    const schemaResult = await conn.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = '${bestTable}'
      ORDER BY ordinal_position
    `);
    
    const columns = schemaResult.toArray();
    
    // Analyze each column
    for (const col of columns) {
      const propInfo: PropertyInfo = {
        name: col.column_name,
        type: col.data_type
      };
      
      // Skip geometry columns
      if (col.data_type.toLowerCase().includes('geometry')) {
        continue;
      }
      
      // Get sample values and statistics
      try {
        if (col.data_type.includes('INT') || col.data_type.includes('DOUBLE') || col.data_type.includes('FLOAT')) {
          // Numeric column - get min/max
          const statsResult = await conn.query(`
            SELECT 
              MIN("${col.column_name}") as min_val,
              MAX("${col.column_name}") as max_val,
              COUNT(DISTINCT "${col.column_name}") as unique_count
            FROM "${bestTable}"
            WHERE "${col.column_name}" IS NOT NULL
          `);
          
          const stats = statsResult.toArray()[0];
          propInfo.min = stats.min_val;
          propInfo.max = stats.max_val;
          propInfo.uniqueCount = stats.unique_count;
          
        } else {
          // Text/categorical - get unique values (up to 20)
          const valuesResult = await conn.query(`
            SELECT DISTINCT "${col.column_name}" as value
            FROM "${bestTable}"
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
    
    return properties;
  } finally {
    await conn.close();
  }
}

/**
 * Generates MapLibre GL expressions based on natural language descriptions
 */
function generateExpression(
  request: string,
  properties: PropertyInfo[],
  expressionType: 'filter' | 'paint',
  isGeoJSON: boolean = false
): { expression: Expression; explanation: string } | { error: string; suggestions: string[] } {
  const requestLower = request.toLowerCase();
  
  // Helper to create property accessor
  const getPropAccessor = (propName: string) => {
    if (isGeoJSON) {
      // For GeoJSON, properties are nested
      return ["get", propName, ["get", "properties"]];
    }
    return ["get", propName];
  };
  
  // Find relevant properties mentioned in the request
  const mentionedProps = properties.filter(prop => {
    const propNameLower = prop.name.toLowerCase();
    const propNameSpaced = prop.name.replace(/_/g, ' ').toLowerCase();
    
    // Also check for Japanese property names
    return requestLower.includes(propNameLower) ||
           requestLower.includes(propNameSpaced) ||
           request.includes(prop.name); // Check original case for Japanese
  });
  
  // Color gradient expressions
  if (requestLower.includes('gradient') || requestLower.includes('scale')) {
    const numericProp = mentionedProps.find(p => 
      p.type.includes('INT') || p.type.includes('DOUBLE') || p.type.includes('FLOAT')
    ) || properties.find(p => 
      p.type.includes('INT') || p.type.includes('DOUBLE') || p.type.includes('FLOAT')
    );
    
    if (!numericProp) {
      return {
        error: 'No numeric property found for gradient',
        suggestions: ['Please specify a numeric field for the gradient']
      };
    }
    
    if (requestLower.includes('color')) {
      return {
        expression: [
          "interpolate",
          ["linear"],
          ["get", numericProp.name],
          numericProp.min || 0, "#f7fbff",
          (numericProp.min || 0) + ((numericProp.max || 100) - (numericProp.min || 0)) * 0.25, "#c6dbef",
          (numericProp.min || 0) + ((numericProp.max || 100) - (numericProp.min || 0)) * 0.5, "#6baed6",
          (numericProp.min || 0) + ((numericProp.max || 100) - (numericProp.min || 0)) * 0.75, "#2171b5",
          numericProp.max || 100, "#08306b"
        ],
        explanation: `Color gradient based on ${numericProp.name} from ${numericProp.min} to ${numericProp.max}`
      };
    } else if (requestLower.includes('size') || requestLower.includes('radius')) {
      return {
        expression: [
          "interpolate",
          ["linear"],
          ["get", numericProp.name],
          numericProp.min || 0, 5,
          numericProp.max || 100, 20
        ],
        explanation: `Size scaled based on ${numericProp.name} from ${numericProp.min} to ${numericProp.max}`
      };
    }
  }
  
  // Categorical color expressions
  if (requestLower.includes('color') && requestLower.includes('by')) {
    const categoricalProp = mentionedProps.find(p => 
      p.sampleValues && p.sampleValues.length > 0
    );
    
    if (!categoricalProp) {
      return {
        error: 'No categorical property found',
        suggestions: properties
          .filter(p => p.sampleValues && p.sampleValues.length > 0)
          .map(p => `Use "${p.name}" with values like: ${p.sampleValues?.slice(0, 3).join(', ')}`)
      };
    }
    
    // Generate colors for categories
    const colors = [
      "#e41a1c", "#377eb8", "#4daf4a", "#984ea3", "#ff7f00",
      "#ffff33", "#a65628", "#f781bf", "#999999", "#66c2a5"
    ];
    
    const expression: Expression = ["case"];
    categoricalProp.sampleValues?.slice(0, colors.length).forEach((value, index) => {
      expression.push(["==", ["get", categoricalProp.name], value]);
      expression.push(colors[index % colors.length]);
    });
    expression.push("#cccccc"); // default color
    
    return {
      expression,
      explanation: `Colors based on ${categoricalProp.name} categories`
    };
  }
  
  // Filter expressions
  if (expressionType === 'filter' || requestLower.includes('show') || requestLower.includes('hide') || requestLower.includes('filter')) {
    // Equal condition
    if (requestLower.includes('equal') || requestLower.includes('is') || requestLower.includes('=')) {
      const prop = mentionedProps[0];
      if (!prop) {
        return {
          error: 'No property specified for filtering',
          suggestions: properties.map(p => `Filter by ${p.name}`)
        };
      }
      
      // Extract value from request
      const valueMatch = request.match(/(?:is|equals?|=)\s*['"]?([^'"]+)['"]?/i);
      if (!valueMatch) {
        return {
          error: 'No value specified for filtering',
          suggestions: prop.sampleValues 
            ? [`Try: "where ${prop.name} is ${prop.sampleValues[0]}"`]
            : [`Specify a value for ${prop.name}`]
        };
      }
      
      return {
        expression: ["==", ["get", prop.name], valueMatch[1]],
        explanation: `Show only where ${prop.name} equals "${valueMatch[1]}"`
      };
    }
    
    // Range conditions
    if (requestLower.includes('between') || requestLower.includes('range')) {
      const numericProp = mentionedProps.find(p => 
        p.type.includes('INT') || p.type.includes('DOUBLE') || p.type.includes('FLOAT')
      );
      
      if (!numericProp) {
        return {
          error: 'No numeric property found for range filter',
          suggestions: properties
            .filter(p => p.type.includes('INT') || p.type.includes('DOUBLE') || p.type.includes('FLOAT'))
            .map(p => `Filter ${p.name} between ${p.min} and ${p.max}`)
        };
      }
      
      const numbers = request.match(/\d+/g)?.map(Number);
      if (!numbers || numbers.length < 2) {
        return {
          error: 'Please specify two numbers for the range',
          suggestions: [`Try: "${numericProp.name} between ${numericProp.min} and ${numericProp.max}"`]
        };
      }
      
      return {
        expression: [
          "all",
          [">=", ["get", numericProp.name], numbers[0]],
          ["<=", ["get", numericProp.name], numbers[1]]
        ],
        explanation: `Show only where ${numericProp.name} is between ${numbers[0]} and ${numbers[1]}`
      };
    }
  }
  
  // Size by value
  if (requestLower.includes('size') && requestLower.includes('by')) {
    const prop = mentionedProps[0];
    if (!prop) {
      return {
        error: 'No property specified for sizing',
        suggestions: properties.map(p => `Size by ${p.name}`)
      };
    }
    
    if (prop.type.includes('INT') || prop.type.includes('DOUBLE') || prop.type.includes('FLOAT')) {
      return {
        expression: [
          "interpolate",
          ["linear"],
          ["get", prop.name],
          prop.min || 0, 5,
          prop.max || 100, 30
        ],
        explanation: `Size based on ${prop.name} value`
      };
    } else {
      // Categorical sizing
      return {
        expression: [
          "case",
          ["has", prop.name], 10,
          5
        ],
        explanation: `Larger size when ${prop.name} has a value`
      };
    }
  }
  
  // Opacity expressions
  if (requestLower.includes('opacity') || requestLower.includes('transparent')) {
    const prop = mentionedProps[0];
    if (prop && (prop.type.includes('INT') || prop.type.includes('DOUBLE') || prop.type.includes('FLOAT'))) {
      return {
        expression: [
          "interpolate",
          ["linear"],
          ["get", prop.name],
          prop.min || 0, 0.2,
          prop.max || 100, 1
        ],
        explanation: `Opacity based on ${prop.name} value`
      };
    }
  }
  
  // Heat/density color expressions
  if ((requestLower.includes('heat') || requestLower.includes('density')) && requestLower.includes('color')) {
    const numericProp = properties.find(p => 
      (p.type.includes('INT') || p.type.includes('DOUBLE') || p.type.includes('FLOAT')) &&
      (p.name.toLowerCase().includes('count') || p.name.toLowerCase().includes('density') || p.name.toLowerCase().includes('total'))
    ) || properties.find(p => 
      p.type.includes('INT') || p.type.includes('DOUBLE') || p.type.includes('FLOAT')
    );
    
    if (numericProp) {
      return {
        expression: [
          "interpolate",
          ["linear"],
          ["get", numericProp.name],
          numericProp.min || 0, "rgba(0, 0, 255, 0.5)",
          (numericProp.min || 0) + ((numericProp.max || 100) - (numericProp.min || 0)) * 0.5, "rgba(255, 255, 0, 0.7)",
          numericProp.max || 100, "rgba(255, 0, 0, 1)"
        ],
        explanation: `Heat map color based on ${numericProp.name}`
      };
    }
  }
  
  // Multi-condition expressions
  if (requestLower.includes('and') || requestLower.includes('or')) {
    // This is complex - for now return guidance
    return {
      error: 'Complex boolean expressions need more specific syntax',
      suggestions: [
        'For AND conditions: "show where prefecture is Tokyo AND year is 2023"',
        'For OR conditions: "show where prefecture is Tokyo OR prefecture is Osaka"',
        'Use multiple filters for complex logic'
      ]
    };
  }
  
  return {
    error: 'Could not understand the styling request',
    suggestions: [
      'Try: "color by prefecture"',
      'Try: "size by accident_count"',
      'Try: "show only where year is 2023"',
      'Try: "gradient color by population"'
    ]
  };
}

export const mapExpressionTool = tool({
  description: `Generate and apply MapLibre GL conditional expressions for map styling.

This tool can create complex expressions for:
- Color gradients and categorical colors
- Size/radius scaling
- Filters (show/hide features)
- Opacity control
- Complex conditional styling

Examples:
- "Color the points by prefecture"
- "Make a gradient based on population"
- "Show only accidents from 2023"
- "Size points by severity"
- "Make Tokyo red and Osaka blue"`,

  parameters: z.object({
    layerId: z.string().describe('The layer ID to apply styling to (or "auto" to detect)'),
    datasetId: z.string().describe('The dataset/table ID to analyze for properties'),
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
      const properties = await analyzeLayerProperties(db, datasetId);
      
      if (properties.length === 0) {
        return { error: 'No properties found in the dataset' };
      }
      
      // Generate expression
      const expressionType = property === 'filter' ? 'filter' : 'paint';
      const result = generateExpression(styleRequest, properties, expressionType);
      
      if ('error' in result) {
        // Ask user for clarification
        return {
          error: result.error,
          suggestions: result.suggestions,
          availableProperties: properties.map(p => ({
            name: p.name,
            type: p.type,
            ...(p.sampleValues ? { sampleValues: p.sampleValues.slice(0, 5) } : {}),
            ...(p.min !== undefined ? { range: [p.min, p.max] } : {})
          })),
          message: 'Could not generate expression. Please clarify your request.',
          needsUserInput: true
        };
      }
      
      // Apply the expression
      let finalLayerId = layerId;
      
      if (layerId === 'auto') {
        // Auto-detect layer using existing methods
        const layerIds = styleManager.getLayerIds();
        const candidates = layerIds.filter((id: string) => 
          id.includes('point') || id.includes('circle') || 
          id.includes('polygon') || id.includes('fill') ||
          id.includes('line')
        );
        
        if (candidates.length === 0) {
          return { error: 'No suitable layers found on the map' };
        }
        
        finalLayerId = candidates[0];
      }
      
      // Apply the style using the existing update mechanism
      const update: any = {
        type: property === 'filter' ? 'layer-filter' : 'layer-paint',
        layerId: finalLayerId,
        properties: property === 'filter' ? undefined : { [property]: result.expression },
        filter: property === 'filter' ? result.expression : undefined
      };
      
      const updateResult = styleManager.applyStyleUpdate(update);
      
      if (!updateResult) {
        return { error: 'Failed to apply style update' };
      }
      
      return {
        success: true,
        message: `Applied ${property} expression to layer ${finalLayerId}`,
        expression: result.expression,
        explanation: result.explanation,
        affectedLayer: finalLayerId,
        hint: 'You can refine the styling by providing more specific requests'
      };
      
    } catch (error) {
      return {
        error: `Failed to generate expression: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
});

// Helper function to detect common patterns
export function detectStyleIntent(request: string): {
  property?: string;
  operation?: string;
} {
  const lower = request.toLowerCase();
  
  // Detect property
  let property: string | undefined;
  if (lower.includes('color') || lower.includes('colour')) {
    property = lower.includes('line') ? 'line-color' : 
               lower.includes('fill') || lower.includes('polygon') ? 'fill-color' : 
               'circle-color';
  } else if (lower.includes('size') || lower.includes('radius')) {
    property = 'circle-radius';
  } else if (lower.includes('width') && lower.includes('line')) {
    property = 'line-width';
  } else if (lower.includes('opacity') || lower.includes('transparent')) {
    property = lower.includes('line') ? 'line-opacity' :
               lower.includes('fill') ? 'fill-opacity' :
               'circle-opacity';
  } else if (lower.includes('filter') || lower.includes('show') || lower.includes('hide')) {
    property = 'filter';
  }
  
  // Detect operation
  let operation: string | undefined;
  if (lower.includes('gradient') || lower.includes('scale') || lower.includes('interpolate')) {
    operation = 'interpolate';
  } else if (lower.includes('by') || lower.includes('based on') || lower.includes('according to')) {
    operation = 'categorical';
  } else if (lower.includes('equal') || lower.includes('is') || lower.includes('=')) {
    operation = 'equal';
  } else if (lower.includes('between') || lower.includes('range')) {
    operation = 'range';
  }
  
  return { property, operation };
}