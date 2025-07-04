import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

interface ChartConfig {
  tableName: string;
  chartType: 'bar' | 'line' | 'scatter' | 'pie' | 'histogram';
  dimension?: string;  // X-axis or category
  measure?: string;    // Y-axis or value
  aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max';
  colorBy?: string;
  title?: string;
  width?: number;
  height?: number;
}

/**
 * Analyzes table to understand if it's GeoJSON or _viz table and what fields are available
 */
async function analyzeTableForChart(
  db: AsyncDuckDB,
  tableName: string
): Promise<{
  isGeoJSON: boolean;
  isVizTable: boolean;
  fields: Array<{ name: string; type: string; isNested?: boolean }>;
  sampleData: any[];
}> {
  const conn = await db.connect();
  
  try {
    // Get schema
    const schemaResult = await conn.query(`DESCRIBE ${tableName}`);
    const schema = schemaResult.toArray();
    
    // Check if it's a _viz table
    const isVizTable = tableName.endsWith('_viz');
    
    // Check if it's GeoJSON (raw table with properties JSON column)
    const hasProperties = schema.some(col => col.column_name === 'properties' && col.column_type === 'JSON');
    const hasGeom = schema.some(col => col.column_name === 'geom');
    const isGeoJSON = hasProperties && hasGeom && !isVizTable;
    
    // Get sample data
    const sampleResult = await conn.query(`SELECT * FROM ${tableName} LIMIT 5`);
    const sampleData = sampleResult.toArray();
    
    let fields: Array<{ name: string; type: string; isNested?: boolean }> = [];
    
    if (isGeoJSON && sampleData.length > 0) {
      // Extract fields from JSON properties
      const allKeys = new Set<string>();
      
      sampleData.forEach(row => {
        if (row.properties && typeof row.properties === 'object') {
          Object.keys(row.properties).forEach(key => allKeys.add(key));
        }
      });
      
      // Add nested property fields
      allKeys.forEach(key => {
        fields.push({
          name: key,
          type: 'nested',
          isNested: true
        });
      });
      
      // Add top-level fields (except properties and geom)
      schema.forEach(col => {
        if (col.column_name !== 'properties' && col.column_name !== 'geom') {
          fields.push({
            name: col.column_name,
            type: col.column_type,
            isNested: false
          });
        }
      });
    } else {
      // Regular table - use all columns
      fields = schema.map(col => ({
        name: col.column_name,
        type: col.column_type,
        isNested: false
      }));
    }
    
    return { isGeoJSON, isVizTable, fields, sampleData };
  } finally {
    await conn.close();
  }
}

/**
 * Generates SQL that handles regular tables, _viz tables, and GeoJSON data
 */
function generateChartSQL(config: ChartConfig, isGeoJSON: boolean, fields: any[]): string {
  const { tableName, dimension, measure, aggregation = 'count', colorBy } = config;
  
  // Helper to create field accessor
  const getFieldAccessor = (fieldName: string): string => {
    const field = fields.find(f => f.name === fieldName);
    if (field?.isNested) {
      return `properties->>'${fieldName}'`;
    }
    return `"${fieldName}"`;
  };
  
  // Build SELECT clause
  let selectClauses: string[] = [];
  
  if (dimension) {
    selectClauses.push(`${getFieldAccessor(dimension)} as "${dimension}"`);
  }
  
  if (measure && aggregation !== 'count') {
    // For aggregations other than count, we need a numeric field
    const measureAccessor = getFieldAccessor(measure);
    const castMeasure = fields.find(f => f.name === measure)?.isNested 
      ? `TRY_CAST(${measureAccessor} AS DOUBLE)`
      : measureAccessor;
    
    selectClauses.push(`${aggregation.toUpperCase()}(${castMeasure}) as "${measure}"`);
  } else if (aggregation === 'count') {
    selectClauses.push(`COUNT(*) as count`);
  }
  
  if (colorBy && colorBy !== dimension) {
    selectClauses.push(`${getFieldAccessor(colorBy)} as "${colorBy}"`);
  }
  
  // Build the query
  let sql = `SELECT ${selectClauses.join(', ')} FROM ${tableName}`;
  
  // Add WHERE clause to filter nulls
  const whereClauses: string[] = [];
  if (dimension) {
    const dimAccessor = getFieldAccessor(dimension);
    whereClauses.push(`${dimAccessor} IS NOT NULL`);
  }
  
  if (whereClauses.length > 0) {
    sql += ` WHERE ${whereClauses.join(' AND ')}`;
  }
  
  // Add GROUP BY for aggregations
  if (dimension && (aggregation === 'count' || measure)) {
    const groupByClauses = [getFieldAccessor(dimension)];
    if (colorBy && colorBy !== dimension) {
      groupByClauses.push(getFieldAccessor(colorBy));
    }
    sql += ` GROUP BY ${groupByClauses.join(', ')}`;
  }
  
  // Add ORDER BY
  if (dimension) {
    if (aggregation === 'count' || measure) {
      // Order by the aggregate value descending
      sql += ` ORDER BY ${aggregation === 'count' ? 'count' : `"${measure}"`} DESC`;
    } else {
      sql += ` ORDER BY "${dimension}"`;
    }
  }
  
  // Add LIMIT for bar charts to avoid too many categories
  if (config.chartType === 'bar' && !measure) {
    sql += ` LIMIT 20`;
  }
  
  return sql;
}

/**
 * Generates appropriate Vega-Lite specification
 */
function generateVegaSpec(config: ChartConfig, sql: string): any {
  const { chartType, dimension, measure, aggregation = 'count', colorBy, title, width = 400, height = 300 } = config;
  
  const spec: any = {
    $schema: "https://vega.github.io/schema/vega-lite/v5.json",
    title: title || `${chartType.charAt(0).toUpperCase() + chartType.slice(1)} Chart`,
    width,
    height,
    data: { sql },
    config: {
      view: { stroke: null },
      axis: { grid: true }
    }
  };
  
  // Configure mark type
  switch (chartType) {
    case 'bar':
      spec.mark = { type: 'bar', tooltip: true };
      break;
    case 'line':
      spec.mark = { type: 'line', point: true, tooltip: true };
      break;
    case 'scatter':
      spec.mark = { type: 'point', tooltip: true, size: 100 };
      break;
    case 'pie':
      spec.mark = { type: 'arc', innerRadius: 0, tooltip: true };
      break;
    case 'histogram':
      spec.mark = { type: 'bar', tooltip: true };
      break;
  }
  
  // Configure encoding
  spec.encoding = {};
  
  if (chartType === 'pie') {
    spec.encoding.theta = {
      field: aggregation === 'count' ? 'count' : measure,
      type: 'quantitative'
    };
    if (dimension) {
      spec.encoding.color = {
        field: dimension,
        type: 'nominal',
        legend: { title: dimension }
      };
    }
  } else {
    // X-axis
    if (dimension) {
      spec.encoding.x = {
        field: dimension,
        type: chartType === 'line' && dimension.toLowerCase().includes('date') ? 'temporal' : 'nominal',
        axis: { labelAngle: -45 }
      };
    }
    
    // Y-axis
    if (aggregation === 'count') {
      spec.encoding.y = {
        field: 'count',
        type: 'quantitative',
        title: 'Count'
      };
    } else if (measure) {
      spec.encoding.y = {
        field: measure,
        type: 'quantitative',
        title: measure
      };
    }
    
    // Color
    if (colorBy) {
      spec.encoding.color = {
        field: colorBy,
        type: 'nominal',
        legend: { title: colorBy }
      };
    }
  }
  
  return spec;
}

export const smartChartTool = tool({
  description: `Create intelligent charts from any table data, including GeoJSON.

This tool automatically:
- Prefers _viz tables when available (e.g., accidents_viz over accidents)
- Detects if data is GeoJSON and extracts nested properties
- Handles flattened columns in _viz tables directly
- Suggests appropriate chart types based on data
- Handles aggregations intelligently
- Works with Japanese property names

Examples:
- "Show accidents by prefecture in a bar chart" → uses accidents_viz
- "Create a pie chart of accident types"
- "Plot trend over time"`,

  parameters: z.object({
    tableName: z.string().describe('The table to visualize'),
    chartType: z.enum(['bar', 'line', 'scatter', 'pie', 'histogram']).describe('Type of chart'),
    dimension: z.string().optional().describe('The field for grouping/x-axis (e.g., prefecture, date)'),
    measure: z.string().optional().describe('The field to aggregate (leave empty for count)'),
    aggregation: z.enum(['count', 'sum', 'avg', 'min', 'max']).optional().default('count'),
    colorBy: z.string().optional().describe('Field to color by'),
    title: z.string().optional().describe('Chart title'),
    width: z.number().optional().default(400),
    height: z.number().optional().default(300)
  }),

  execute: async (params) => {
    let { tableName } = params;
    
    // Get DB connection from somewhere (you'll need to pass this in)
    const { store } = await import('../../../store');
    const state = store.getState();
    const db = state.duckdb.connection;
    
    if (!db) {
      return { error: 'Database connection not available' };
    }
    
    try {
      // Check if a _viz table exists and prefer it
      const conn = await db.connect();
      let useVizTable = false;
      try {
        const tablesResult = await conn.query('SHOW TABLES');
        const tables = tablesResult.toArray().map(row => row.name || row[0]);
        const vizTableName = `${tableName}_viz`;
        
        if (tables.includes(vizTableName) && !tableName.endsWith('_viz')) {
          tableName = vizTableName;
          useVizTable = true;
        }
      } finally {
        await conn.close();
      }
      
      // Analyze table structure
      const { isGeoJSON, isVizTable, fields, sampleData } = await analyzeTableForChart(db, tableName);
      
      // Validate fields
      if (params.dimension && !fields.find(f => f.name === params.dimension)) {
        return {
          error: `Field "${params.dimension}" not found`,
          availableFields: fields.map(f => f.name),
          suggestion: `Try one of: ${fields.slice(0, 5).map(f => f.name).join(', ')}`
        };
      }
      
      if (params.measure && !fields.find(f => f.name === params.measure)) {
        return {
          error: `Field "${params.measure}" not found`,
          availableFields: fields.map(f => f.name),
          suggestion: `For count, leave measure empty. For other aggregations, use: ${fields.slice(0, 5).map(f => f.name).join(', ')}`
        };
      }
      
      // Generate SQL
      const sql = generateChartSQL(params, isGeoJSON, fields);
      
      // Generate Vega spec
      const vegaSpec = generateVegaSpec(params, sql);
      
      return {
        success: true,
        vegaSpec,
        sql,
        message: `Created ${params.chartType} chart from ${tableName}`,
        dataType: isVizTable ? 'Visualization Table' : (isGeoJSON ? 'GeoJSON' : 'Table'),
        hint: useVizTable ? 'Using preprocessed _viz table for better performance' : 
              (isGeoJSON ? 'Chart uses properties extracted from GeoJSON' : undefined)
      };
      
    } catch (error) {
      return {
        error: `Failed to create chart: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestion: 'Check table name and field names'
      };
    }
  }
});