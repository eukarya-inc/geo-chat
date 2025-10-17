import type { VegaChartSpec } from '../../types/chart';

// Column information interface
export interface ColumnInfo {
    name: string;
    type: string;
}

// Type definitions for chart generation
export type FieldType = 'quantitative' | 'ordinal' | 'nominal' | 'temporal';
export type GetFieldType = (fieldName: string) => FieldType;

export interface ChartConfig {
    tableName: string;
    plotType: string;
    xField: string;
    yField: string;
    colorField: string;
    sizeField: string;
    title: unknown;
    width: unknown;
    height: unknown;
}

// Helper function to determine field type based on column metadata
export function getFieldTypeFromColumns(fieldName: string, columns: ColumnInfo[]): FieldType {
    const column = columns.find((col: ColumnInfo) => col.name === fieldName);
    if (!column) return 'nominal';

    const type = column.type.toLowerCase();
    if (type.includes('int') || type.includes('double') || type.includes('real') || type.includes('decimal')) {
        return 'quantitative';
    }
    if (type.includes('date') || type.includes('time')) {
        return 'temporal';
    }
    return 'nominal';
}

// Main chart spec generation function
export function generateChartSpec(
    config: ChartConfig,
    columns: ColumnInfo[],
    initialSpec: VegaChartSpec
): VegaChartSpec {
    if (!config.tableName || !config.plotType) return initialSpec;

    const getFieldType = (fieldName: string) => getFieldTypeFromColumns(fieldName, columns);

    // Determine mark type based on plot type, preserving other mark properties from initialSpec
    let markType: string;
    switch (config.plotType) {
        case 'scatter':
            markType = 'circle';
            break;
        case 'line':
            markType = 'line';
            break;
        case 'bar':
        case 'histogram':
            markType = 'bar';
            break;
        case 'pie':
            markType = 'arc';
            break;
        case 'heatmap':
            markType = 'rect';
            break;
        case 'box':
            markType = 'boxplot';
            break;
        default:
            markType = 'circle';
    }

    // Preserve existing mark properties from initialSpec
    const existingMark = 'mark' in initialSpec ? initialSpec.mark : {};
    const mark =
        typeof existingMark === 'object' && existingMark !== null
            ? { ...existingMark, type: markType }
            : { type: markType };

    const baseSpec: Record<string, unknown> = {
        ...initialSpec,
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        title: config.title || `${config.plotType.charAt(0).toUpperCase() + config.plotType.slice(1)} Chart`,
        width: config.width,
        height: config.height,
        mark,
        data: {
            sql: `SELECT * FROM ${config.tableName} LIMIT 1000`,
            values: [],
        },
    };

    // Update encoding fields while preserving AI-generated details (scale, axis, etc.)
    if (config.plotType === 'pie') {
        // For pie charts, use theta encoding instead of x/y
        if (config.yField) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const initialTheta = (baseSpec.encoding as any)?.theta;
            baseSpec.encoding = {
                ...(baseSpec.encoding ?? {}),
                theta: { ...initialTheta, field: config.yField, type: getFieldType(config.yField) },
            };
        } else {
            // If no y field, count records
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const initialTheta = (baseSpec.encoding as any)?.theta;
            baseSpec.encoding = {
                ...(baseSpec.encoding ?? {}),
                theta: { ...initialTheta, aggregate: 'count', type: 'quantitative' },
            };
        }
        // For pie charts, use x field for color if AI hasn't already set color
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialColor = (baseSpec.encoding as any)?.color;
        if (config.xField && !initialColor) {
            baseSpec.encoding = {
                ...(baseSpec.encoding ?? {}),
                color: { field: config.xField, type: getFieldType(config.xField) },
            };
        }
    } else {
        // For non-pie charts, use x/y encoding
        if (config.xField) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const initialX = (baseSpec.encoding as any)?.x;
            baseSpec.encoding = {
                ...(baseSpec.encoding ?? {}),
                x: {
                    ...initialX,
                    field: config.xField,
                    type: getFieldType(config.xField),
                    // For histogram, add bin
                    ...(config.plotType === 'histogram' ? { bin: true } : {}),
                },
            };
        }

        if (config.yField) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const initialY = (baseSpec.encoding as any)?.y;
            baseSpec.encoding = {
                ...(baseSpec.encoding ?? {}),
                y: { ...initialY, field: config.yField, type: getFieldType(config.yField) },
            };
        } else if (config.plotType === 'histogram') {
            // For histogram without y field, count records
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const initialY = (baseSpec.encoding as any)?.y;
            baseSpec.encoding = {
                ...(baseSpec.encoding ?? {}),
                y: { ...initialY, aggregate: 'count', type: 'quantitative' },
            };
        }
    }

    // Update or remove color encoding
    if (config.colorField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialColor = (baseSpec.encoding as any)?.color;
        baseSpec.encoding = {
            ...(baseSpec.encoding ?? {}),
            color: { ...initialColor, field: config.colorField, type: getFieldType(config.colorField) },
        };
    } else if (baseSpec.encoding && typeof baseSpec.encoding === 'object' && 'color' in baseSpec.encoding) {
        // Remove color encoding if colorField is empty
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const encoding = { ...(baseSpec.encoding as any) };
        delete encoding.color;
        baseSpec.encoding = encoding;
    }

    // Update or remove size encoding
    if (config.sizeField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialSize = (baseSpec.encoding as any)?.size;
        baseSpec.encoding = {
            ...(baseSpec.encoding ?? {}),
            size: { ...initialSize, field: config.sizeField, type: getFieldType(config.sizeField) },
        };
    } else if (baseSpec.encoding && typeof baseSpec.encoding === 'object' && 'size' in baseSpec.encoding) {
        // Remove size encoding if sizeField is empty
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const encoding = { ...(baseSpec.encoding as any) };
        delete encoding.size;
        baseSpec.encoding = encoding;
    }

    // VegaChartSpec type is too complex
    return baseSpec as unknown as VegaChartSpec;
}
