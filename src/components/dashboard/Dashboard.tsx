import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { ChartBarIcon, CogIcon, PuzzlePieceIcon, MapIcon, EllipsisVerticalIcon, TrashIcon, ArrowDownTrayIcon, XMarkIcon } from '@heroicons/react/24/outline';
import VegaLiteChart from '../chart/VegaLiteChart';
import Map from '../map';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface DashboardChartConfigProps {
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onSpecChange: (newSpec: ChartSpec) => void;
}

function DashboardChartConfig({ chartSpec, dbContext, schema, onSpecChange }: DashboardChartConfigProps) {
    const [columns, setColumns] = useState<Array<{name: string, type: string}>>([]);

    // Extract current configuration from the existing chart spec
    const extractCurrentConfig = useCallback(() => {
        const spec = chartSpec.spec;
        let plotType = 'scatter';
        let xField = '';
        let yField = '';
        let colorField = '';
        let sizeField = '';

        // Extract plot type from mark
        if ('mark' in spec) {
            const mark = spec.mark;
            if (typeof mark === 'object' && mark !== null && 'type' in mark) {
                if (mark.type === 'circle') plotType = 'scatter';
                else if (mark.type === 'line') plotType = 'line';
                else if (mark.type === 'bar') {
                    // Check if it's a histogram
                    if ('encoding' in spec && spec.encoding && 'x' in spec.encoding &&
                        spec.encoding.x && typeof spec.encoding.x === 'object' &&
                        'bin' in spec.encoding.x && spec.encoding.x.bin) {
                        plotType = 'histogram';
                    } else {
                        plotType = 'bar';
                    }
                }
                else if (mark.type === 'arc') plotType = 'pie';
                else if (mark.type === 'rect') plotType = 'heatmap';
                else if (mark.type === 'boxplot') plotType = 'box';
            } else if (typeof mark === 'string') {
                if (mark === 'bar') plotType = 'bar';
                else if (mark === 'rect') plotType = 'heatmap';
            }
        }

        // Extract fields from encoding
        if ('encoding' in spec && spec.encoding) {
            const encoding = spec.encoding;
            if ('x' in encoding && encoding.x && typeof encoding.x === 'object' && 'field' in encoding.x) {
                xField = String(encoding.x.field);
            }
            if ('y' in encoding && encoding.y && typeof encoding.y === 'object' && 'field' in encoding.y) {
                yField = String(encoding.y.field);
            }
            if ('color' in encoding && encoding.color && typeof encoding.color === 'object' && 'field' in encoding.color) {
                colorField = String(encoding.color.field);
            }
            if ('size' in encoding && encoding.size && typeof encoding.size === 'object' && 'field' in encoding.size) {
                sizeField = String(encoding.size.field);
            }
        }

        return {
            plotType,
            xField,
            yField,
            colorField,
            sizeField,
            title: chartSpec.title || 'Chart'
        };
    }, [chartSpec]);

    const [config, setConfig] = useState(extractCurrentConfig());

    // Fetch columns from the current table
    useEffect(() => {
        const fetchColumns = async () => {
            // Extract table name from the chart spec SQL if available
            if (chartSpec.spec.data && 'sql' in chartSpec.spec.data && chartSpec.spec.data.sql) {
                const sql = chartSpec.spec.data.sql;
                const tableMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
                if (tableMatch) {
                    try {
                        const cols = await dbContext.getTableColumns(tableMatch[1], schema);
                        setColumns(cols);
                    } catch (error) {
                        console.error('Error fetching columns:', error);
                    }
                }
            }
        };
        fetchColumns();
    }, [chartSpec, dbContext, schema]);

    const getNumericColumns = () => columns.filter(col =>
        col.type.toLowerCase().includes('int') ||
        col.type.toLowerCase().includes('double') ||
        col.type.toLowerCase().includes('real') ||
        col.type.toLowerCase().includes('decimal')
    );

    // Generate proper Vega-Lite spec based on configuration
    const generateVegaSpec = useCallback(() => {
        if (!config.xField && !['bar', 'histogram'].includes(config.plotType)) {
            return chartSpec.spec; // Return original if no valid config
        }

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

        // Preserve original data source and title
        const baseSpec = {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            title: chartSpec.spec.title || chartSpec.title || 'Chart', // Keep original title
            width: 400,
            height: 300,
            data: chartSpec.spec.data, // Keep original data source
            config: {
                view: { stroke: null },
                axis: { grid: true }
            }
        };

        const newSpec: Record<string, unknown> = { ...baseSpec };

        switch (config.plotType) {
            case 'scatter':
                if (!config.xField || !config.yField) break;
                newSpec.mark = { type: 'circle', size: 60, opacity: 0.7 };
                newSpec.encoding = {
                    x: { field: config.xField, type: getFieldType(config.xField) },
                    y: { field: config.yField, type: getFieldType(config.yField) },
                    ...(config.colorField && { color: { field: config.colorField, type: getFieldType(config.colorField) } }),
                    ...(config.sizeField && { size: { field: config.sizeField, type: getFieldType(config.sizeField) } })
                };
                break;

            case 'line':
                if (!config.xField || !config.yField) break;
                newSpec.mark = { type: 'line', point: true, strokeWidth: 2 };
                newSpec.encoding = {
                    x: { field: config.xField, type: getFieldType(config.xField) },
                    y: { field: config.yField, type: getFieldType(config.yField) },
                    ...(config.colorField && { color: { field: config.colorField, type: getFieldType(config.colorField) } })
                };
                break;

            case 'bar':
                if (!config.xField) break;
                newSpec.mark = 'bar';
                newSpec.encoding = config.yField ? {
                    x: { field: config.xField, type: getFieldType(config.xField) },
                    y: { field: config.yField, type: getFieldType(config.yField), aggregate: 'mean' },
                    ...(config.colorField && { color: { field: config.colorField, type: getFieldType(config.colorField) } })
                } : {
                    x: { field: config.xField, type: getFieldType(config.xField) },
                    y: { aggregate: 'count' },
                    ...(config.colorField && { color: { field: config.colorField, type: getFieldType(config.colorField) } })
                };
                break;

            case 'histogram':
                if (!config.xField) break;
                newSpec.mark = 'bar';
                newSpec.encoding = {
                    x: { field: config.xField, type: getFieldType(config.xField), bin: true },
                    y: { aggregate: 'count' }
                };
                break;

            case 'pie':
                if (!config.xField) break;
                newSpec.mark = { type: 'arc', innerRadius: 0 };
                newSpec.encoding = config.yField ? {
                    theta: { field: config.yField, type: getFieldType(config.yField), aggregate: 'sum' },
                    color: { field: config.xField, type: getFieldType(config.xField) }
                } : {
                    theta: { aggregate: 'count' },
                    color: { field: config.xField, type: getFieldType(config.xField) }
                };
                break;

            case 'heatmap':
                if (!config.xField || !config.yField) break;
                newSpec.mark = 'rect';
                newSpec.encoding = {
                    x: { field: config.xField, type: getFieldType(config.xField) },
                    y: { field: config.yField, type: getFieldType(config.yField) },
                    color: { aggregate: 'count', type: 'quantitative' }
                };
                break;

            case 'box':
                if (!config.yField) break;
                newSpec.mark = { type: 'boxplot', extent: 'min-max' };
                newSpec.encoding = {
                    y: { field: config.yField, type: getFieldType(config.yField) },
                    ...(config.xField && { x: { field: config.xField, type: getFieldType(config.xField) } })
                };
                break;

            default:
                return chartSpec.spec;
        }

        return newSpec;
    }, [config, columns, chartSpec.spec, chartSpec.title]);

    // Handle configuration changes
    useEffect(() => {
        if (columns.length > 0) {
            const newVegaSpec = generateVegaSpec();
            const updatedSpec: ChartSpec = {
                ...chartSpec,
                spec: newVegaSpec as ChartSpec['spec'],
                timestamp: new Date()
            };
            onSpecChange(updatedSpec);
        }
    }, [config, columns, chartSpec, generateVegaSpec, onSpecChange]);

    return (
        <div>
            {/* Chart Type */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold' }}>
                    Chart Type:
                </label>
                <select
                    value={config.plotType}
                    onChange={(e) => setConfig(prev => ({ ...prev, plotType: e.target.value }))}
                    style={{ width: '100%', padding: '8px', fontSize: '0.9em', border: '1px solid #ccc', borderRadius: '4px' }}
                >
                    <option value="scatter">Scatter Plot</option>
                    <option value="line">Line Chart</option>
                    <option value="bar">Bar Chart</option>
                    <option value="histogram">Histogram</option>
                    <option value="pie">Pie Chart</option>
                    <option value="heatmap">Heatmap</option>
                    <option value="box">Box Plot</option>
                </select>
            </div>

            {/* Field Selections */}
            {columns.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    {/* X Field */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold' }}>
                            {config.plotType === 'pie' ? 'Category:' : 'X Field:'}
                        </label>
                        <select
                            value={config.xField}
                            onChange={(e) => setConfig(prev => ({ ...prev, xField: e.target.value }))}
                            style={{ width: '100%', padding: '8px', fontSize: '0.9em', border: '1px solid #ccc', borderRadius: '4px' }}
                        >
                            <option value="">Select field...</option>
                            {columns.map(col => (
                                <option key={col.name} value={col.name}>
                                    {col.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Y Field */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold' }}>
                            {config.plotType === 'pie' ? 'Value (opt):' : 'Y Field:'}
                        </label>
                        <select
                            value={config.yField}
                            onChange={(e) => setConfig(prev => ({ ...prev, yField: e.target.value }))}
                            style={{ width: '100%', padding: '8px', fontSize: '0.9em', border: '1px solid #ccc', borderRadius: '4px' }}
                        >
                            <option value="">
                                {['bar', 'pie'].includes(config.plotType) ? 'Count records' : 'Select field...'}
                            </option>
                            {columns.map(col => (
                                <option key={col.name} value={col.name}>
                                    {col.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Optional Fields */}
            {columns.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                    {/* Color Field */}
                    {['scatter', 'line', 'bar'].includes(config.plotType) && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold' }}>
                                Color (optional):
                            </label>
                            <select
                                value={config.colorField}
                                onChange={(e) => setConfig(prev => ({ ...prev, colorField: e.target.value }))}
                                style={{ width: '100%', padding: '8px', fontSize: '0.9em', border: '1px solid #ccc', borderRadius: '4px' }}
                            >
                                <option value="">None</option>
                                {columns.map(col => (
                                    <option key={col.name} value={col.name}>
                                        {col.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}

                    {/* Size Field */}
                    {config.plotType === 'scatter' && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold' }}>
                                Size (optional):
                            </label>
                            <select
                                value={config.sizeField}
                                onChange={(e) => setConfig(prev => ({ ...prev, sizeField: e.target.value }))}
                                style={{ width: '100%', padding: '8px', fontSize: '0.9em', border: '1px solid #ccc', borderRadius: '4px' }}
                            >
                                <option value="">None</option>
                                {getNumericColumns().map(col => (
                                    <option key={col.name} value={col.name}>
                                        {col.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

interface ChartConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onUpdateChart: (vizId: string, newSpec: ChartSpec) => void;
    vizId: string;
}

function ChartConfigModal({ isOpen, onClose, chartSpec, dbContext, schema, onUpdateChart, vizId }: ChartConfigModalProps) {
    const [updatedSpec, setUpdatedSpec] = useState<ChartSpec | null>(null);

    if (!isOpen) return null;

    const handleApplyChanges = () => {
        if (updatedSpec) {
            onUpdateChart(vizId, updatedSpec);
        }
        onClose();
    };

    return (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center z-[2000]">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl max-h-[80vh] w-full mx-4 flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Chart Configuration</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Modal Content - Configuration Panel Only */}
                <div className="flex-1 overflow-auto p-6">
                    <DashboardChartConfig
                        chartSpec={chartSpec}
                        dbContext={dbContext}
                        schema={schema}
                        onSpecChange={(newSpec) => setUpdatedSpec(newSpec)}
                    />
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleApplyChanges}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 transition-colors"
                        disabled={!updatedSpec}
                    >
                        Apply Changes
                    </button>
                </div>
            </div>
        </div>
    );
}

interface ChartDropdownMenuProps {
    vizId: string;
    vizTitle: string;
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onRemove: (vizId: string) => void;
    onUpdateChart: (vizId: string, newSpec: ChartSpec) => void;
}

function ChartDropdownMenu({ vizId, vizTitle, chartSpec, dbContext, schema, onRemove, onUpdateChart }: ChartDropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleVegaConfigureOpen = () => {
        setIsConfigModalOpen(true);
        setIsOpen(false);
    };

    const handleVegaSaveAsPNG = () => {
        // Use HTML5 canvas to capture the chart as PNG
        const chartContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
        if (chartContainer) {
            const canvas = chartContainer.querySelector('canvas');
            if (canvas) {
                try {
                    canvas.toBlob((blob) => {
                        if (blob) {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${vizTitle.replace(/[^a-z0-9]/gi, '_') || 'chart'}.png`;
                            a.click();
                            URL.revokeObjectURL(url);
                        } else {
                            alert('Failed to export chart as PNG. Please try again.');
                        }
                    }, 'image/png');
                } catch (error) {
                    console.error('Error exporting PNG:', error);
                    alert('Failed to export chart as PNG. Please try again.');
                }
            } else {
                alert('Chart canvas not found. Please try again.');
            }
        }
        setIsOpen(false);
    };

    const handleVegaSaveAsSVG = () => {
        // For SVG export, we need to access the Vega view
        const chartContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
        if (chartContainer) {
            // Try to find the Vega view in various ways
            const vegaContainer = chartContainer.querySelector('[class*="vega"]');
            if (vegaContainer) {
                // Try to get SVG content directly from the DOM
                const svgElement = vegaContainer.querySelector('svg');
                if (svgElement) {
                    try {
                        const svgData = new XMLSerializer().serializeToString(svgElement);
                        const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(svgBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${vizTitle.replace(/[^a-z0-9]/gi, '_') || 'chart'}.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                    } catch (error) {
                        console.error('Error exporting SVG:', error);
                        alert('Failed to export chart as SVG. Please try again.');
                    }
                } else {
                    alert('SVG element not found. Please try PNG export instead.');
                }
            } else {
                alert('Chart not found. Please try again.');
            }
        }
        setIsOpen(false);
    };

    const handleRemove = () => {
        onRemove(vizId);
        setIsOpen(false);
    };

    return (
        <>
            <div className="relative" ref={dropdownRef}>
                <button
                    onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setIsOpen(!isOpen);
                    }}
                    onMouseDown={(e) => {
                        e.stopPropagation();
                    }}
                    className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer"
                    title="Chart options"
                    type="button"
                >
                    <EllipsisVerticalIcon className="w-4 h-4" />
                </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[1000]">
                    <div className="py-1">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleVegaConfigureOpen();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            type="button"
                        >
                            <ChartBarIcon className="w-4 h-4 mr-2" />
                            Edit Chart Style
                        </button>

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleVegaSaveAsPNG();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            type="button"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                            Save as PNG
                        </button>

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleVegaSaveAsSVG();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            type="button"
                        >
                            <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                            Save as SVG
                        </button>

                        <hr className="my-1 border-gray-200" />

                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemove();
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            type="button"
                        >
                            <TrashIcon className="w-4 h-4 mr-2" />
                            Remove
                        </button>
                    </div>
                </div>
            )}
            </div>

            {/* Configuration Modal */}
            <ChartConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                chartSpec={chartSpec}
                dbContext={dbContext}
                schema={schema}
                onUpdateChart={onUpdateChart}
                vizId={vizId}
            />
        </>
    );
}

// Re-export for backward compatibility, but use the one from remoteAtoms
export type DashboardVisualization = DashboardVisualizationType;

export interface Dashboard {
    id: string;
    title: string;
    createdAt: Date;
    visualizations: DashboardVisualization[];
    layout: Layout[];
}

interface DashboardProps {
    dashboard: Dashboard;
    dbContext: DBContext;
    schemaName: string;
    availableCharts: Record<string, ChartSpec>;
    onLayoutChange: (layout: Layout[]) => void;
    onAddVisualization: (chartId: string) => void;
    onRemoveVisualization: (vizId: string) => void;
    onUpdateDashboard: (dashboard: Dashboard) => void;
}

export function Dashboard({
    dashboard,
    dbContext,
    schemaName,
    availableCharts,
    onLayoutChange,
    onAddVisualization,
    onRemoveVisualization,
    onUpdateDashboard
}: DashboardProps) {
    const [activeTab, setActiveTab] = useState<'charts' | 'layout' | 'plugins'>('charts');


    const handleLayoutChange = useCallback((layout: Layout[]) => {
        onLayoutChange(layout);
    }, [onLayoutChange]);

    const handleAddChart = useCallback((chartId: string) => {
        const chart = availableCharts[chartId];
        if (!chart) return;

        const newVisualization: DashboardVisualization = {
            id: `viz-${Date.now()}`,
            type: 'chart',
            title: chart.title || 'Chart',
            chartSpec: chart,
            createdAt: new Date()
        };

        const newLayout: Layout = {
            i: newVisualization.id,
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            minW: 3,
            minH: 2
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
            layout: [...dashboard.layout, newLayout]
        };

        onUpdateDashboard(updatedDashboard);
        onAddVisualization(chartId);
    }, [availableCharts, dashboard, onUpdateDashboard, onAddVisualization]);

    const handleRemoveVisualization = useCallback((vizId: string) => {
        onRemoveVisualization(vizId);
    }, [onRemoveVisualization]);

    const handleUpdateChart = useCallback((vizId: string, newSpec: ChartSpec) => {
        const updatedDashboard = {
            ...dashboard,
            visualizations: dashboard.visualizations.map(viz =>
                viz.id === vizId ? { ...viz, chartSpec: newSpec, title: newSpec.title || viz.title } : viz
            )
        };
        onUpdateDashboard(updatedDashboard);
    }, [dashboard, onUpdateDashboard]);

    return (
        <div className="flex h-full">
            {/* Left Sidebar with Tabs */}
            <div className="w-80 h-full border-r border-gray-300 bg-gray-50 flex flex-col">
                {/* Tab Navigation */}
                <div className="flex-shrink-0 border-b border-gray-200 bg-white">
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('charts')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'charts'
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <ChartBarIcon className="w-4 h-4" />
                            Charts
                        </button>
                        <button
                            onClick={() => setActiveTab('layout')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'layout'
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <CogIcon className="w-4 h-4" />
                            Layout
                        </button>
                        <button
                            onClick={() => setActiveTab('plugins')}
                            className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'plugins'
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <PuzzlePieceIcon className="w-4 h-4" />
                            Plugins
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto p-4">
                    {activeTab === 'charts' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Available Charts</h3>
                            {Object.entries(availableCharts).map(([chartId, chart]) => (
                                <div
                                    key={chartId}
                                    className="p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <h4 className="text-sm font-medium text-gray-900">
                                                {chart.title || 'Untitled Chart'}
                                            </h4>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Created: {chart.timestamp?.toLocaleDateString() || 'Unknown'}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => handleAddChart(chartId)}
                                            className="ml-2 px-3 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600 transition-colors"
                                        >
                                            Add
                                        </button>
                                    </div>
                                </div>
                            ))}
                            {Object.keys(availableCharts).length === 0 && (
                                <p className="text-sm text-gray-500 text-center py-8">
                                    No charts available. Create charts in the chat to add them here.
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === 'layout' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Layout Settings</h3>
                            <div className="space-y-2">
                                <div className="p-3 bg-white border border-gray-200 rounded">
                                    <label className="text-xs font-medium text-gray-600">Grid Columns</label>
                                    <p className="text-sm text-gray-500">12 columns (default)</p>
                                </div>
                                <div className="p-3 bg-white border border-gray-200 rounded">
                                    <label className="text-xs font-medium text-gray-600">Row Height</label>
                                    <p className="text-sm text-gray-500">60px (default)</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {activeTab === 'plugins' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Plugin Settings</h3>
                            <p className="text-sm text-gray-500">
                                Plugins functionality will be available in future updates.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Side - Grid Layout */}
            <div className="flex-1 h-full overflow-auto bg-gray-50">
                <div className="p-4 h-full">
                    {dashboard.visualizations.length > 0 ? (
                        <ResponsiveGridLayout
                            className="layout"
                            layouts={{ lg: dashboard.layout }}
                            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                            rowHeight={60}
                            onLayoutChange={handleLayoutChange}
                            isDraggable={true}
                            isResizable={true}
                            resizeHandles={['se', 'sw', 'ne', 'nw']}
                        >
                            {dashboard.visualizations.map((viz) => (
                                <div
                                    key={viz.id}
                                    className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
                                    data-viz-id={viz.id}
                                >
                                    <div className="h-full flex flex-col">
                                        <div
                                            className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50"
                                            onMouseDown={(e) => e.stopPropagation()}
                                        >
                                            <h4 className="text-sm font-medium text-gray-900 truncate">
                                                {viz.title}
                                            </h4>
                                            {viz.type === 'chart' && viz.chartSpec && (
                                                <ChartDropdownMenu
                                                    vizId={viz.id}
                                                    vizTitle={viz.title}
                                                    chartSpec={viz.chartSpec}
                                                    dbContext={dbContext}
                                                    schema={schemaName}
                                                    onRemove={handleRemoveVisualization}
                                                    onUpdateChart={handleUpdateChart}
                                                />
                                            )}
                                            {viz.type !== 'chart' && (
                                                <button
                                                    onClick={() => handleRemoveVisualization(viz.id)}
                                                    className="text-gray-400 hover:text-red-500 transition-colors cursor-pointer"
                                                >
                                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                    </svg>
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex-1 p-2 overflow-hidden">
                                            {viz.type === 'chart' && viz.chartSpec ? (
                                                <div className="h-full dashboard-chart-container">
                                                    <VegaLiteChart
                                                        spec={viz.chartSpec.spec}
                                                        dbContext={dbContext}
                                                        schema={schemaName}
                                                        showHeader={false}
                                                        enableActions={false}
                                                    />
                                                </div>
                                            ) : viz.type === 'map' && viz.tableName ? (
                                                <div 
                                                    className="h-full"
                                                    onMouseDown={(e) => e.stopPropagation()}
                                                    onTouchStart={(e) => e.stopPropagation()}
                                                >
                                                    <Map
                                                        dbContext={dbContext}
                                                        schema={schemaName}
                                                        selectedTable={viz.tableName}
                                                        geometryColumnName={viz.geometryColumn}
                                                        tableStyles={viz.mapSpec?.tableStyles}
                                                        initialStyle={viz.mapSpec?.style}
                                                        showControls={false}
                                                    />
                                                </div>
                                            ) : (
                                                <div className="h-full flex items-center justify-center text-gray-500">
                                                    <div className="text-center">
                                                        <div className="mb-2">
                                                            {viz.type === 'chart' && <ChartBarIcon className="w-8 h-8 mx-auto text-gray-300" />}
                                                            {viz.type === 'map' && <MapIcon className="w-8 h-8 mx-auto text-gray-300" />}
                                                        </div>
                                                        <p className="text-sm">
                                                            {viz.type === 'chart' 
                                                                ? 'Chart spec missing' 
                                                                : viz.type === 'map'
                                                                ? 'Map table missing'
                                                                : `${viz.type} visualization`}
                                                        </p>
                                                        {viz.sql && (
                                                            <p className="text-xs mt-2 font-mono bg-gray-100 p-2 rounded">
                                                                {viz.sql}
                                                            </p>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </ResponsiveGridLayout>
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                                <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">Empty Dashboard</h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Add charts from the sidebar to get started
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}