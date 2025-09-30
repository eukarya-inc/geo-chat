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
    showExportButton?: boolean; // Optional prop to show export button
    onExport?: () => void; // Export handler
    isExportDisabled?: boolean; // Whether export is disabled
    exportTooltip?: string; // Export button tooltip
    showSaveButton?: boolean; // Optional prop to show save button
    onSave?: () => void; // Save handler
    isSaveDisabled?: boolean; // Whether save is disabled
    saveTooltip?: string; // Save button tooltip
}

export function ChartConfigForm({
    chartSpec,
    dbContext,
    schema,
    onSpecChange,
    showApplyButton = true,
    autoApplyChanges = false,
    showExportButton = false,
    onExport,
    isExportDisabled = false,
    exportTooltip = "Export chart",
    showSaveButton = false,
    onSave,
    isSaveDisabled = false,
    saveTooltip = "Save chart as image"
}: ChartConfigFormProps) {
    const [columns, setColumns] = useState<Array<{name: string, type: string}>>([]);
    const [hoveredChart, setHoveredChart] = useState<string | null>(null);
    const [hoveredButton, setHoveredButton] = useState<string | null>(null);

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
            {/* Chart Type Icons */}
            <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.75em', fontWeight: 'bold' }}>
                    Chart Type:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                    {/* Scatter Plot */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'scatter' }))}
                            onMouseEnter={() => setHoveredChart('scatter')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'scatter' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'scatter' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Scatter Plot"
                        >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                            <circle cx="6" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><circle cx="12" cy="12" r="2"/>
                            <circle cx="9" cy="18" r="2"/><circle cx="18" cy="6" r="2"/>
                        </svg>
                        </button>
                        {hoveredChart === 'scatter' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Scatter Plot
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>

                    {/* Line Chart */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'line' }))}
                            onMouseEnter={() => setHoveredChart('line')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'line' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'line' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Line Chart"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 17l6-6 4 4 8-8"/>
                            </svg>
                        </button>
                        {hoveredChart === 'line' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Line Chart
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>

                    {/* Bar Chart */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'bar' }))}
                            onMouseEnter={() => setHoveredChart('bar')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'bar' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'bar' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Bar Chart"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 3v18h18M9 17V9m4 8V5m4 12v-7"/>
                            </svg>
                        </button>
                        {hoveredChart === 'bar' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Bar Chart
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>

                    {/* Histogram */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'histogram' }))}
                            onMouseEnter={() => setHoveredChart('histogram')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'histogram' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'histogram' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Histogram"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 3v18h18M5 17v-6m3 6v-4m3 4v-8m3 8v-3m3 3v-5"/>
                            </svg>
                        </button>
                        {hoveredChart === 'histogram' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Histogram
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>

                    {/* Pie Chart */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'pie' }))}
                            onMouseEnter={() => setHoveredChart('pie')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'pie' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'pie' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Pie Chart"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M11 2a10 10 0 1 0 10 10h-10z"/>
                                <path d="M21 12A10 10 0 0 0 12 2v10z"/>
                            </svg>
                        </button>
                        {hoveredChart === 'pie' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Pie Chart
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>

                    {/* Heatmap */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'heatmap' }))}
                            onMouseEnter={() => setHoveredChart('heatmap')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'heatmap' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'heatmap' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Heatmap"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="4" height="4"/><rect x="10" y="3" width="4" height="4"/>
                                <rect x="17" y="3" width="4" height="4"/><rect x="3" y="10" width="4" height="4"/>
                                <rect x="10" y="10" width="4" height="4"/><rect x="17" y="10" width="4" height="4"/>
                            </svg>
                        </button>
                        {hoveredChart === 'heatmap' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Heatmap
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>

                    {/* Box Plot */}
                    <div style={{ position: 'relative' }}>
                        <button
                            type="button"
                            onClick={() => setConfig(prev => ({ ...prev, plotType: 'box' }))}
                            onMouseEnter={() => setHoveredChart('box')}
                            onMouseLeave={() => setHoveredChart(null)}
                            style={{
                                padding: '4px',
                                border: `1px solid ${config.plotType === 'box' ? '#3b82f6' : '#e5e7eb'}`,
                                backgroundColor: config.plotType === 'box' ? '#eff6ff' : 'white',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                display: 'flex',
                                flexDirection: 'column',
                                alignItems: 'center',
                                minWidth: '40px'
                            }}
                            title="Box Plot"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M8 6h8v12H8z"/><path d="M6 9h4m6 0h4M6 15h4m6 0h4M12 3v3m0 12v3"/>
                            </svg>
                        </button>
                        {hoveredChart === 'box' && (
                            <div style={{
                                position: 'absolute',
                                top: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                backgroundColor: '#374151',
                                color: 'white',
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '0.75em',
                                whiteSpace: 'nowrap',
                                zIndex: 1000,
                                pointerEvents: 'none'
                            }}>
                                Box Plot
                                <div style={{
                                    position: 'absolute',
                                    top: '100%',
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    width: 0,
                                    height: 0,
                                    borderLeft: '4px solid transparent',
                                    borderRight: '4px solid transparent',
                                    borderTop: '4px solid #374151'
                                }} />
                            </div>
                        )}
                    </div>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                        {/* Save Icon */}
                        {showSaveButton && (
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={onSave}
                                    disabled={isSaveDisabled}
                                    onMouseEnter={() => setHoveredButton('save')}
                                    onMouseLeave={() => setHoveredButton(null)}
                                    title={saveTooltip}
                                    style={{
                                        padding: '4px',
                                        border: '1px solid #e5e7eb',
                                        backgroundColor: 'white',
                                        borderRadius: '4px',
                                        cursor: !isSaveDisabled ? 'pointer' : 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: '40px',
                                        opacity: isSaveDisabled ? 0.5 : 1
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                        <polyline points="17,21 17,13 7,13 7,21"/>
                                        <polyline points="7,3 7,8 15,8"/>
                                    </svg>
                                </button>
                                {hoveredButton === 'save' && !isSaveDisabled && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-30px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: '#374151',
                                        color: 'white',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.75em',
                                        whiteSpace: 'nowrap',
                                        zIndex: 1000,
                                        pointerEvents: 'none'
                                    }}>
                                        Save as image
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: 0,
                                            height: 0,
                                            borderLeft: '4px solid transparent',
                                            borderRight: '4px solid transparent',
                                            borderTop: '4px solid #374151'
                                        }} />
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Export Icon */}
                        {showExportButton && (
                            <div style={{ position: 'relative' }}>
                                <button
                                    onClick={onExport}
                                    disabled={isExportDisabled}
                                    onMouseEnter={() => setHoveredButton('export')}
                                    onMouseLeave={() => setHoveredButton(null)}
                                    title={exportTooltip}
                                    style={{
                                        padding: '4px',
                                        border: '1px solid #e5e7eb',
                                        backgroundColor: 'white',
                                        borderRadius: '4px',
                                        cursor: !isExportDisabled ? 'pointer' : 'not-allowed',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        minWidth: '40px',
                                        opacity: isExportDisabled ? 0.5 : 1
                                    }}
                                >
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                        <polyline points="17,8 12,3 7,8"/>
                                        <line x1="12" y1="3" x2="12" y2="15" stroke="#3b82f6"/>
                                    </svg>
                                </button>
                                {hoveredButton === 'export' && !isExportDisabled && (
                                    <div style={{
                                        position: 'absolute',
                                        top: '-30px',
                                        left: '50%',
                                        transform: 'translateX(-50%)',
                                        backgroundColor: '#374151',
                                        color: 'white',
                                        padding: '4px 8px',
                                        borderRadius: '4px',
                                        fontSize: '0.75em',
                                        whiteSpace: 'nowrap',
                                        zIndex: 1000,
                                        pointerEvents: 'none'
                                    }}>
                                        Export to dashboard
                                        <div style={{
                                            position: 'absolute',
                                            top: '100%',
                                            left: '50%',
                                            transform: 'translateX(-50%)',
                                            width: 0,
                                            height: 0,
                                            borderLeft: '4px solid transparent',
                                            borderRight: '4px solid transparent',
                                            borderTop: '4px solid #374151'
                                        }} />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Field Selections */}
            {columns.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    {/* X Field */}
                    <div>
                        <label style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}>
                            {config.plotType === 'pie' ? 'Category:' : 'X Field:'}
                        </label>
                        <select
                            value={config.xField}
                            onChange={(e) => setConfig(prev => ({ ...prev, xField: e.target.value }))}
                            style={{ width: '100%', padding: '4px', fontSize: '0.75em', border: '1px solid #ccc', borderRadius: '4px' }}
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
                        <label style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}>
                            {config.plotType === 'pie' ? 'Value (opt):' : 'Y Field:'}
                        </label>
                        <select
                            value={config.yField}
                            onChange={(e) => setConfig(prev => ({ ...prev, yField: e.target.value }))}
                            style={{ width: '100%', padding: '4px', fontSize: '0.75em', border: '1px solid #ccc', borderRadius: '4px' }}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    {/* Color Field */}
                    {['scatter', 'line', 'bar'].includes(config.plotType) && (
                        <div>
                            <label style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}>
                                Color (optional):
                            </label>
                            <select
                                value={config.colorField}
                                onChange={(e) => setConfig(prev => ({ ...prev, colorField: e.target.value }))}
                                style={{ width: '100%', padding: '4px', fontSize: '0.75em', border: '1px solid #ccc', borderRadius: '4px' }}
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
                            <label style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}>
                                Size (optional):
                            </label>
                            <select
                                value={config.sizeField}
                                onChange={(e) => setConfig(prev => ({ ...prev, sizeField: e.target.value }))}
                                style={{ width: '100%', padding: '4px', fontSize: '0.75em', border: '1px solid #ccc', borderRadius: '4px' }}
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
            <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}>
                    Title:
                </label>
                <input
                    type="text"
                    value={config.title}
                    onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter chart title..."
                    style={{
                        width: '100%',
                        padding: '4px',
                        fontSize: '0.75em',
                        border: '1px solid #ccc',
                        borderRadius: '4px'
                    }}
                />
            </div>

            {/* Apply Changes Button */}
            {showApplyButton && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px solid #e5e7eb' }}>
                    <button
                        onClick={handleApplyChanges}
                        disabled={columns.length === 0}
                        style={{
                            width: '100%',
                            padding: '6px',
                            backgroundColor: columns.length > 0 ? '#3b82f6' : '#9ca3af',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            fontSize: '0.75em',
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
