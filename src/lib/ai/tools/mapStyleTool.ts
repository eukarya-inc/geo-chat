import { tool } from 'ai';
import { z } from 'zod';
import { validateStyleMin, v8 } from '@maplibre/maplibre-gl-style-spec';
import type { TableStyle, VectorTileLayer } from '../../../components/map';
import type { MapSpec } from '../../../store/remoteAtoms';
import type { DBContext } from '../../duckdb/dbContext';
import { fixMaplibreExpressionWithWarnings } from '../../../components/map/utils/maplibreExpressionFixer';

export function createMapStyleTool(
  getMapSpec: (tableName: string) => MapSpec | undefined,
  onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>,
  dbContext?: DBContext | null,
  schema?: string | null
) {
  if (!onMapStyleUpdate) return null;
  return tool({
    description: `Update map styles for a specific table and geometry type.

IMPORTANT: JSON SYNTAX REQUIREMENTS
- When passing style_properties as a JSON string, use PURE JSON only
- NO COMMENTS allowed (no // or /* */ comments)
- NO TRAILING COMMAS before } or ]
- Must be valid JSON syntax

IMPORTANT: MAP VISUALIZATION REQUIREMENTS
- A table MUST have a geometry column to be displayed on a map
- Without a geometry column, the table cannot be visualized on a map, regardless of styling
- Common geometry column names: geom, geometry
- If a table lacks geometry, you need to either:
  1. Add a geometry column using ST_Point(longitude, latitude) or similar spatial functions
  2. Join with another table that has geometry data
  3. Create a new table with geometry from coordinate columns

DETERMINING GEOMETRY TYPE - CRITICAL FOR CORRECT VISUALIZATION:
Before using this tool, you MUST check the actual geometry type in the data using SQL:

-- Check geometry type for a table
SELECT ST_GeometryType(geometry_column) as geom_type, COUNT(*) as count
FROM your_table
GROUP BY ST_GeometryType(geometry_column);

Common geometry type values from ST_GeometryType():
- 'POINT' -> use geometry_type: 'point'
- 'LINESTRING' -> use geometry_type: 'line'
- 'POLYGON' -> use geometry_type: 'polygon'
- 'MULTIPOINT' -> use geometry_type: 'point'
- 'MULTILINESTRING' -> use geometry_type: 'line'
- 'MULTIPOLYGON' -> use geometry_type: 'polygon'

GEOMETRY TYPE PARAMETER MAPPING:
- point: For POINT and MULTIPOINT features (renders as circles on map)
- line: For LINESTRING and MULTILINESTRING features (renders as lines on map)
- polygon: For POLYGON and MULTIPOLYGON features (renders as filled areas with outlines)

IMPORTANT: The geometry_type parameter determines which map layers are styled:
- Choosing 'point' when data is actually polygons = no visual change
- Choosing 'polygon' when data is actually points = no visual change
- You MUST match the geometry_type to the actual data type!

STYLE PROPERTIES:
- point: circle-color, circle-radius, circle-stroke-width, circle-stroke-color, circle-opacity
- line: line-color, line-width, line-opacity
- polygon: fill-color, fill-opacity, fill-outline-color (outline is automatically styled to match)

style_properties parameter:
- Can be passed as either a JavaScript object or a JSON string
- ✅ CORRECT: style_properties: { "fill-color": "#ff0000", "fill-opacity": 0.5 }
- ✅ ALSO CORRECT: style_properties: '{"fill-color": "#ff0000", "fill-opacity": 0.5}'
- Both formats are automatically handled

IMPORTANT: JSON SYNTAX RULES
- NO COMMENTS ALLOWED in JSON strings (no // or /* */ comments)
- NO TRAILING COMMAS allowed before } or ]
- Must be valid, pure JSON when passed as a string
- ❌ WRONG: '{"color": "#ff0000", // this is red}' - comments break JSON parsing
- ❌ WRONG: '{"color": "#ff0000",}' - trailing comma breaks JSON parsing
- ✅ CORRECT: '{"color": "#ff0000"}' - pure, valid JSON

CONDITIONAL STYLING WITH MAPLIBRE GL EXPRESSIONS:
You can create conditional styles using MapLibre GL expression syntax:
- Basic conditional: ["case", ["<", ["get", "property"], 100], "red", "blue"]
- Multi-condition: ["case", ["<", ["get", "pop"], 1000], "#fee", ["<", ["get", "pop"], 10000], "#fcc", "#f00"]
- Categorical: ["case", ["==", ["get", "type"], "urban"], "red", ["==", ["get", "type"], "rural"], "green", "gray"]
- Interpolated: ["interpolate", ["linear"], ["get", "value"], 0, "blue", 100, "red"]

ACCESSING NESTED PROPERTIES:
For nested/structured data (STRUCT columns), use nested ["get"] expressions:
- Nested property: ["get", "field", ["get", "nested_struct"]]
- Deeply nested: ["get", "subfield", ["get", "field", ["get", "parent_struct"]]]
- Example: ["get", "value", ["get", "metadata"]] accesses metadata.value
- Example: ["get", "count", ["get", "stats", ["get", "analysis"]]] accesses analysis.stats.count

IMPORTANT: Do NOT add a third parameter (default value) to nested get expressions!
- WRONG: ["get", "field", ["get", "struct", 0]] - This will cause an error
- RIGHT: ["get", "field", ["get", "struct"]]
- For default values, use coalesce: ["coalesce", ["get", "field", ["get", "struct"]], 0]

WORKING WITH ARRAYS:
MapLibre has limited support for arrays. Use the ["at"] operator to access array elements:
- Access array element: ["at", index, ["get", "array_field"]]
- Example: ["at", 0, ["get", "items"]] gets the first element of items array
- Example: ["at", 2, ["get", "coordinates"]] gets the third coordinate

IMPORTANT LIMITATIONS WITH ARRAYS:
- You CANNOT access properties of array elements directly in MapLibre
- WRONG: ["get", "revenue", ["get", "regions", 0]] - trying to access regions[0].revenue
- WRONG: ["get", "revenue", ["at", 0, ["get", "regions"]]] - still won't work
- Arrays of objects are NOT fully supported for property styling
- Consider flattening your data structure in SQL if you need to style based on array element properties

USING COLUMN STATISTICS FOR OPTIMAL STYLING:
**CRITICAL**: Always check columnStatistics from duckdb_query result to create better visualizations:

For numeric columns with statistics (min, max, p50, p75, p90, p95):
- Use percentile values for balanced color breaks:
  ["interpolate", ["linear"], ["get", "property_name"], 
    min_value, "#fee5d9",    // Light color for minimum
    p50_value, "#fcae91",    // Medium color at median (50% of data below)
    p75_value, "#fc9272",    // Medium-dark at 75th percentile
    p90_value, "#fb6a4a",    // Darker color at 90th percentile
    p95_value, "#de2d26",    // Very dark at 95th percentile
    max_value, "#cb181d"]    // Darkest for maximum values

- For wide ranges (max >> min), consider logarithmic interpolation:
  ["interpolate", ["exponential", 2], ["get", "property_name"], min, "light", max, "dark"]

For categorical columns (check distinctCount):
- Few categories (<10): Use distinct colors
  ["case", ["==", ["get", "category"], "A"], "red", ["==", ["get", "category"], "B"], "blue", "gray"]
- Many categories (>10): Group into broader categories or use graduated colors

Example with statistics:
If columnStatistics shows: population: {min: 1000, max: 500000, p50: 25000, p75: 50000, p90: 100000, p95: 200000}
Use: ["interpolate", ["linear"], ["get", "population"], 
       1000, "#ffffcc", 25000, "#feb24c", 50000, "#fd8d3c", 100000, "#f03b20", 200000, "#bd0026", 500000, "#7f0000"]

COMMON GEOMETRY TYPE SCENARIOS:

1. Prefecture/state boundaries, administrative regions -> geometry_type: 'polygon'
2. Store locations, POIs, coordinates -> geometry_type: 'point'  
3. Roads, rivers, railways -> geometry_type: 'line'
4. Building footprints, land parcels -> geometry_type: 'polygon'
5. GPS tracks, flight paths -> geometry_type: 'line'
6. Earthquake epicenters, weather stations -> geometry_type: 'point'

EXAMPLES OF CORRECT TOOL CALLS:

// Example 1: Styling prefecture polygons (都道府県)
{
  "table_name": "prefectures",
  "geometry_type": "polygon",  // CORRECT: prefectures are polygons
  "style_properties": {
    "fill-color": ["case", [">", ["get", "population"], 5000000], "#ff0000", "#ffff00"],
    "fill-opacity": 0.7
  },
  "description": "Color prefectures by population"
}

// Example 2: Styling store locations (points created from coordinates)
{
  "table_name": "stores",
  "geometry_type": "point",  // CORRECT: store locations are points
  "style_properties": {
    "circle-radius": ["case", [">", ["get", "sales"], 1000000], 10, 5],
    "circle-color": "#3388ff"
  },
  "description": "Size stores by sales volume"
}

// Example 3: Styling road network
{
  "table_name": "roads",
  "geometry_type": "line",  // CORRECT: roads are lines
  "style_properties": {
    "line-width": ["case", ["==", ["get", "type"], "highway"], 3, 1],
    "line-color": "#333333"
  },
  "description": "Style roads by type"
}

NOTE: Both formats are accepted - objects and JSON strings are handled automatically!

For nested properties in conditions:
["case", [">", ["get", "value", ["get", "metrics"]], 100], "red", "blue"] - colors based on metrics.value > 100

Common style properties by layer type:
- polygon: fill-color, fill-opacity, fill-outline-color
- line: line-color, line-width, line-opacity
- point: circle-color, circle-radius, circle-stroke-width, circle-stroke-color
- heatmap: heatmap-radius, heatmap-weight, heatmap-intensity, heatmap-color
- grid: (custom grid properties)

To show/hide layers, include a visibility property in the style.`,

    parameters: z.object({
      table_name: z.string()
        .describe('Name of the table to update styles for'),
      geometry_type: z.enum(['point', 'line', 'polygon'])
        .describe('CRITICAL: Must match actual geometry type! Use SQL to check: SELECT ST_GeometryType(geom) FROM table. For POINT/MULTIPOINT use "point", for LINESTRING/MULTILINESTRING use "line", for POLYGON/MULTIPOLYGON use "polygon"'),
      style_properties: z.union([
        z.record(z.any()),
        z.string().transform((str) => {
          try {
            // Remove single-line comments (// ...) and multi-line comments (/* ... */)
            const cleanedStr = str
              .replace(/\/\/.*$/gm, '') // Remove single-line comments
              .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
              .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas before } or ]
            
            return JSON.parse(cleanedStr);
          } catch (error) {
            console.error('Failed to parse style_properties JSON:', str);
            console.error('Parse error:', error);
            throw new Error(`Invalid JSON string for style_properties: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        })
      ])
        .describe('Style properties as a JavaScript object or JSON string. If using JSON string, must be pure valid JSON with NO comments and NO trailing commas'),
      description: z.string()
        .describe('Human-readable description of what this style change does')
    }),

    execute: async ({ table_name, geometry_type, style_properties, description }) => {
      try {
        // Get current map spec to check existing styles
        const mapSpec = getMapSpec(table_name);

        // Check if table has geometry column using DESCRIBE
        if (dbContext) {
          try {
            const describeQuery = schema 
              ? `DESCRIBE ${schema}.${table_name}`
              : `DESCRIBE ${table_name}`;
            
            const schemaResult = await dbContext.executeQuery(describeQuery, schema);
            
            if (schemaResult && schemaResult.length > 0) {
              // Check for geometry columns
              const hasGeometry = schemaResult.some((row: Record<string, unknown>) => {
                const columnType = String(row.column_type || row.type || '');
                return columnType.toUpperCase() === 'GEOMETRY';
              });

              if (!hasGeometry) {
                const columnInfo = schemaResult.map((row: Record<string, unknown>) => 
                  `${row.column_name || row.name} (${row.column_type || row.type})`
                ).join(', ');

                return {
                  success: false,
                  error: `Table '${table_name}' has no geometry column and cannot be displayed on the map. To visualize this table, you need to either:
1. Create a new table with geometry using ST_Point(longitude, latitude) or similar spatial functions
2. Join with another table that has geometry data
3. Use the original table that has geometry instead of flattened/aggregated versions

Available columns in '${table_name}': ${columnInfo}`
                };
              }
            }
          } catch (describeError) {
            // If DESCRIBE fails, table might not exist
            return {
              success: false,
              error: `Table '${table_name}' not found or cannot be accessed: ${describeError instanceof Error ? describeError.message : 'Unknown error'}`
            };
          }
        }

        // Parse JSON string if needed (though the transform should handle this)
        let parsedStyleProperties = style_properties;
        if (typeof style_properties === 'string') {
          try {
            // Clean up JSON with comments before parsing
            const cleanedStr = style_properties
              .replace(/\/\/.*$/gm, '') // Remove single-line comments
              .replace(/\/\*[\s\S]*?\*\//g, '') // Remove multi-line comments
              .replace(/,(\s*[}\]])/g, '$1'); // Remove trailing commas
            parsedStyleProperties = JSON.parse(cleanedStr);
          } catch {
            console.error('Failed to parse style_properties in execute:', style_properties);
            // If parsing fails, use as-is (shouldn't happen with the transform)
            parsedStyleProperties = style_properties;
          }
        }

        // Generate layer IDs based on geometry type
        const layerIds = {
          point: [`duckdb-points-${table_name}`],
          line: [`duckdb-lines-${table_name}`],
          polygon: [`duckdb-polygons-${table_name}`, `duckdb-polygon-outlines-${table_name}`]
        };
        
        // Get current table styles (array of layers)
        const currentTableStyles = mapSpec?.tableStyles || {};
        const currentLayers = currentTableStyles[table_name] || [];
        

        // Helper function to safely extract color for outline from style properties
        const getOutlineColor = (props: Record<string, unknown>): unknown => {
          // If fill-outline-color is explicitly provided, use it
          if (props['fill-outline-color']) {
            return props['fill-outline-color'];
          }
          
          // If fill-color is provided
          if (props['fill-color']) {
            // If it's a simple color string, use it
            if (typeof props['fill-color'] === 'string') {
              return props['fill-color'];
            }
            // If it's an array (MapLibre expression), check if it's valid for line-color
            // For complex expressions, we should create a separate line-color expression
            // or fall back to a default color to avoid validation errors
            if (Array.isArray(props['fill-color'])) {
              // Don't directly reuse fill-color expressions for line-color
              // as they might have incompatible nested structures
              console.warn('Complex fill-color expression detected, using default outline color');
              return '#000000';
            }
          }
          
          return '#000000';
        };
        
        // Fix any malformed expressions in style_properties using the imported helper
        const allWarnings: string[] = [];
        const syntaxErrors: string[] = [];
        
        // Validate each style property
        const validateStyleProperty = (layerType: string, propName: string, propValue: unknown): void => {
          try {
            const errors = validateStyleMin.paintProperty(layerType, propName, propValue, v8);
            if (errors && errors.length > 0) {
              errors.forEach(error => {
                // Check if this is a critical syntax error
                const errorMessage = error.message.toLowerCase();
                if (errorMessage.includes('unknown property') ||
                    errorMessage.includes('invalid type') ||
                    errorMessage.includes('expected') ||
                    errorMessage.includes('must be') ||
                    errorMessage.includes('cannot')) {
                  syntaxErrors.push(`${propName}: ${error.message}`);
                } else {
                  allWarnings.push(`Style validation: ${propName}: ${error.message}`);
                }
              });
            }
          } catch (e) {
            // If validation itself fails, it might be because the property doesn't apply to this layer type
            // In that case, we'll let MapLibre handle it at runtime
            console.warn(`Validation check skipped for ${propName}:`, e);
          }
        };
        
        // Map geometry type to MapLibre layer type for validation
        const mapLibreLayerType = geometry_type === 'point' ? 'circle' : 
                                  geometry_type === 'line' ? 'line' : 'fill';
        
        // Fix expressions and validate
        const fixedStyleProperties = Object.fromEntries(
          Object.entries(parsedStyleProperties).map(([key, value]) => {
            const result = fixMaplibreExpressionWithWarnings(value);
            if (result.warnings.length > 0) {
              result.warnings.forEach(warning => {
                allWarnings.push(`${key}: ${warning}` as string);
              });
            }
            
            // Validate the fixed property
            validateStyleProperty(mapLibreLayerType, key, result.fixed);
            
            return [key, result.fixed];
          })
        );
        
        // If there are syntax errors, return error immediately
        if (syntaxErrors.length > 0) {
          return {
            success: false,
            error: `Style validation failed:\n${syntaxErrors.join('\n')}`,
            warnings: allWarnings.length > 0 ? allWarnings : undefined
          };
        }

        const targetLayerIds = layerIds[geometry_type];
        
        // Update existing layers or create new ones
        const updatedLayers = [...currentLayers];
        
        targetLayerIds.forEach(layerId => {
          const existingLayerIndex = updatedLayers.findIndex((l: VectorTileLayer) => l.id === layerId);
          
          if (existingLayerIndex >= 0) {
            // Update existing layer
            const existingLayer = updatedLayers[existingLayerIndex];
            
            // Determine the layer type and appropriate properties
            let paint: Record<string, unknown> = {};
            
            if (layerId.includes('polygon-outlines')) {
              // For polygon outlines, derive line properties from fill properties safely
              const existingPaint = existingLayer.paint as Record<string, unknown>;
              const outlineColor = getOutlineColor(fixedStyleProperties);
              paint = {
                'line-color': outlineColor || existingPaint?.['line-color'] || '#000000',
                'line-width': fixedStyleProperties['line-width'] || 1,
                'line-opacity': fixedStyleProperties['line-opacity'] || 0.8
              };
            } else if (layerId.includes('polygons')) {
              // For polygon fills - only apply fill-specific properties
              const existingPaint = existingLayer.paint as Record<string, unknown>;
              paint = {};
              if (fixedStyleProperties['fill-color'] !== undefined) {
                paint['fill-color'] = fixedStyleProperties['fill-color'];
              } else if (existingPaint?.['fill-color']) {
                paint['fill-color'] = existingPaint['fill-color'];
              }
              if (fixedStyleProperties['fill-opacity'] !== undefined) {
                paint['fill-opacity'] = fixedStyleProperties['fill-opacity'];
              } else if (existingPaint?.['fill-opacity']) {
                paint['fill-opacity'] = existingPaint['fill-opacity'];
              }
            } else if (layerId.includes('lines')) {
              // For lines - apply line properties
              paint = fixedStyleProperties;
            } else if (layerId.includes('points')) {
              // For points - apply circle properties
              paint = fixedStyleProperties;
            }
            
            // Validate the complete layer before updating
            const updatedLayer = {
              ...existingLayer,
              paint: { ...existingLayer.paint, ...paint }
            };
            
            // Validate the layer structure
            try {
              const layerErrors = validateStyleMin.layer(updatedLayer as unknown, v8);
              if (layerErrors && layerErrors.length > 0) {
                const criticalErrors: string[] = [];
                layerErrors.forEach(error => {
                  const errorMessage = error.message.toLowerCase();
                  if (errorMessage.includes('unknown') ||
                      errorMessage.includes('invalid') ||
                      errorMessage.includes('required')) {
                    criticalErrors.push(error.message);
                  } else {
                    allWarnings.push(`Layer validation: ${error.message}`);
                  }
                });
                
                if (criticalErrors.length > 0) {
                  return {
                    success: false,
                    error: `Layer validation failed:\n${criticalErrors.join('\n')}`,
                    warnings: allWarnings.length > 0 ? allWarnings : undefined
                  };
                }
              }
            } catch (e) {
              console.error('Layer validation failed:', e);
              return {
                success: false,
                error: `Layer validation failed: Invalid layer structure`,
                warnings: allWarnings.length > 0 ? allWarnings : undefined
              };
            }
            
            updatedLayers[existingLayerIndex] = updatedLayer;
          } else {
            // Create new layer if it doesn't exist
            let newLayer: VectorTileLayer | undefined;
            
            if (layerId.includes('polygon-outlines')) {
              // For polygon outlines - use safe outline color extraction
              const outlineColor = getOutlineColor(fixedStyleProperties);
              newLayer = {
                id: layerId,
                type: 'line',
                paint: {
                  'line-color': outlineColor as string,
                  'line-width': (fixedStyleProperties['line-width'] || 1) as number,
                  'line-opacity': (fixedStyleProperties['line-opacity'] || 0.8) as number
                }
              };
            } else if (layerId.includes('polygons')) {
              // For polygon fills
              newLayer = {
                id: layerId,
                type: 'fill',
                paint: {
                  'fill-color': (fixedStyleProperties['fill-color'] || '#3388ff') as string,
                  'fill-opacity': (fixedStyleProperties['fill-opacity'] ?? 0.3) as number
                }
              };
            } else if (layerId.includes('lines')) {
              // For lines
              newLayer = {
                id: layerId,
                type: 'line',
                paint: fixedStyleProperties
              };
            } else if (layerId.includes('points')) {
              // For points (use circle type)
              newLayer = {
                id: layerId,
                type: 'circle',
                paint: fixedStyleProperties
              };
            }
            
            if (newLayer) {
              // Validate the new layer before adding
              try {
                const layerErrors = validateStyleMin.layer(newLayer as unknown, v8);
                if (layerErrors && layerErrors.length > 0) {
                  const criticalErrors: string[] = [];
                  layerErrors.forEach(error => {
                    const errorMessage = error.message.toLowerCase();
                    if (errorMessage.includes('unknown') ||
                        errorMessage.includes('invalid') ||
                        errorMessage.includes('required')) {
                      criticalErrors.push(error.message);
                    } else {
                      allWarnings.push(`New layer validation: ${error.message}`);
                    }
                  });
                  
                  if (criticalErrors.length > 0) {
                    return {
                      success: false,
                      error: `New layer validation failed:\n${criticalErrors.join('\n')}`,
                      warnings: allWarnings.length > 0 ? allWarnings : undefined
                    };
                  }
                }
              } catch (e) {
                console.error('New layer validation failed:', e);
                return {
                  success: false,
                  error: `New layer validation failed: Invalid layer structure`,
                  warnings: allWarnings.length > 0 ? allWarnings : undefined
                };
              }
              
              updatedLayers.push(newLayer);
            }
          }
        });

        // Apply the update through callback
        await onMapStyleUpdate(table_name, updatedLayers);

        return {
          success: true,
          message: `${description} (Applied to table: ${table_name}, geometry: ${geometry_type})`,
          appliedUpdate: {
            tableName: table_name,
            geometryType: geometry_type,
            layers: updatedLayers
          },
          warnings: allWarnings.length > 0 ? allWarnings : undefined
        };
      } catch (error) {
        return {
          success: false,
          error: `Error applying style update: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    }
  });
}