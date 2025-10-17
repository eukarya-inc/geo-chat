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

    const baseSpec: Record<string, unknown> = {
        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
        title: config.title || `${config.plotType.charAt(0).toUpperCase() + config.plotType.slice(1)} Chart`,
        width: config.width,
        height: config.height,
        ...initialSpec,
        data: {
            sql: `SELECT * FROM ${config.tableName} LIMIT 1000`,
            values: [],
        },
    };

    if (config.xField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialX = (baseSpec.encoding as any)?.x;
        baseSpec.encoding = {
            ...(baseSpec.encoding ?? {}),
            x: { ...initialX, field: config.xField, type: getFieldType(config.xField) },
        };
    }

    if (config.yField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialY = (baseSpec.encoding as any)?.y;
        baseSpec.encoding = {
            ...(baseSpec.encoding ?? {}),
            y: { ...initialY, field: config.yField, type: getFieldType(config.yField) },
        };
    }

    if (config.colorField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialColor = (baseSpec.encoding as any)?.color;
        baseSpec.encoding = {
            ...(baseSpec.encoding ?? {}),
            color: { ...initialColor, field: config.colorField, type: getFieldType(config.colorField) },
        };
    }

    if (config.sizeField) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const initialSize = (baseSpec.encoding as any)?.size;
        baseSpec.encoding = {
            ...(baseSpec.encoding ?? {}),
            size: { ...initialSize, field: config.sizeField, type: getFieldType(config.sizeField) },
        };
    }

    // VegaChartSpec type is too complex
    return baseSpec as unknown as VegaChartSpec;
}
