import { useState, useEffect, useCallback, useRef } from 'react';
import { ChartTypeIconGrid, ChartTypeOption } from './ChartTypeIconGrid';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { ChartConfig, ColumnInfo } from '../../lib/chart/chartSpecGenerator';

interface ChartConfigFormProps {
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onConfigChange: (config: ChartConfig, columns: ColumnInfo[]) => void;
    showApplyButton?: boolean; // Optional prop to control apply button visibility
    autoApplyChanges?: boolean; // Optional prop to control automatic config updates
}

export function ChartConfigForm({
    chartSpec,
    dbContext,
    schema,
    onConfigChange,
    showApplyButton = true,
    autoApplyChanges = false,
}: ChartConfigFormProps) {
    const [columns, setColumns] = useState<Array<{ name: string; type: string }>>([]);

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
                    } else {
                        plotType = 'bar';
                    }
                } else if (mark.type === 'arc') plotType = 'pie';
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
            if (
                'color' in encoding &&
                encoding.color &&
                typeof encoding.color === 'object' &&
                'field' in encoding.color
            ) {
                colorField = String(encoding.color.field);
            }
            if ('size' in encoding && encoding.size && typeof encoding.size === 'object' && 'field' in encoding.size) {
                sizeField = String(encoding.size.field);
            }
        }

        // Extract width and height from spec
        let width = 400;
        let height = 300;
        let autoResize = true;

        if ('width' in spec) {
            if (spec.width === 'container') {
                autoResize = true;
            } else if (typeof spec.width === 'number') {
                width = spec.width;
                autoResize = false;
            }
        }

        if ('height' in spec && typeof spec.height === 'number' && autoResize === false) {
            height = spec.height;
        }

        return {
            plotType,
            xField,
            yField,
            colorField,
            sizeField,
            title: chartSpec.title || 'Chart',
            width,
            height,
            autoResize,
        };
    }, [chartSpec]);

    const [config, setConfig] = useState(extractCurrentConfig());
    const isInitialMount = useRef(true);
    const columnsLoadedRef = useRef(false);

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
                        // Mark that columns have finished loading
                        columnsLoadedRef.current = true;
                    } catch (error) {
                        console.error('Error fetching columns:', error);
                    }
                }
            }
        };
        fetchColumns();
    }, [chartSpec, dbContext, schema]);

    const getNumericColumns = () =>
        columns.filter(
            col =>
                col.type.toLowerCase().includes('int') ||
                col.type.toLowerCase().includes('double') ||
                col.type.toLowerCase().includes('real') ||
                col.type.toLowerCase().includes('decimal')
        );

    // Create chart config object
    const createChartConfig = useCallback((): ChartConfig | null => {
        // Extract table name from the chart spec SQL if available
        let tableName = '';
        if (chartSpec.spec.data && 'sql' in chartSpec.spec.data && chartSpec.spec.data.sql) {
            const sql = chartSpec.spec.data.sql;
            const tableMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
            if (tableMatch) {
                tableName = tableMatch[1];
            }
        }

        if (!tableName) {
            return null;
        }

        return {
            tableName,
            plotType: config.plotType,
            xField: config.xField,
            yField: config.yField,
            colorField: config.colorField,
            sizeField: config.sizeField,
            title: config.title,
            width: config.autoResize ? 'container' : config.width,
            height: config.autoResize ? 'container' : config.height,
        };
    }, [config, chartSpec.spec]);

    // Handle manual apply of configuration changes
    const handleApplyChanges = () => {
        const chartConfig = createChartConfig();
        if (chartConfig) {
            onConfigChange(chartConfig, columns);
        }
    };

    // Auto-apply changes when enabled (for modal usage)
    useEffect(() => {
        // Skip the first render to avoid triggering onChange immediately on mount
        if (isInitialMount.current) {
            isInitialMount.current = false;
            return;
        }

        // Skip if columns just loaded (first time columns populated)
        // This prevents re-render when columns are fetched asynchronously
        if (columnsLoadedRef.current && columns.length > 0) {
            columnsLoadedRef.current = false; // Reset after handling first load
            return;
        }

        if (autoApplyChanges && columns.length > 0) {
            const chartConfig = createChartConfig();
            if (chartConfig) {
                onConfigChange(chartConfig, columns);
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [config, columns, autoApplyChanges]);

    return (
        <div>
            {/* Chart Type Icons */}
            <div style={{ marginBottom: '12px' }}>
                <ChartTypeIconGrid
                    selectedType={config.plotType}
                    onSelect={(type: ChartTypeOption) => setConfig(prev => ({ ...prev, plotType: type }))}
                    iconSize="small"
                    variant="config"
                />
            </div>

            {/* Field Selections */}
            {columns.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    {/* X Field */}
                    <div>
                        <label
                            style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}
                        >
                            {config.plotType === 'pie' ? 'Category:' : 'X Field:'}
                        </label>
                        <select
                            value={config.xField}
                            onChange={e => setConfig(prev => ({ ...prev, xField: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '4px',
                                fontSize: '0.75em',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                            }}
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
                        <label
                            style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}
                        >
                            {config.plotType === 'pie' ? 'Value (opt):' : 'Y Field:'}
                        </label>
                        <select
                            value={config.yField}
                            onChange={e => setConfig(prev => ({ ...prev, yField: e.target.value }))}
                            style={{
                                width: '100%',
                                padding: '4px',
                                fontSize: '0.75em',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                            }}
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
                            <label
                                style={{
                                    display: 'block',
                                    marginBottom: '2px',
                                    fontSize: '0.75em',
                                    fontWeight: 'bold',
                                }}
                            >
                                Color (optional):
                            </label>
                            <select
                                value={config.colorField}
                                onChange={e => setConfig(prev => ({ ...prev, colorField: e.target.value }))}
                                style={{
                                    width: '100%',
                                    padding: '4px',
                                    fontSize: '0.75em',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                }}
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
                            <label
                                style={{
                                    display: 'block',
                                    marginBottom: '2px',
                                    fontSize: '0.75em',
                                    fontWeight: 'bold',
                                }}
                            >
                                Size (optional):
                            </label>
                            <select
                                value={config.sizeField}
                                onChange={e => setConfig(prev => ({ ...prev, sizeField: e.target.value }))}
                                style={{
                                    width: '100%',
                                    padding: '4px',
                                    fontSize: '0.75em',
                                    border: '1px solid #ccc',
                                    borderRadius: '4px',
                                }}
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
                    onChange={e => setConfig(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Enter chart title..."
                    style={{
                        width: '100%',
                        padding: '4px',
                        fontSize: '0.75em',
                        border: '1px solid #ccc',
                        borderRadius: '4px',
                    }}
                />
            </div>

            {/* Auto Resize Checkbox */}
            <div style={{ marginBottom: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', fontSize: '0.75em', cursor: 'pointer' }}>
                    <input
                        type="checkbox"
                        checked={config.autoResize}
                        onChange={e => setConfig(prev => ({ ...prev, autoResize: e.target.checked }))}
                        style={{ marginRight: '6px' }}
                    />
                    <span style={{ fontWeight: 'bold' }}>Auto Resize</span>
                </label>
            </div>

            {/* Width and Height Fields */}
            {!config.autoResize && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                    {/* Width Field */}
                    <div>
                        <label
                            style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}
                        >
                            Width:
                        </label>
                        <input
                            type="number"
                            value={config.width}
                            onChange={e => setConfig(prev => ({ ...prev, width: Number(e.target.value) }))}
                            min="100"
                            style={{
                                width: '100%',
                                padding: '4px',
                                fontSize: '0.75em',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                            }}
                        />
                    </div>

                    {/* Height Field */}
                    <div>
                        <label
                            style={{ display: 'block', marginBottom: '2px', fontSize: '0.75em', fontWeight: 'bold' }}
                        >
                            Height:
                        </label>
                        <input
                            type="number"
                            value={config.height}
                            onChange={e => setConfig(prev => ({ ...prev, height: Number(e.target.value) }))}
                            min="100"
                            style={{
                                width: '100%',
                                padding: '4px',
                                fontSize: '0.75em',
                                border: '1px solid #ccc',
                                borderRadius: '4px',
                            }}
                        />
                    </div>
                </div>
            )}

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
                            transition: 'background-color 0.2s',
                        }}
                        onMouseOver={e => {
                            if (columns.length > 0) {
                                e.currentTarget.style.backgroundColor = '#2563eb';
                            }
                        }}
                        onMouseOut={e => {
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
