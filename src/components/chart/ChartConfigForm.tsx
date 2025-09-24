import { useState, useEffect, useCallback } from 'react';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface ChartConfigFormProps {
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onSpecChange: (newSpec: ChartSpec) => void;
    showApplyButton?: boolean; // Optional prop to control apply button visibility
    autoApplyChanges?: boolean; // Optional prop to control automatic onSpecChange calls
}

export function ChartConfigForm({ chartSpec, dbContext, schema, onSpecChange, showApplyButton = true, autoApplyChanges = false }: ChartConfigFormProps) {
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

        // Preserve original data source and use config title
        const baseSpec = {
            $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
            title: config.title, // Use title from config
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
    }, [config, columns, chartSpec.spec]);

    // Handle manual apply of configuration changes
    const handleApplyChanges = () => {
        if (columns.length > 0) {
            const newVegaSpec = generateVegaSpec();
            const updatedSpec: ChartSpec = {
                ...chartSpec,
                title: config.title, // Update the chart spec title
                spec: newVegaSpec as ChartSpec['spec'],
                timestamp: new Date()
            };
            onSpecChange(updatedSpec);
        }
    };

    // Auto-apply changes when enabled (for modal usage)
    useEffect(() => {
        if (autoApplyChanges && columns.length > 0) {
            const newVegaSpec = generateVegaSpec();
            const updatedSpec: ChartSpec = {
                ...chartSpec,
                title: config.title,
                spec: newVegaSpec as ChartSpec['spec'],
                timestamp: new Date()
            };
            onSpecChange(updatedSpec);
        }
    }, [config, columns, chartSpec, generateVegaSpec, onSpecChange, autoApplyChanges]);

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

            {/* Title Field */}
            <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.9em', fontWeight: 'bold' }}>
                    Chart Title:
                </label>
                <input
                    type="text"
                    value={config.title}
                    onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter chart title..."
                    style={{
                        width: '100%',
                        padding: '8px',
                        fontSize: '0.9em',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                    }}
                />
            </div>

            {/* Apply Changes Button - Only show when not in modal */}
            {showApplyButton && (
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #e5e7eb' }}>
                    <button
                        onClick={handleApplyChanges}
                        disabled={columns.length === 0}
                        style={{
                            width: '100%',
                            padding: '10px',
                            backgroundColor: columns.length > 0 ? '#3b82f6' : '#9ca3af',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            fontSize: '0.9em',
                            fontWeight: '500',
                            cursor: columns.length > 0 ? 'pointer' : 'not-allowed',
                            transition: 'background-color 0.2s'
                        }}
                        onMouseOver={(e) => {
                            if (columns.length > 0) {
                                e.currentTarget.style.backgroundColor = '#2563eb';
                            }
                        }}
                        onMouseOut={(e) => {
                            if (columns.length > 0) {
                                e.currentTarget.style.backgroundColor = '#3b82f6';
                            }
                        }}
                    >
                        Apply Changes
                    </button>
                </div>
            )}
        </div>
    );
}