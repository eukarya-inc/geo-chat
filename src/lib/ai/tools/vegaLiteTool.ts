import { tool } from 'ai';
import { z } from 'zod';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { getDBStateManager } from '../../duckdb/dbStateManagerSingleton';

interface VegaLiteEncoding {
  x?: {
    field?: string;
    type?: string;
    bin?: boolean;
    aggregate?: string;
  };
  y?: {
    field?: string;
    type?: string;
    aggregate?: string;
  };
  color?: {
    field?: string;
    type?: string;
    aggregate?: string;
  };
  size?: {
    field?: string;
    type?: string;
  };
  theta?: {
    field?: string;
    type?: string;
    aggregate?: string;
  };
  tooltip?: Array<{
    field?: string;
    type?: string;
  }>;
}

interface VegaLiteSpec {
  $schema: string;
  title: string;
  width: number;
  height: number;
  data: {
    sql: string;
  };
  config: {
    view: { stroke: null };
    axis: { grid: boolean };
    legend: { orient: string };
  };
  mark?: unknown;
  encoding?: VegaLiteEncoding;
}

export function createVegaLiteTool(db: AsyncDuckDB) {
  const dbStateManager = getDBStateManager();
  return tool({
    description,
    parameters: z.object({
      tableName: z.string().describe('Name of the table to plot data from'),
      plotType: z.enum(['scatter', 'bar', 'line', 'histogram', 'pie', 'heatmap', 'box']).describe('Type of plot to create'),
      xField: z.string().optional().describe('Field for X-axis (required for scatter, line, bar, heatmap)'),
      yField: z.string().optional().describe('Field for Y-axis (required for scatter, line, heatmap)'),
      colorField: z.string().optional().describe('Field for color encoding (optional)'),
      sizeField: z.string().optional().describe('Field for size encoding (optional for scatter plots)'),
      aggregateFunction: z.enum(['count', 'sum', 'mean', 'median', 'min', 'max']).optional().default('count').describe('Aggregation function for bar/pie charts'),
      title: z.string().optional().describe('Title for the plot'),
      width: z.number().optional().default(400).describe('Width of the plot'),
      height: z.number().optional().default(300).describe('Height of the plot'),
      limit: z.number().optional().default(1000).describe('Maximum number of rows to include (default: 1000)')
    }),
    execute: async ({ 
      tableName, 
      plotType, 
      xField, 
      yField, 
      colorField, 
      sizeField, 
      aggregateFunction = 'count',
      title, 
      width = 400, 
      height = 300,
      limit = 1000 
    }) => {
      try {
        console.log('Creating Vega-Lite plot:', { 
          tableName, plotType, xField, yField, colorField, sizeField, 
          aggregateFunction, title, width, height, limit 
        });

        // Force database sync before validation
        console.log(`VegaLite: Starting validation for table ${tableName}`);
        const conn = await db.connect();
        
        try {
          // Force checkpoint to ensure all changes are visible
          try {
            await conn.query('CHECKPOINT;');
            console.log('VegaLite: Checkpoint completed');
          } catch (checkpointError) {
            console.log('VegaLite: Checkpoint failed (non-critical):', checkpointError);
          }
          
          // Simple table validation with retries
          let tableExists = false;
          for (let attempt = 0; attempt < 5; attempt++) {
            try {
              // Also try SHOW TABLES first to see what's available
              if (attempt === 0) {
                const tablesResult = await conn.query('SHOW TABLES;');
                const availableTables: string[] = [];
                for (let i = 0; i < tablesResult.numRows; i++) {
                  availableTables.push(tablesResult.getChildAt(0)?.get(i) as string);
                }
                console.log(`VegaLite: Available tables on attempt ${attempt + 1}:`, availableTables);
              }
              
              await conn.query(`SELECT 1 FROM ${tableName} LIMIT 0`);
              tableExists = true;
              console.log(`VegaLite: Table ${tableName} found on attempt ${attempt + 1}`);
              break;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (error) {
              console.log(`VegaLite: Table ${tableName} not found on attempt ${attempt + 1}, retrying...`);
              if (attempt < 4) {
                // Wait longer between retries and force another checkpoint
                await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
                try {
                  await conn.query('CHECKPOINT;');
                } catch { /* empty */ }
              }
            }
          }
          
          if (!tableExists) {
            // Get available tables for error message
            try {
              const tablesResult = await conn.query('SHOW TABLES;');
              const availableTables: string[] = [];
              for (let i = 0; i < tablesResult.numRows; i++) {
                availableTables.push(tablesResult.getChildAt(0)?.get(i) as string);
              }
              
              const tableList = availableTables.length > 0 ? ` Available tables: ${availableTables.join(', ')}.` : '';
              throw new Error(`Table '${tableName}' does not exist.${tableList} Please ensure the table was created successfully.`);
            } catch {
              throw new Error(`Table '${tableName}' does not exist. Please ensure the table was created successfully.`);
            }
          }
          
          // Get table schema directly
          const schemaResult = await conn.query(`DESCRIBE ${tableName}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const columns = schemaResult.toArray().map((row: any) => ({
            name: row.column_name,
            type: row.column_type
          }));

          const columnNames = columns.map((col: { name: string; type: string }) => col.name);
          
          // Validate fields exist
          if (xField && !columnNames.includes(xField)) {
            throw new Error(`Field '${xField}' not found in table '${tableName}'. Available fields: ${columnNames.join(', ')}`);
          }
          if (yField && !columnNames.includes(yField)) {
            throw new Error(`Field '${yField}' not found in table '${tableName}'. Available fields: ${columnNames.join(', ')}`);
          }
          if (colorField && !columnNames.includes(colorField)) {
            throw new Error(`Field '${colorField}' not found in table '${tableName}'. Available fields: ${columnNames.join(', ')}`);
          }
          if (sizeField && !columnNames.includes(sizeField)) {
            throw new Error(`Field '${sizeField}' not found in table '${tableName}'. Available fields: ${columnNames.join(', ')}`);
          }

          // Generate Vega-Lite specification
          const vegaSpec = generateVegaLiteSpec({
            tableName,
            plotType,
            xField,
            yField,
            colorField,
            sizeField,
            aggregateFunction,
            title: title || `${plotType.charAt(0).toUpperCase() + plotType.slice(1)} Chart`,
            width,
            height,
            limit,
            columns
          });

          return {
            success: true,
            vegaSpec,
            message: `Generated ${plotType} plot from table ${tableName}`,
            sql: vegaSpec.data.sql
          };
          
        } finally {
          await conn.close();
        }
      } catch (error) {
        console.error('Error creating Vega-Lite plot:', error);
        return {
          error: error instanceof Error ? error.message : 'Unknown error occurred',
          plotType,
          tableName
        };
      }
    },
  });
}

function generateVegaLiteSpec({
  tableName,
  plotType,
  xField,
  yField,
  colorField,
  sizeField,
  aggregateFunction,
  title,
  width,
  height,
  limit,
  columns
}: {
  tableName: string;
  plotType: string;
  xField?: string;
  yField?: string;
  colorField?: string;
  sizeField?: string;
  aggregateFunction: string;
  title: string;
  width: number;
  height: number;
  limit: number;
  columns: { name: string; type: string }[];
}) {
  // Get field types for proper encoding
  const getFieldType = (fieldName: string): 'quantitative' | 'ordinal' | 'nominal' | 'temporal' => {
    const column = columns.find(col => col.name === fieldName);
    if (!column) return 'nominal';
    
    const type = column.type.toLowerCase();
    if (type.includes('int') || type.includes('double') || type.includes('real') || type.includes('decimal')) {
      return 'quantitative';
    }
    if (type.includes('date') || type.includes('time')) {
      return 'temporal';
    }
    return 'nominal';
  };

  // Base specification with DuckDB connection
  const baseSpec: VegaLiteSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    title: title,
    width: width,
    height: height,
    data: {
      sql: `SELECT * FROM ${tableName} LIMIT ${limit}`,
      // Note: We'll handle DuckDB connection in the renderer
    },
    config: {
      view: { stroke: null },
      axis: { grid: true },
      legend: { orient: 'right' }
    }
  };

  // Generate encoding and mark based on plot type
  switch (plotType) {
    case 'scatter':
      if (!xField || !yField) {
        throw new Error('Scatter plot requires both xField and yField');
      }
      baseSpec.mark = { type: 'circle', size: 60, opacity: 0.7 };
      baseSpec.encoding = {
        x: { field: xField, type: getFieldType(xField) },
        y: { field: yField, type: getFieldType(yField) }
      };
      if (colorField) {
        baseSpec.encoding.color = { field: colorField, type: getFieldType(colorField) };
      }
      if (sizeField) {
        baseSpec.encoding.size = { field: sizeField, type: getFieldType(sizeField) };
      }
      break;

    case 'line':
      if (!xField || !yField) {
        throw new Error('Line plot requires both xField and yField');
      }
      baseSpec.mark = { type: 'line', point: true, strokeWidth: 2 };
      baseSpec.encoding = {
        x: { field: xField, type: getFieldType(xField) },
        y: { field: yField, type: getFieldType(yField) }
      };
      if (colorField) {
        baseSpec.encoding.color = { field: colorField, type: getFieldType(colorField) };
      }
      break;

    case 'bar':
      if (!xField) {
        throw new Error('Bar chart requires xField');
      }
      baseSpec.mark = 'bar';
      
      if (yField) {
        // Direct field mapping
        baseSpec.encoding = {
          x: { field: xField, type: getFieldType(xField) },
          y: { field: yField, type: getFieldType(yField), aggregate: aggregateFunction }
        };
      } else {
        // Count aggregation
        baseSpec.encoding = {
          x: { field: xField, type: getFieldType(xField) },
          y: { aggregate: 'count' }
        };
      }
      
      if (colorField) {
        baseSpec.encoding.color = { field: colorField, type: getFieldType(colorField) };
      }
      break;

    case 'histogram':
      if (!xField) {
        throw new Error('Histogram requires xField');
      }
      baseSpec.mark = 'bar';
      baseSpec.encoding = {
        x: { field: xField, type: getFieldType(xField), bin: true },
        y: { aggregate: 'count' }
      };
      break;

    case 'pie':
      if (!xField) {
        throw new Error('Pie chart requires xField for categories');
      }
      baseSpec.mark = { type: 'arc', innerRadius: 0 };
      
      if (yField) {
        baseSpec.encoding = {
          theta: { field: yField, type: getFieldType(yField), aggregate: aggregateFunction },
          color: { field: xField, type: getFieldType(xField) }
        };
      } else {
        baseSpec.encoding = {
          theta: { aggregate: 'count' },
          color: { field: xField, type: getFieldType(xField) }
        };
      }
      break;

    case 'heatmap':
      if (!xField || !yField) {
        throw new Error('Heatmap requires both xField and yField');
      }
      baseSpec.mark = 'rect';
      baseSpec.encoding = {
        x: { field: xField, type: getFieldType(xField) },
        y: { field: yField, type: getFieldType(yField) },
        color: { aggregate: 'count', type: 'quantitative' }
      };
      break;

    case 'box':
      if (!yField) {
        throw new Error('Box plot requires yField');
      }
      baseSpec.mark = { type: 'boxplot', extent: 'min-max' };
      baseSpec.encoding = {
        y: { field: yField, type: getFieldType(yField) }
      };
      if (xField) {
        baseSpec.encoding.x = { field: xField, type: getFieldType(xField) };
      }
      break;

    default:
      throw new Error(`Unsupported plot type: ${plotType}`);
  }

  // Add tooltip by default
  if (!baseSpec.encoding.tooltip) {
    const tooltipFields = [xField, yField, colorField, sizeField].filter(Boolean);
    if (tooltipFields.length > 0) {
      baseSpec.encoding.tooltip = tooltipFields.map(field => ({
        field: field,
        type: getFieldType(field!)
      }));
    }
  }

  return baseSpec;
}

const description = `
This tool creates interactive Vega-Lite visualizations by querying data directly from DuckDB tables.

Supported plot types:
- **scatter**: X-Y scatter plot (requires xField and yField)
- **line**: Line chart showing trends (requires xField and yField)  
- **bar**: Bar chart (requires xField, optionally yField for aggregation)
- **histogram**: Distribution histogram (requires xField)
- **pie**: Pie chart (requires xField for categories, optionally yField for values)
- **heatmap**: 2D heatmap (requires xField and yField)
- **box**: Box plot for distributions (requires yField, optionally xField for grouping)

Key features:
- Queries data directly from DuckDB (no data transfer to frontend)
- Automatic field type detection (quantitative, ordinal, nominal, temporal)
- Interactive features: zoom, pan, hover tooltips, selection
- Configurable aggregation functions: count, sum, mean, median, min, max
- Optional color and size encodings for additional dimensions

The tool validates field names and generates optimized Vega-Lite specifications that are rendered as interactive charts in the chat interface.
`;
