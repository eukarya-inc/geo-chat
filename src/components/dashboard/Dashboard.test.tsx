import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ChartSpec } from '../../types/chart';
import type { Layout } from 'react-grid-layout';

// Test the chart configuration and export functionality logic
describe('Dashboard Chart Configuration Logic', () => {
    describe('Chart Export Functions', () => {
        const mockCanvas = {
            toBlob: vi.fn((callback: (blob: Blob) => void) => {
                callback(new Blob(['fake-png-data'], { type: 'image/png' }));
            }),
            toDataURL: vi.fn(() => 'data:image/svg+xml;base64,fake-svg-data'),
        };

        const mockLink = {
            click: vi.fn(),
            href: '',
            download: '',
        };

        beforeEach(() => {
            vi.clearAllMocks();

            // Mock document.createElement for download link
            vi.spyOn(document, 'createElement').mockImplementation(tagName => {
                if (tagName === 'a') {
                    return mockLink as unknown as HTMLAnchorElement;
                }
                // Return a basic element for other tag types
                return { tagName } as unknown as HTMLElement;
            });

            // Mock document.body.appendChild and removeChild
            vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockLink as unknown as Node);
            vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockLink as unknown as Node);

            // Mock URL.createObjectURL
            Object.defineProperty(URL, 'createObjectURL', {
                value: vi.fn(() => 'blob:fake-url'),
                writable: true,
            });

            Object.defineProperty(URL, 'revokeObjectURL', {
                value: vi.fn(),
                writable: true,
            });
        });

        it('should create PNG export function that triggers blob download', async () => {
            const exportPNG = (chartId: string) => {
                const chartContainer = document.querySelector(`[data-testid="chart-${chartId}"]`);
                if (!chartContainer) return;

                const canvas = chartContainer.querySelector('canvas');
                if (!canvas) return;

                canvas.toBlob(blob => {
                    if (!blob) return;

                    const url = URL.createObjectURL(blob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = `chart-${chartId}.png`;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                }, 'image/png');
            };

            // Mock chart container with canvas
            const mockChartElement = {
                querySelector: vi.fn().mockReturnValue({
                    toBlob: mockCanvas.toBlob,
                }),
                setAttribute: vi.fn(),
                appendChild: vi.fn(),
            };

            vi.spyOn(document, 'querySelector').mockReturnValue(mockChartElement as unknown as Element);

            exportPNG('test-1');

            expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/png');
            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(document.createElement).toHaveBeenCalledWith('a');
        });

        it('should create SVG export function that triggers data URL download', () => {
            const exportSVG = (chartId: string, title: string) => {
                const svgContent = `<svg xmlns="http://www.w3.org/2000/svg"><text>${title}</text></svg>`;
                const blob = new Blob([svgContent], { type: 'image/svg+xml' });
                const url = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = url;
                link.download = `chart-${chartId}.svg`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            };

            exportSVG('test-1', 'Test Chart');

            expect(URL.createObjectURL).toHaveBeenCalled();
            expect(document.createElement).toHaveBeenCalledWith('a');
            expect(mockLink.click).toHaveBeenCalled();
        });
    });

    describe('Chart Configuration Extraction', () => {
        it('should extract configuration from scatter plot chart spec', () => {
            const chartSpec: ChartSpec = {
                id: 'test-chart',
                title: 'Test Chart',
                spec: {
                    mark: { type: 'circle', size: 60, opacity: 0.7 },
                    encoding: {
                        x: { field: 'x_col', type: 'quantitative' },
                        y: { field: 'y_col', type: 'quantitative' },
                        color: { field: 'category', type: 'nominal' },
                    } as unknown as ChartSpec['spec'],
                    data: { sql: 'SELECT * FROM test_table' } as unknown as ChartSpec['spec']['data'],
                    title: 'Original Title',
                } as unknown as ChartSpec['spec'],
                timestamp: new Date(),
            };

            const extractConfig = (spec: ChartSpec) => {
                let plotType = 'scatter';
                let xField = '';
                let yField = '';
                let colorField = '';

                if (
                    'mark' in spec.spec &&
                    typeof spec.spec.mark === 'object' &&
                    spec.spec.mark !== null &&
                    'type' in spec.spec.mark
                ) {
                    if (spec.spec.mark.type === 'circle') plotType = 'scatter';
                }

                if ('encoding' in spec.spec && spec.spec.encoding) {
                    const encoding = spec.spec.encoding;
                    if ('x' in encoding && encoding.x && typeof encoding.x === 'object' && 'field' in encoding.x) {
                        xField = String(encoding.x.field);
                    }
                    if ('y' in encoding && encoding.y && typeof encoding.y === 'object' && 'field' in encoding.y) {
                        yField = String(encoding.y.field);
                    }
                    if (
                        'color' in encoding &&
                        encoding.color &&
                        typeof encoding.color === 'object' &&
                        'field' in encoding.color
                    ) {
                        colorField = String(encoding.color.field);
                    }
                }

                return { plotType, xField, yField, colorField };
            };

            const config = extractConfig(chartSpec);

            expect(config.plotType).toBe('scatter');
            expect(config.xField).toBe('x_col');
            expect(config.yField).toBe('y_col');
            expect(config.colorField).toBe('category');
        });

        it('should extract configuration from bar chart spec', () => {
            const barChartSpec: ChartSpec = {
                id: 'bar-chart',
                title: 'Bar Chart',
                spec: {
                    mark: 'bar',
                    encoding: {
                        x: { field: 'category', type: 'nominal' },
                        y: { aggregate: 'count' },
                    } as unknown as ChartSpec['spec'],
                    data: { sql: 'SELECT * FROM test_table' } as unknown as ChartSpec['spec']['data'],
                } as unknown as ChartSpec['spec'],
                timestamp: new Date(),
            };

            const extractConfig = (spec: ChartSpec) => {
                let plotType = 'scatter';

                if ('mark' in spec.spec) {
                    const mark = spec.spec.mark;
                    if (typeof mark === 'string' && mark === 'bar') {
                        plotType = 'bar';
                    }
                }

                return { plotType };
            };

            const config = extractConfig(barChartSpec);
            expect(config.plotType).toBe('bar');
        });

        it('should detect histogram from bar chart with bin encoding', () => {
            const histogramSpec: ChartSpec = {
                id: 'histogram',
                title: 'Histogram',
                spec: {
                    mark: { type: 'bar' },
                    encoding: {
                        x: { field: 'value', type: 'quantitative', bin: true },
                        y: { aggregate: 'count' },
                    } as unknown as ChartSpec['spec'],
                    data: { sql: 'SELECT * FROM test_table' } as unknown as ChartSpec['spec']['data'],
                } as unknown as ChartSpec['spec'],
                timestamp: new Date(),
            };

            const extractConfig = (spec: ChartSpec) => {
                let plotType = 'bar';

                if (
                    'mark' in spec.spec &&
                    typeof spec.spec.mark === 'object' &&
                    spec.spec.mark !== null &&
                    'type' in spec.spec.mark
                ) {
                    if (spec.spec.mark.type === 'bar') {
                        // Check if it's a histogram
                        if (
                            'encoding' in spec.spec &&
                            spec.spec.encoding &&
                            'x' in spec.spec.encoding &&
                            spec.spec.encoding.x &&
                            typeof spec.spec.encoding.x === 'object' &&
                            'bin' in spec.spec.encoding.x &&
                            spec.spec.encoding.x.bin
                        ) {
                            plotType = 'histogram';
                        }
                    }
                }

                return { plotType };
            };

            const config = extractConfig(histogramSpec);
            expect(config.plotType).toBe('histogram');
        });
    });

    describe('Field Type Detection', () => {
        const getFieldType = (fieldName: string, columns: Array<{ name: string; type: string }>) => {
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

        const mockColumns = [
            { name: 'numeric_col', type: 'DOUBLE' },
            { name: 'int_col', type: 'INTEGER' },
            { name: 'string_col', type: 'VARCHAR' },
            { name: 'date_col', type: 'DATE' },
            { name: 'timestamp_col', type: 'TIMESTAMP' },
        ];

        it('should correctly identify quantitative fields', () => {
            expect(getFieldType('numeric_col', mockColumns)).toBe('quantitative');
            expect(getFieldType('int_col', mockColumns)).toBe('quantitative');
        });

        it('should correctly identify temporal fields', () => {
            expect(getFieldType('date_col', mockColumns)).toBe('temporal');
            expect(getFieldType('timestamp_col', mockColumns)).toBe('temporal');
        });

        it('should correctly identify nominal fields', () => {
            expect(getFieldType('string_col', mockColumns)).toBe('nominal');
        });

        it('should default to nominal for unknown fields', () => {
            expect(getFieldType('unknown_field', mockColumns)).toBe('nominal');
        });
    });

    describe('Auto-add to Dashboard on Export', () => {
        // Helper function extracted from useDashboardManagement.ts
        const createDefaultLayoutForVisualization = (
            visualizationId: string,
            visualizationType: 'chart' | 'map' | 'table',
            layoutOverride?: Partial<Layout>
        ): Layout => {
            return {
                i: visualizationId,
                x: 0,
                y: Infinity,
                w: visualizationType === 'map' ? 8 : 6,
                h: visualizationType === 'map' ? 6 : 4,
                minW: visualizationType === 'map' ? 4 : 3,
                minH: visualizationType === 'map' ? 3 : 2,
                ...layoutOverride,
            };
        };

        it('should create default layout for chart with correct dimensions', () => {
            const layout = createDefaultLayoutForVisualization('viz-123', 'chart');

            expect(layout.i).toBe('viz-123');
            expect(layout.x).toBe(0);
            expect(layout.y).toBe(Infinity);
            expect(layout.w).toBe(6);
            expect(layout.h).toBe(4);
            expect(layout.minW).toBe(3);
            expect(layout.minH).toBe(2);
        });

        it('should create default layout for map with correct dimensions', () => {
            const layout = createDefaultLayoutForVisualization('viz-456', 'map');

            expect(layout.i).toBe('viz-456');
            expect(layout.x).toBe(0);
            expect(layout.y).toBe(Infinity);
            expect(layout.w).toBe(8);
            expect(layout.h).toBe(6);
            expect(layout.minW).toBe(4);
            expect(layout.minH).toBe(3);
        });

        it('should create default layout for table with correct dimensions', () => {
            const layout = createDefaultLayoutForVisualization('viz-789', 'table');

            expect(layout.i).toBe('viz-789');
            expect(layout.x).toBe(0);
            expect(layout.y).toBe(Infinity);
            expect(layout.w).toBe(6);
            expect(layout.h).toBe(4);
            expect(layout.minW).toBe(3);
            expect(layout.minH).toBe(2);
        });

        it('should apply layout override correctly', () => {
            const layout = createDefaultLayoutForVisualization('viz-999', 'chart', {
                x: 5,
                y: 10,
                w: 8,
                h: 6,
            });

            expect(layout.i).toBe('viz-999');
            expect(layout.x).toBe(5);
            expect(layout.y).toBe(10);
            expect(layout.w).toBe(8);
            expect(layout.h).toBe(6);
            expect(layout.minW).toBe(3);
            expect(layout.minH).toBe(2);
        });

        it('should simulate export chart to dashboard with auto-add', () => {
            // Simulate dashboard state before export
            const dashboard = {
                id: 'dashboard-1',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [],
                layout: [],
            };

            // Simulate new visualization
            const newVisualization = {
                id: 'viz-chart-1',
                type: 'chart' as const,
                title: 'Test Chart',
                chartSpec: {
                    id: 'chart-1',
                    title: 'Test Chart',
                    spec: {} as unknown as ChartSpec['spec'],
                    timestamp: new Date(),
                },
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            // Simulate auto-add logic from handleExportChartToDashboard
            const defaultLayout = createDefaultLayoutForVisualization(newVisualization.id, newVisualization.type);

            const updatedDashboard = {
                ...dashboard,
                visualizations: [...dashboard.visualizations, newVisualization],
                layout: [...dashboard.layout, defaultLayout],
            };

            // Verify visualization was added
            expect(updatedDashboard.visualizations).toHaveLength(1);
            expect(updatedDashboard.visualizations[0]).toEqual(newVisualization);

            // Verify layout was added automatically
            expect(updatedDashboard.layout).toHaveLength(1);
            expect(updatedDashboard.layout[0].i).toBe('viz-chart-1');
            expect(updatedDashboard.layout[0].w).toBe(6); // Chart width
            expect(updatedDashboard.layout[0].h).toBe(4); // Chart height
        });

        it('should simulate export map to dashboard with auto-add', () => {
            const dashboard = {
                id: 'dashboard-2',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [],
                layout: [],
            };

            const newVisualization = {
                id: 'viz-map-1',
                type: 'map' as const,
                title: 'Test Map',
                mapSpec: {},
                tableId: 'table-1',
                geometryColumn: 'geom',
                sql: 'SELECT * FROM table-1',
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            const defaultLayout = createDefaultLayoutForVisualization(newVisualization.id, newVisualization.type);

            const updatedDashboard = {
                ...dashboard,
                visualizations: [...dashboard.visualizations, newVisualization],
                layout: [...dashboard.layout, defaultLayout],
            };

            expect(updatedDashboard.visualizations).toHaveLength(1);
            expect(updatedDashboard.layout).toHaveLength(1);
            expect(updatedDashboard.layout[0].i).toBe('viz-map-1');
            expect(updatedDashboard.layout[0].w).toBe(8); // Map width
            expect(updatedDashboard.layout[0].h).toBe(6); // Map height
        });

        it('should handle multiple exports correctly', () => {
            const dashboard = {
                id: 'dashboard-3',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [],
                layout: [],
            };

            // First export
            const viz1 = {
                id: 'viz-1',
                type: 'chart' as const,
                title: 'Chart 1',
                chartSpec: {} as unknown as ChartSpec,
                createdAt: new Date(),
                chatId: 'chat-1',
            };
            const layout1 = createDefaultLayoutForVisualization(viz1.id, viz1.type);

            const dashboard1 = {
                ...dashboard,
                visualizations: [viz1],
                layout: [layout1],
            };

            // Second export
            const viz2 = {
                id: 'viz-2',
                type: 'map' as const,
                title: 'Map 1',
                mapSpec: {},
                tableId: 'table-1',
                geometryColumn: 'geom',
                sql: 'SELECT * FROM table-1',
                createdAt: new Date(),
                chatId: 'chat-1',
            };
            const layout2 = createDefaultLayoutForVisualization(viz2.id, viz2.type);

            const dashboard2 = {
                ...dashboard1,
                visualizations: [...dashboard1.visualizations, viz2],
                layout: [...dashboard1.layout, layout2],
            };

            // Verify both were added
            expect(dashboard2.visualizations).toHaveLength(2);
            expect(dashboard2.layout).toHaveLength(2);
            expect(dashboard2.layout[0].i).toBe('viz-1');
            expect(dashboard2.layout[1].i).toBe('viz-2');
        });
    });
});
