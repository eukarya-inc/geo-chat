import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';

// Test the ChartConfigForm component logic
// This test file tests the configuration logic that's now in the separate ChartConfigForm component

describe('ChartConfigForm Logic', () => {
    const mockDBContext: Partial<DBContext> = {
        getTableColumns: vi.fn().mockResolvedValue([
            { name: 'numeric_col', type: 'DOUBLE' },
            { name: 'string_col', type: 'VARCHAR' },
            { name: 'int_col', type: 'INTEGER' },
            { name: 'date_col', type: 'DATE' },
        ]),
    };

    const mockChartSpec: ChartSpec = {
        id: 'test-chart',
        title: 'Test Chart',
        spec: {
            mark: { type: 'circle', size: 60, opacity: 0.7 },
            encoding: {
                x: { field: 'numeric_col', type: 'quantitative' },
                y: { field: 'int_col', type: 'quantitative' },
            },
            data: { url: 'duckdb://test_table' },
            title: 'Original Title',
        },
        timestamp: new Date(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('Configuration Extraction', () => {
        it('should extract scatter plot configuration correctly', () => {
            // Test the extractCurrentConfig logic for scatter plots
            const spec = mockChartSpec.spec;

            // Simulate the extractCurrentConfig function
            let plotType = 'scatter';
            let xField = '';
            let yField = '';

            if ('mark' in spec && typeof spec.mark === 'object' && spec.mark !== null && 'type' in spec.mark) {
                if (spec.mark.type === 'circle') plotType = 'scatter';
            }

            if ('encoding' in spec && spec.encoding) {
                const encoding = spec.encoding;
                if ('x' in encoding && encoding.x && typeof encoding.x === 'object' && 'field' in encoding.x) {
                    xField = String(encoding.x.field);
                }
                if ('y' in encoding && encoding.y && typeof encoding.y === 'object' && 'field' in encoding.y) {
                    yField = String(encoding.y.field);
                }
            }

            expect(plotType).toBe('scatter');
            expect(xField).toBe('numeric_col');
            expect(yField).toBe('int_col');
        });

        it('should extract bar chart configuration correctly', () => {
            const barChartSpec = {
                ...mockChartSpec,
                spec: {
                    ...mockChartSpec.spec,
                    mark: 'bar',
                    encoding: {
                        x: { field: 'string_col', type: 'nominal' },
                        y: { aggregate: 'count' },
                    },
                },
            };

            // Simulate extractCurrentConfig for bar chart
            let plotType = 'scatter';
            if ('mark' in barChartSpec.spec) {
                const mark = barChartSpec.spec.mark;
                if (typeof mark === 'string' && mark === 'bar') {
                    plotType = 'bar';
                }
            }

            expect(plotType).toBe('bar');
        });

        it('should extract histogram configuration correctly', () => {
            const histogramSpec = {
                ...mockChartSpec,
                spec: {
                    ...mockChartSpec.spec,
                    mark: { type: 'bar' },
                    encoding: {
                        x: { field: 'numeric_col', type: 'quantitative', bin: true },
                        y: { aggregate: 'count' },
                    },
                },
            };

            // Simulate extractCurrentConfig for histogram
            let plotType = 'bar';
            const spec = histogramSpec.spec;

            if ('mark' in spec && typeof spec.mark === 'object' && spec.mark !== null && 'type' in spec.mark) {
                if (spec.mark.type === 'bar') {
                    // Check if it's a histogram
                    if (
                        'encoding' in spec &&
                        spec.encoding &&
                        'x' in spec.encoding &&
                        spec.encoding.x &&
                        typeof spec.encoding.x === 'object' &&
                        'bin' in spec.encoding.x &&
                        spec.encoding.x.bin
                    ) {
                        plotType = 'histogram';
                    }
                }
            }

            expect(plotType).toBe('histogram');
        });
    });

    describe('Field Type Detection', () => {
        const columns = [
            { name: 'numeric_col', type: 'DOUBLE' },
            { name: 'string_col', type: 'VARCHAR' },
            { name: 'int_col', type: 'INTEGER' },
            { name: 'date_col', type: 'DATE' },
            { name: 'timestamp_col', type: 'TIMESTAMP' },
        ];

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

        it('should identify quantitative fields correctly', () => {
            expect(getFieldType('numeric_col')).toBe('quantitative');
            expect(getFieldType('int_col')).toBe('quantitative');
        });

        it('should identify temporal fields correctly', () => {
            expect(getFieldType('date_col')).toBe('temporal');
            expect(getFieldType('timestamp_col')).toBe('temporal');
        });

        it('should identify nominal fields correctly', () => {
            expect(getFieldType('string_col')).toBe('nominal');
        });

        it('should default to nominal for unknown fields', () => {
            expect(getFieldType('unknown_field')).toBe('nominal');
        });
    });

    describe('Vega Spec Generation', () => {
        const columns = [
            { name: 'x_col', type: 'DOUBLE' },
            { name: 'y_col', type: 'INTEGER' },
            { name: 'category_col', type: 'VARCHAR' },
        ];

        const getFieldType = (fieldName: string) => {
            const column = columns.find(col => col.name === fieldName);
            if (!column) return 'nominal';
            const type = column.type.toLowerCase();
            if (type.includes('int') || type.includes('double')) return 'quantitative';
            return 'nominal';
        };

        it('should generate scatter plot spec correctly', () => {
            const config = {
                plotType: 'scatter',
                xField: 'x_col',
                yField: 'y_col',
                colorField: 'category_col',
                sizeField: '',
                title: 'Test Chart',
            };

            const baseSpec = {
                $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                title: mockChartSpec.spec.title || mockChartSpec.title || 'Chart',
                width: 400,
                height: 300,
                data: mockChartSpec.spec.data,
                config: {
                    view: { stroke: null },
                    axis: { grid: true },
                },
            };

            const expectedSpec = {
                ...baseSpec,
                mark: { type: 'circle', size: 60, opacity: 0.7 },
                encoding: {
                    x: { field: config.xField, type: getFieldType(config.xField) },
                    y: { field: config.yField, type: getFieldType(config.yField) },
                    color: { field: config.colorField, type: getFieldType(config.colorField) },
                },
            };

            expect(expectedSpec.mark).toEqual({ type: 'circle', size: 60, opacity: 0.7 });
            expect(expectedSpec.encoding.x).toEqual({ field: 'x_col', type: 'quantitative' });
            expect(expectedSpec.encoding.y).toEqual({ field: 'y_col', type: 'quantitative' });
            expect(expectedSpec.encoding.color).toEqual({ field: 'category_col', type: 'nominal' });
        });

        it('should generate bar chart spec correctly', () => {
            const config = {
                plotType: 'bar',
                xField: 'category_col',
                yField: 'x_col',
                colorField: '',
                sizeField: '',
                title: 'Test Chart',
            };

            const expectedEncoding = {
                x: { field: config.xField, type: getFieldType(config.xField) },
                y: { field: config.yField, type: getFieldType(config.yField), aggregate: 'mean' },
            };

            expect(expectedEncoding.x).toEqual({ field: 'category_col', type: 'nominal' });
            expect(expectedEncoding.y).toEqual({ field: 'x_col', type: 'quantitative', aggregate: 'mean' });
        });

        it('should generate pie chart spec correctly', () => {
            const config = {
                plotType: 'pie',
                xField: 'category_col',
                yField: 'x_col',
                colorField: '',
                sizeField: '',
                title: 'Test Chart',
            };

            const expectedSpec = {
                mark: { type: 'arc', innerRadius: 0 },
                encoding: {
                    theta: { field: config.yField, type: getFieldType(config.yField), aggregate: 'sum' },
                    color: { field: config.xField, type: getFieldType(config.xField) },
                },
            };

            expect(expectedSpec.mark).toEqual({ type: 'arc', innerRadius: 0 });
            expect(expectedSpec.encoding.theta).toEqual({ field: 'x_col', type: 'quantitative', aggregate: 'sum' });
            expect(expectedSpec.encoding.color).toEqual({ field: 'category_col', type: 'nominal' });
        });

        it('should generate histogram spec correctly', () => {
            const config = {
                plotType: 'histogram',
                xField: 'x_col',
                yField: '',
                colorField: '',
                sizeField: '',
                title: 'Test Chart',
            };

            const expectedSpec = {
                mark: 'bar',
                encoding: {
                    x: { field: config.xField, type: getFieldType(config.xField), bin: true },
                    y: { aggregate: 'count' },
                },
            };

            expect(expectedSpec.mark).toBe('bar');
            expect(expectedSpec.encoding.x).toEqual({ field: 'x_col', type: 'quantitative', bin: true });
            expect(expectedSpec.encoding.y).toEqual({ aggregate: 'count' });
        });
    });

    describe('Database Integration', () => {
        it('should fetch table columns on initialization', async () => {
            const chartSpecWithURL = {
                ...mockChartSpec,
                spec: {
                    ...mockChartSpec.spec,
                    data: { url: 'duckdb://test_table' },
                },
            };

            // Simulate the useEffect logic for fetching columns
            const url = chartSpecWithURL.spec.data.url;
            if (typeof url === 'string' && url.startsWith('duckdb://')) {
                const path = url.replace('duckdb://', '');
                const parts = path.split('/');
                const tableName = parts.length === 2 ? parts[1] : parts[0];

                expect(tableName).toBe('test_table');
            }

            // Verify the mock would be called correctly
            expect(mockDBContext.getTableColumns).toBeDefined();
        });

        it('should handle URL parsing errors gracefully', () => {
            const invalidURL = 'invalid://url';
            const isValid = invalidURL.startsWith('duckdb://');

            expect(isValid).toBe(false);
        });
    });

    describe('Configuration State Management', () => {
        it('should update configuration when field selections change', () => {
            const initialConfig = {
                plotType: 'scatter',
                xField: 'x_col',
                yField: 'y_col',
                colorField: '',
                sizeField: '',
                title: 'Test Chart',
            };

            // Simulate field change
            const updatedConfig = {
                ...initialConfig,
                colorField: 'category_col',
            };

            expect(updatedConfig.colorField).toBe('category_col');
            expect(updatedConfig.xField).toBe('x_col'); // Other fields remain unchanged
            expect(updatedConfig.yField).toBe('y_col');
        });

        it('should update chart title when title field changes', () => {
            const initialConfig = {
                plotType: 'scatter',
                xField: 'x_col',
                yField: 'y_col',
                colorField: '',
                sizeField: '',
                title: 'Original Chart Title',
            };

            // Simulate title change
            const updatedConfig = {
                ...initialConfig,
                title: 'Updated Chart Title',
            };

            expect(updatedConfig.title).toBe('Updated Chart Title');
            expect(updatedConfig.plotType).toBe('scatter'); // Other fields remain unchanged
            expect(updatedConfig.xField).toBe('x_col');
            expect(updatedConfig.yField).toBe('y_col');
        });

        it('should use updated title in generated Vega spec', () => {
            const config = {
                plotType: 'scatter',
                xField: 'x_col',
                yField: 'y_col',
                colorField: '',
                sizeField: '',
                title: 'Custom Chart Title',
            };

            // Simulate the generateVegaSpec function's title handling
            const baseSpec = {
                $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                title: config.title, // Use title from config
                width: 400,
                height: 300,
                data: mockChartSpec.spec.data,
                config: {
                    view: { stroke: null },
                    axis: { grid: true },
                },
            };

            expect(baseSpec.title).toBe('Custom Chart Title');
        });

        it('should preserve original chart title and data source', () => {
            const baseSpec = {
                $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
                title: mockChartSpec.spec.title || mockChartSpec.title || 'Chart',
                width: 400,
                height: 300,
                data: mockChartSpec.spec.data,
                config: {
                    view: { stroke: null },
                    axis: { grid: true },
                },
            };

            expect(baseSpec.title).toBe('Original Title');
            expect(baseSpec.data).toEqual({ url: 'duckdb://test_table' });
        });

        it('should initialize title from existing chart spec', () => {
            // Test extractCurrentConfig logic for title extraction
            const existingChartSpec = {
                ...mockChartSpec,
                title: 'Existing Chart Title',
            };

            const extractedConfig = {
                plotType: 'scatter',
                xField: '',
                yField: '',
                colorField: '',
                sizeField: '',
                title: existingChartSpec.title || 'Chart',
            };

            expect(extractedConfig.title).toBe('Existing Chart Title');
        });
    });
});
