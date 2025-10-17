import type { DBContext } from '../lib/duckdb/dbContext';
import type { VegaChartSpec } from '../types/chart';

export type ChartType = 'bar' | 'horizontal-bar' | 'line' | 'pie' | 'map';

interface ChartGenerationResult {
    spec: VegaChartSpec;
    title: string;
}

/**
 * Generate a chart spec based on the selected chart type
 */
export async function generateChartByType(
    chartType: ChartType,
    tableName: string,
    dbContext: DBContext,
    schema: string | null = null
): Promise<ChartGenerationResult | null> {
    try {
        const columns = await dbContext.getTableColumns(tableName, schema);
        if (!columns || columns.length === 0) {
            return null;
        }

        // Categorize columns by type
        const numericColumns = columns.filter(col => isNumericType(col.type));
        const categoricalColumns = columns.filter(col => isCategoricalType(col.type));
        const temporalColumns = columns.filter(col => isTemporalType(col.type));

        // Select all columns for the query
        const columnNames = columns.map(col => col.name).join(', ');
        const qualifiedTableName = tableName;

        // Helper function to capitalize first character
        const capitalizeTableName = (name: string) => {
            return name.charAt(0).toUpperCase() + name.slice(1);
        };

        switch (chartType) {
            case 'bar':
                return generateBarChart(
                    qualifiedTableName,
                    columnNames,
                    categoricalColumns,
                    numericColumns,
                    capitalizeTableName(tableName)
                );

            case 'horizontal-bar':
                return generateHorizontalBarChart(
                    qualifiedTableName,
                    columnNames,
                    categoricalColumns,
                    numericColumns,
                    capitalizeTableName(tableName)
                );

            case 'line':
                return generateLineChart(
                    qualifiedTableName,
                    columnNames,
                    temporalColumns,
                    numericColumns,
                    categoricalColumns,
                    capitalizeTableName(tableName)
                );

            case 'pie':
                return generatePieChart(
                    qualifiedTableName,
                    columnNames,
                    categoricalColumns,
                    numericColumns,
                    capitalizeTableName(tableName)
                );

            default:
                return null;
        }
    } catch (error) {
        console.error('Error generating chart:', error);
        return null;
    }
}

function generateBarChart(
    tableName: string,
    columnNames: string,
    categoricalColumns: { name: string; type: string }[],
    numericColumns: { name: string; type: string }[],
    title: string
): ChartGenerationResult | null {
    // Prefer categorical + numeric for bar chart
    if (categoricalColumns.length > 0 && numericColumns.length > 0) {
        const categoryColumn = categoricalColumns[0];
        const valueColumn = numericColumns[0];

        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `${valueColumn.name} by ${categoryColumn.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: 'bar',
                encoding: {
                    x: {
                        field: categoryColumn.name,
                        type: 'nominal',
                        title: categoryColumn.name,
                    },
                    y: {
                        field: valueColumn.name,
                        type: 'quantitative',
                        title: valueColumn.name,
                    },
                },
                height: 400,
            },
        };
    }

    // Fallback: count by categorical
    if (categoricalColumns.length > 0) {
        const column = categoricalColumns[0];
        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `Count by ${column.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: 'bar',
                encoding: {
                    x: {
                        field: column.name,
                        type: 'nominal',
                        title: column.name,
                    },
                    y: {
                        aggregate: 'count',
                        type: 'quantitative',
                        title: 'Count',
                    },
                },
                height: 400,
            },
        };
    }

    return null;
}

function generateHorizontalBarChart(
    tableName: string,
    columnNames: string,
    categoricalColumns: { name: string; type: string }[],
    numericColumns: { name: string; type: string }[],
    title: string
): ChartGenerationResult | null {
    // Prefer categorical + numeric for horizontal bar chart
    if (categoricalColumns.length > 0 && numericColumns.length > 0) {
        const categoryColumn = categoricalColumns[0];
        const valueColumn = numericColumns[0];

        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `${valueColumn.name} by ${categoryColumn.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: 'bar',
                encoding: {
                    y: {
                        field: categoryColumn.name,
                        type: 'nominal',
                        title: categoryColumn.name,
                    },
                    x: {
                        field: valueColumn.name,
                        type: 'quantitative',
                        title: valueColumn.name,
                    },
                },
                height: 400,
            },
        };
    }

    // Fallback: count by categorical (horizontal)
    if (categoricalColumns.length > 0) {
        const column = categoricalColumns[0];
        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `Count by ${column.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: 'bar',
                encoding: {
                    y: {
                        field: column.name,
                        type: 'nominal',
                        title: column.name,
                    },
                    x: {
                        aggregate: 'count',
                        type: 'quantitative',
                        title: 'Count',
                    },
                },
                height: 400,
            },
        };
    }

    return null;
}

function generateLineChart(
    tableName: string,
    columnNames: string,
    temporalColumns: { name: string; type: string }[],
    numericColumns: { name: string; type: string }[],
    categoricalColumns: { name: string; type: string }[],
    title: string
): ChartGenerationResult | null {
    // Prefer temporal + numeric for line chart
    if (temporalColumns.length > 0 && numericColumns.length > 0) {
        const timeColumn = temporalColumns[0];
        const valueColumn = numericColumns[0];

        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `${valueColumn.name} over time`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: {
                    type: 'line',
                    point: true,
                },
                encoding: {
                    x: {
                        field: timeColumn.name,
                        type: 'temporal',
                        title: timeColumn.name,
                    },
                    y: {
                        field: valueColumn.name,
                        type: 'quantitative',
                        title: valueColumn.name,
                    },
                },
                height: 400,
            },
        };
    }

    // Fallback: categorical x-axis + numeric y-axis
    if (categoricalColumns.length > 0 && numericColumns.length > 0) {
        const categoryColumn = categoricalColumns[0];
        const valueColumn = numericColumns[0];

        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `${valueColumn.name} by ${categoryColumn.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: {
                    type: 'line',
                    point: true,
                },
                encoding: {
                    x: {
                        field: categoryColumn.name,
                        type: 'nominal',
                        title: categoryColumn.name,
                    },
                    y: {
                        field: valueColumn.name,
                        type: 'quantitative',
                        title: valueColumn.name,
                    },
                },
                height: 400,
            },
        };
    }

    return null;
}

function generatePieChart(
    tableName: string,
    columnNames: string,
    categoricalColumns: { name: string; type: string }[],
    numericColumns: { name: string; type: string }[],
    title: string
): ChartGenerationResult | null {
    // Prefer categorical + numeric for pie chart
    if (categoricalColumns.length > 0 && numericColumns.length > 0) {
        const categoryColumn = categoricalColumns[0];
        const valueColumn = numericColumns[0];

        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `${valueColumn.name} by ${categoryColumn.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: {
                    type: 'arc',
                    innerRadius: 0,
                },
                encoding: {
                    theta: {
                        field: valueColumn.name,
                        type: 'quantitative',
                    },
                    color: {
                        field: categoryColumn.name,
                        type: 'nominal',
                        legend: {
                            title: categoryColumn.name,
                        },
                    },
                },
                height: 400,
            },
        };
    }

    // Fallback: count by categorical
    if (categoricalColumns.length > 0) {
        const column = categoricalColumns[0];
        return {
            title,
            spec: {
                $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                title: `Count by ${column.name}`,
                data: {
                    sql: `SELECT ${columnNames} FROM ${tableName} LIMIT 1000`,
                    values: [],
                },
                mark: {
                    type: 'arc',
                    innerRadius: 0,
                },
                encoding: {
                    theta: {
                        aggregate: 'count',
                        type: 'quantitative',
                    },
                    color: {
                        field: column.name,
                        type: 'nominal',
                        legend: {
                            title: column.name,
                        },
                    },
                },
                height: 400,
            },
        };
    }

    return null;
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
    return lowerType.includes('date') || lowerType.includes('time') || lowerType.includes('timestamp');
}
