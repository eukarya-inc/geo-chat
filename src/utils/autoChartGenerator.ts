import type { VegaLiteSpec } from '../types/vega';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';


interface ChartGenerationResult {
  spec: VegaLiteSpec;
  title: string;
}

export async function generateDefaultCharts(
  tableName: string,
  dbStateManager: DBStateManager
): Promise<ChartGenerationResult[]> {
  try {
    const columns = await dbStateManager.getTableColumns(tableName);
    if (!columns || columns.length === 0) {
      return [];
    }
    
    // Categorize columns by type
    const numericColumns = columns.filter(col => isNumericType(col.type));
    const categoricalColumns = columns.filter(col => isCategoricalType(col.type));
    const temporalColumns = columns.filter(col => isTemporalType(col.type));

    // Select all columns for the query
    const columnNames = columns.map(col => col.name).join(', ');

    // Determine the best chart type based on column types
    let chart: ChartGenerationResult | null = null;

    // 1. If we have temporal + numeric, create time series
    if (temporalColumns.length > 0 && numericColumns.length > 0) {
      const timeColumn = temporalColumns[0];
      const valueColumn = numericColumns[0];
      
      chart = {
        title: `${tableName} - Time Series`,
        spec: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          title: `${valueColumn.name} over time`,
          data: {
            sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`
          },
          mark: {
            type: 'line',
            point: true
          },
          encoding: {
            x: {
              field: timeColumn.name,
              type: 'temporal',
              title: timeColumn.name
            },
            y: {
              field: valueColumn.name,
              type: 'quantitative',
              title: valueColumn.name
            }
          },
          height: 400
        }
      };
    }
    // 2. If we have categorical + numeric, create bar chart
    else if (categoricalColumns.length > 0 && numericColumns.length > 0) {
      const categoryColumn = categoricalColumns[0];
      const valueColumn = numericColumns[0];
      
      chart = {
        title: `${tableName} - Bar Chart`,
        spec: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          title: `${valueColumn.name} by ${categoryColumn.name}`,
          data: {
            sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`
          },
          mark: 'bar',
          encoding: {
            x: {
              field: categoryColumn.name,
              type: 'nominal',
              title: categoryColumn.name
            },
            y: {
              field: valueColumn.name,
              type: 'quantitative',
              title: valueColumn.name
            }
          },
          height: 400
        }
      };
    }
    // 3. If we have 2+ numeric columns, create scatter plot
    else if (numericColumns.length >= 2) {
      const xColumn = numericColumns[0];
      const yColumn = numericColumns[1];
      
      chart = {
        title: `${tableName} - Scatter Plot`,
        spec: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          title: `${xColumn.name} vs ${yColumn.name}`,
          data: {
            sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`
          },
          mark: {
            type: 'circle',
            size: 60,
            opacity: 0.7
          },
          encoding: {
            x: {
              field: xColumn.name,
              type: 'quantitative',
              title: xColumn.name
            },
            y: {
              field: yColumn.name,
              type: 'quantitative',
              title: yColumn.name
            },
            tooltip: {
              field: xColumn.name,
              type: 'quantitative'
            }
          },
          height: 400
        }
      };
    }
    // 4. If we have only numeric columns, create bar chart of first column
    else if (numericColumns.length > 0) {
      const column = numericColumns[0];
      
      // Try to find an index-like column for x-axis
      const indexColumn = columns.find(col => 
        col.name.toLowerCase().includes('index') || 
        col.name.toLowerCase().includes('id') ||
        col.name.toLowerCase() === 'rowid'
      );
      
      chart = {
        title: `${tableName} - Values`,
        spec: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          title: column.name,
          data: {
            sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`
          },
          mark: 'bar',
          encoding: {
            x: indexColumn ? {
              field: indexColumn.name,
              type: 'ordinal',
              title: indexColumn.name
            } : {
              field: column.name,
              type: 'quantitative',
              title: 'Index'
            },
            y: {
              field: column.name,
              type: 'quantitative',
              title: column.name
            }
          },
          height: 400
        }
      };
    }
    // 5. If only categorical, show as horizontal bar chart
    else if (categoricalColumns.length > 0) {
      const column = categoricalColumns[0];
      
      chart = {
        title: `${tableName} - Categories`,
        spec: {
          $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
          title: column.name,
          data: {
            sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`
          },
          mark: 'bar',
          encoding: {
            y: {
              field: column.name,
              type: 'nominal',
              title: column.name
            },
            x: {
              aggregate: 'count',
              type: 'quantitative',
              title: 'Count'
            }
          },
          height: 400
        }
      };
    }

    return chart ? [chart] : [];
  } catch (error) {
    console.error('Error generating default chart:', error);
    return [];
  }
}

function isNumericType(type: string): boolean {
  const lowerType = type.toLowerCase();
  return (
    lowerType.includes('int') ||
    lowerType.includes('double') ||
    lowerType.includes('float') ||
    lowerType.includes('real') ||
    lowerType.includes('decimal') ||
    lowerType.includes('numeric')
  );
}

function isCategoricalType(type: string): boolean {
  const lowerType = type.toLowerCase();
  return (
    lowerType.includes('varchar') ||
    lowerType.includes('text') ||
    lowerType.includes('string') ||
    lowerType.includes('char')
  );
}

function isTemporalType(type: string): boolean {
  const lowerType = type.toLowerCase();
  return (
    lowerType.includes('date') ||
    lowerType.includes('time') ||
    lowerType.includes('timestamp')
  );
}