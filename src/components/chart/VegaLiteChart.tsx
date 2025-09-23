import React, { useEffect, useState, useCallback, useRef } from 'react';
import { VegaLite } from 'react-vega';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { ChartSpec, VegaChartSpec } from '../../types/chart';

import type { TopLevelSpec } from 'vega-lite';

interface VegaLiteChartProps {
  spec: VegaChartSpec;
  dbContext?: DBContext;
  schema?: string | null;
  showHeader?: boolean;
  enableActions?: boolean;
  configOnly?: boolean;
  onSpecChange?: (newSpec: ChartSpec) => void;
}

interface ColumnInfo {
  name: string;
  type: string;
}

const VegaLiteChart: React.FC<VegaLiteChartProps> = ({ spec: initialSpec, dbContext, schema = null, showHeader = true, enableActions = false, configOnly = false, onSpecChange }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(configOnly || false);
  const chartRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState<ColumnInfo[]>([]);
  const [tables, setTables] = useState<string[]>([]);

  // Current chart configuration
  const [config, setConfig] = useState({
    tableName: extractTableName(initialSpec),
    plotType: extractPlotType(initialSpec),
    xField: extractField(initialSpec, 'x'),
    yField: extractField(initialSpec, 'y'),
    colorField: extractField(initialSpec, 'color'),
    sizeField: extractField(initialSpec, 'size'),
    title: initialSpec.title,
    width: "width" in initialSpec && initialSpec.width || 600,
    height: "height" in initialSpec && initialSpec.height || 400
  });

  const [currentSpec, setCurrentSpec] = useState(initialSpec);
  const [prevSchema, setPrevSchema] = useState(schema);

  // Clear data and config when schema changes
  useEffect(() => {
    if (prevSchema !== schema && prevSchema !== null) {
      setData([]);
      setError(null);
      setLoading(true);
      setColumns([]);
      // Reset config to prevent using old table names
      setConfig({
        tableName: '',
        plotType: 'scatter',
        xField: '',
        yField: '',
        colorField: '',
        sizeField: '',
        title: '',
        width: 600,
        height: 400
      });
      setPrevSchema(schema);
    }
  }, [schema, prevSchema]);

  // Update internal state when specWithSQL changes
  useEffect(() => {
    setCurrentSpec(initialSpec);
    setConfig({
      tableName: extractTableName(initialSpec),
      plotType: extractPlotType(initialSpec),
      xField: extractField(initialSpec, 'x'),
      yField: extractField(initialSpec, 'y'),
      colorField: extractField(initialSpec, 'color'),
      sizeField: extractField(initialSpec, 'size'),
      title: initialSpec.title,
      width: ("width" in initialSpec && typeof initialSpec.width === 'number' ? initialSpec.width : undefined) || 400,
      height: ("height" in initialSpec && typeof initialSpec.height === 'number' ? initialSpec.height : undefined) || 300
    });
  }, [initialSpec]);

  // Update currentSpec dimensions when specWithSQL dimensions change
  useEffect(() => {
    setCurrentSpec(prev => {
      // Only update if values actually changed
      const prevWidth = "width" in prev ? prev.width : undefined;
      const prevHeight = "height" in prev ? prev.height : undefined;
      const prevAutosize = "autosize" in prev ? prev.autosize : undefined;
      const prevPadding = "padding" in prev ? prev.padding : undefined;

      const newWidth = "width" in initialSpec ? initialSpec.width : undefined;
      const newHeight = "height" in initialSpec ? initialSpec.height : undefined;
      const newAutosize = "autosize" in initialSpec ? initialSpec.autosize : undefined;
      const newPadding = "padding" in initialSpec ? initialSpec.padding : undefined;

      const needsUpdate =
        prevWidth !== newWidth ||
        prevHeight !== newHeight ||
        JSON.stringify(prevAutosize) !== JSON.stringify(newAutosize) ||
        JSON.stringify(prevPadding) !== JSON.stringify(newPadding);

      if (needsUpdate) {
        return {
          ...prev,
          ...(newWidth !== undefined ? { width: newWidth } : {}),
          ...(newHeight !== undefined ? { height: newHeight } : {}),
          ...(newAutosize !== undefined ? { autosize: newAutosize } : {}),
          ...(newPadding !== undefined ? { padding: newPadding } : {})
        };
      }
      return prev;
    });
  }, [initialSpec]);

  // Extract table name from SQL query
  function extractTableName(spec: TopLevelSpec): string {
    const specWithSQL = spec as ChartSpec;
    if (specWithSQL.data && 'sql' in specWithSQL.data && specWithSQL.data.sql) {
      // Handle both "FROM table" and "FROM schema.table" patterns
      // Also handle quoted identifiers like "schema"."table"
      const patterns = [
        /FROM\s+["']?(\w+)\.["']?(\w+)["']?/i,  // schema.table or "schema"."table"
        /FROM\s+["']?(\w+)["']?/i                 // simple table name
      ];

      for (const pattern of patterns) {
        const match = specWithSQL.data.sql.match(pattern);
        if (match) {
          // If it's a schema.table pattern, return just the table name (second capture group)
          if (match.length > 2) {
            return match[2];
          }
          // Otherwise return the first capture group (simple table name)
          return match[1];
        }
      }
    }
    return '';
  }

  // Extract plot type from spec
  function extractPlotType(spec: TopLevelSpec): string {
    if (!('mark' in spec)) return 'scatter';

    const mark = spec.mark;
    if (typeof mark === 'object' && mark !== null && 'type' in mark) {
      if (mark.type === 'circle') return 'scatter';
      if (mark.type === 'line') return 'line';
      if (mark.type === 'bar') {
        // Check for histogram
        if ('encoding' in spec && spec.encoding && 'x' in spec.encoding &&
            spec.encoding.x && typeof spec.encoding.x === 'object' &&
            'bin' in spec.encoding.x && spec.encoding.x.bin) {
          return 'histogram';
        }
        return 'bar';
      }
      if (mark.type === 'arc') return 'pie';
      if (mark.type === 'rect') return 'heatmap';
      if (mark.type === 'boxplot') return 'box';
    } else if (typeof mark === 'string') {
      if (mark === 'bar') {
        // Check for histogram
        if ('encoding' in spec && spec.encoding && 'x' in spec.encoding &&
            spec.encoding.x && typeof spec.encoding.x === 'object' &&
            'bin' in spec.encoding.x && spec.encoding.x.bin) {
          return 'histogram';
        }
        return 'bar';
      }
      if (mark === 'rect') return 'heatmap';
    }
    return 'scatter';
  }

  // Extract field from encoding
  function extractField(spec: ChartSpec, encoding: string): string {
    if (!('encoding' in spec) || !spec.encoding) return '';
    const enc = spec.encoding;

    if (encoding === 'x' && 'x' in enc && enc.x && 'field' in enc.x) {
      return String(enc.x.field) || '';
    }

    if (encoding === 'y' && 'y' in enc && enc.y && 'field' in enc.y) {
      return String(enc.y.field) || '';
    }

    if (encoding === 'color' && 'color' in enc && enc.color && 'field' in enc.color) {
      return String(enc.color.field) || '';
    }

    if (encoding === 'size' && 'size' in enc && enc.size && 'field' in enc.size) {
      return String(enc.size.field) || '';
    }

    return '';
  }

  // Fetch available tables using state manager
  useEffect(() => {
    const fetchTables = async () => {
      if (!dbContext) return;

      try {
        const tableNames = await dbContext.getTables(schema);
        setTables(tableNames);
      } catch (err) {
        console.error('Error fetching tables:', err);
      }
    };

    fetchTables();
  }, [dbContext, schema]);

  // Subscribe to table changes
  useEffect(() => {
    if (!dbContext) return;

    const unsubscribe = dbContext.onTableChange(async (tableName?: string, notifySchema?: string | null) => {
      // Only refresh if the change is for our schema
      if (notifySchema !== schema) {
        return;
      }
      // Table change notification received, refreshing tables
      try {
        const tableNames = await dbContext.getTables(schema);
        setTables(tableNames);
      } catch (err) {
        console.error('Error refreshing tables:', err);
      }
    });

    return unsubscribe;
  }, [dbContext, schema]);

  // Listen for external configuration triggers
  useEffect(() => {
    const handleShowConfig = (event: CustomEvent) => {
      if (event.type === 'showChartConfig') {
        setShowConfig(true);
      }
    };

    const chartElement = chartRef.current;
    if (chartElement) {
      chartElement.addEventListener('showChartConfig', handleShowConfig as EventListener);
    }

    return () => {
      if (chartElement) {
        chartElement.removeEventListener('showChartConfig', handleShowConfig as EventListener);
      }
    };
  }, []);

  // Fetch columns when table changes
  useEffect(() => {
    const fetchColumns = async () => {
      if (!dbContext || !config.tableName) {
        setColumns([]);
        return;
      }

      // First validate that the table exists in this schema
      try {
        const isValid = await dbContext.validateTable(config.tableName, schema);
        if (!isValid) {
          // Table doesn't exist in this schema, clear columns silently
          setColumns([]);
          return;
        }
      } catch {
        // Validation failed, clear columns silently
        setColumns([]);
        return;
      }

      try {
        const cols = await dbContext.getTableColumns(config.tableName, schema);
        setColumns(cols);
      } catch {
        // This shouldn't happen if validation passed, but handle it gracefully
        setColumns([]);
      }
    };

    fetchColumns();
  }, [dbContext, config.tableName, schema]);

  // Generate new spec based on configuration
  const generateSpec = useCallback(() => {
    if (!config.tableName || !config.plotType) return initialSpec;

    const getFieldType = (fieldName: string): 'quantitative' | 'ordinal' | 'nominal' | 'temporal' => {
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
    };

    // Don't use schema-qualified table name - let dbContext handle schema context
    const tableName = config.tableName;

    const baseSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      title: config.title || `${config.plotType.charAt(0).toUpperCase() + config.plotType.slice(1)} Chart`,
      width: config.width,
      height: config.height,
      // Preserve autosize and padding from initial spec if present
      ...("autosize" in initialSpec && initialSpec.autosize ? { autosize: initialSpec.autosize } : {}),
      ...("padding" in initialSpec && initialSpec.padding !== undefined ? { padding: initialSpec.padding } : {}),
      data: {
        sql: `SELECT * FROM ${tableName} LIMIT 1000`,
        values: [] // Placeholder, will be replaced with fetched data
      },
      config: {
        view: { stroke: null },
        axis: { grid: true },
        // legend: { orient: 'right' }
      }
    };

    let spec: ChartSpec | undefined = undefined;

    try {
      switch (config.plotType) {
        case 'scatter':
          if (!config.xField || !config.yField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: {
              type: 'circle',
              size: 60,
              opacity: 0.7,
            },
            encoding: {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { field: config.yField, type: getFieldType(config.yField) },
              ...config.sizeField ? { size: { field: config.sizeField, type: getFieldType(config.sizeField) } } : {},
              ...config.colorField ? { color: { field: config.colorField, type: getFieldType(config.colorField) } } : {},
            }
          };
          break;

        case 'line':
          if (!config.xField || !config.yField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: { type: 'line', point: true, strokeWidth: 2 },
            encoding: {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { field: config.yField, type: getFieldType(config.yField) },
              ...config.colorField ? { color: { field: config.colorField, type: getFieldType(config.colorField) } } : {},
            }
          };
          break;

        case 'bar':
          if (!config.xField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: 'bar',
            encoding: config.yField ? {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { field: config.yField, type: getFieldType(config.yField), aggregate: 'mean' },
              ...config.colorField ? { color: { field: config.colorField, type: getFieldType(config.colorField) } } : {},
            } : {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { aggregate: 'count' },
              ...config.colorField ? { color: { field: config.colorField, type: getFieldType(config.colorField) } } : {},
            }
          };
          break;

        case 'histogram':
          if (!config.xField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: 'bar',
            encoding: {
              x: { field: config.xField, type: getFieldType(config.xField), bin: true },
              y: { aggregate: 'count' }
            }
          };
          break;

        case 'pie':
          if (!config.xField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: { type: 'arc', innerRadius: 0 },
            encoding: config.yField ? {
              theta: { field: config.yField, type: getFieldType(config.yField), aggregate: 'sum' },
              color: { field: config.xField, type: getFieldType(config.xField) }
            } : {
              theta: { aggregate: 'count' },
              color: { field: config.xField, type: getFieldType(config.xField) }
            }
          };
          break;

        case 'heatmap':
          if (!config.xField || !config.yField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: 'rect',
            encoding: {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { field: config.yField, type: getFieldType(config.yField) },
              color: { aggregate: 'count', type: 'quantitative' }
            }
          };
          break;

        case 'box':
          if (!config.yField) return initialSpec;
          spec = {
            ...baseSpec,
            mark: { type: 'boxplot', extent: 'min-max' },
            encoding: {
              y: { field: config.yField, type: getFieldType(config.yField) },
              ...config.xField ? { x: { field: config.xField, type: getFieldType(config.xField) } } : {},
            }
          };
          break;

        default:
          return initialSpec;
      }

      // Add tooltip -> later we can implement this
      // const tooltipFields = [config.xField, config.yField, config.colorField, config.sizeField].filter(Boolean);
      // if (tooltipFields.length > 0 && baseSpec.encoding) {
      //   baseSpec.encoding.tooltip = {
      //     field: tooltipFields[0],
      //     type: getFieldType(tooltipFields[0]!)
      //   };
      // }

      return spec || initialSpec;
    } catch (error) {
      console.error('Error generating spec:', error);
      return initialSpec;
    }
  }, [config, columns, initialSpec]);

  // Update spec when configuration changes
  useEffect(() => {
    if (columns.length > 0) {
      const newSpec = generateSpec();
      setCurrentSpec(prevSpec => {
        // Only update if the spec actually changed
        if (JSON.stringify(newSpec) !== JSON.stringify(prevSpec)) {
          // Call the callback with the new spec if provided
          if (onSpecChange && newSpec) {
            const updatedChartSpec: ChartSpec = {
              id: 'temp-' + Date.now(),
              spec: newSpec as VegaChartSpec,
              title: String(config.title) || 'Chart',
              timestamp: new Date()
            };
            onSpecChange(updatedChartSpec);
          }
          return newSpec;
        }
        return prevSpec;
      });
    }
  }, [config, columns, generateSpec, onSpecChange]);

  // Fetch data when spec changes
  useEffect(() => {
    const fetchData = async () => {
      const specWithSQL = currentSpec as ChartSpec;
      if (!dbContext || !specWithSQL.data?.sql) {
        setLoading(false);
        return;
      }

      // Extract table name from SQL to validate it exists
      const tableName = extractTableName(currentSpec);
      if (tableName) {
        try {
          const isValid = await dbContext.validateTable(tableName, schema);
          if (!isValid) {
            // Table doesn't exist in this schema, silently skip
            setData([]);
            setError(null);
            setLoading(false);
            return;
          }
        } catch {
          // Validation failed, silently skip
          setData([]);
          setError(null);
          setLoading(false);
          return;
        }
      }

      try {
        setLoading(true);
        setError(null);

        // Execute SQL query for chart data
        const rows = await dbContext.executeQuery(specWithSQL.data.sql, schema);
        setData(rows);
      } catch (err) {
        console.error('Error fetching data for Vega-Lite chart:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dbContext, currentSpec, schema]);

  const getNumericColumns = () => columns.filter((col: ColumnInfo) =>
    col.type.toLowerCase().includes('int') ||
    col.type.toLowerCase().includes('double') ||
    col.type.toLowerCase().includes('real') ||
    col.type.toLowerCase().includes('decimal')
  );


  if (loading) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: ("height" in currentSpec && typeof currentSpec.height === 'number' ? currentSpec.height : undefined) || 300,
        backgroundColor: '#f8f9fa',
        border: '1px solid #dee2e6',
        borderRadius: '4px'
      }}>
        <div style={{ color: '#6c757d' }}>Loading chart...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{
        padding: '20px',
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '4px',
        color: '#721c24'
      }}>
        <strong>Chart Error:</strong> {error}
      </div>
    );
  }

  // Create final spec with data values, ensuring it's valid TopLevelSpec
  const finalSpec: TopLevelSpec = {
    ...currentSpec,
    data: { values: data }
  };

  // If configOnly is true, return only the configuration panel
  if (configOnly) {
    return (
      <div ref={chartRef}>
        {/* Configuration Panel */}
        <div style={{
          padding: '0',
          backgroundColor: 'white'
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {/* Table Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                Table:
              </label>
              <select
                value={config.tableName}
                onChange={(e) => setConfig(prev => ({ ...prev, tableName: e.target.value }))}
                style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
              >
                <option value="">Select table...</option>
                {tables.map((table: string) => (
                  <option key={table} value={table}>{table}</option>
                ))}
              </select>
            </div>

            {/* Chart Type */}
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                Chart Type:
              </label>
              <select
                value={config.plotType}
                onChange={(e) => setConfig(prev => ({ ...prev, plotType: e.target.value }))}
                style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
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
          </div>

          {/* Field Selections */}
          {columns.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {/* X Field */}
              {(['scatter', 'line', 'bar', 'histogram', 'pie', 'heatmap', 'box'].includes(config.plotType)) && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    {config.plotType === 'pie' ? 'Category:' : 'X Field:'}
                  </label>
                  <select
                    value={config.xField}
                    onChange={(e) => setConfig(prev => ({ ...prev, xField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">Select field...</option>
                    {columns.map((col: ColumnInfo) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Y Field */}
              {(['scatter', 'line', 'heatmap', 'box'].includes(config.plotType) ||
                (['bar', 'pie'].includes(config.plotType))) && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    {config.plotType === 'pie' ? 'Value (opt):' : config.plotType === 'box' ? 'Y Field:' : 'Y Field:'}
                  </label>
                  <select
                    value={config.yField}
                    onChange={(e) => setConfig(prev => ({ ...prev, yField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">
                      {['bar', 'pie'].includes(config.plotType) ? 'Count records' : 'Select field...'}
                    </option>
                    {columns.map((col: ColumnInfo) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Optional Fields */}
          {columns.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
              {/* Color Field */}
              {['scatter', 'line', 'bar'].includes(config.plotType) && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    Color (opt):
                  </label>
                  <select
                    value={config.colorField}
                    onChange={(e) => setConfig(prev => ({ ...prev, colorField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">None</option>
                    {columns.map((col: ColumnInfo) => (
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
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    Size (opt):
                  </label>
                  <select
                    value={config.sizeField}
                    onChange={(e) => setConfig(prev => ({ ...prev, sizeField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">None</option>
                    {getNumericColumns().map((col: ColumnInfo) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title */}
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                  Title:
                </label>
                <input
                  type="text"
                  value={String(config.title)}
                  onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Chart title..."
                  style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={chartRef}
      style={{
        border: showHeader ? '1px solid #dee2e6' : 'none',
        borderRadius: showHeader ? '4px' : '0',
        backgroundColor: 'white'
      }}
    >
      {/* Chart Header with Controls */}
      {showHeader && (
        <div style={{
          borderBottom: '1px solid #dee2e6',
          padding: '8px 12px',
          backgroundColor: '#f8f9fa',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          overflow: 'visible'
        }}>
          <div style={{ fontSize: '0.9em', fontWeight: 'bold', color: '#495057' }}>
            {String(config.title) || 'Interactive Chart'}
          </div>
          <button
            onClick={() => setShowConfig(!showConfig)}
            style={{
              background: 'none',
              border: '1px solid #6c757d',
              borderRadius: '3px',
              padding: '4px 8px',
              fontSize: '0.8em',
              cursor: 'pointer',
              color: '#6c757d'
            }}
          >
            {showConfig ? '✕ Hide Settings' : '⚙️ Configure'}
          </button>
        </div>
      )}

      {/* Configuration Panel */}
      {showConfig && (
        <div style={{
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderBottom: showHeader ? '1px solid #dee2e6' : 'none',
          border: showHeader ? 'none' : '1px solid #dee2e6',
          borderRadius: showHeader ? '0' : '4px',
          position: showHeader ? 'static' : 'relative'
        }}>
          {/* Close button when no header */}
          {!showHeader && (
            <button
              onClick={() => setShowConfig(false)}
              style={{
                position: 'absolute',
                top: '8px',
                right: '8px',
                background: 'none',
                border: 'none',
                fontSize: '18px',
                cursor: 'pointer',
                color: '#6c757d'
              }}
              title="Close configuration"
            >
              ×
            </button>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
            {/* Table Selection */}
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                Table:
              </label>
              <select
                value={config.tableName}
                onChange={(e) => setConfig(prev => ({ ...prev, tableName: e.target.value }))}
                style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
              >
                <option value="">Select table...</option>
                {tables.map((table: string) => (
                  <option key={table} value={table}>{table}</option>
                ))}
              </select>
            </div>

            {/* Chart Type */}
            <div>
              <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                Chart Type:
              </label>
              <select
                value={config.plotType}
                onChange={(e) => setConfig(prev => ({ ...prev, plotType: e.target.value }))}
                style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
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
          </div>

          {/* Field Selections */}
          {columns.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
              {/* X Field */}
              {(['scatter', 'line', 'bar', 'histogram', 'pie', 'heatmap', 'box'].includes(config.plotType)) && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    {config.plotType === 'pie' ? 'Category:' : 'X Field:'}
                  </label>
                  <select
                    value={config.xField}
                    onChange={(e) => setConfig(prev => ({ ...prev, xField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">Select field...</option>
                    {columns.map((col: ColumnInfo) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Y Field */}
              {(['scatter', 'line', 'heatmap', 'box'].includes(config.plotType) ||
                (['bar', 'pie'].includes(config.plotType))) && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    {config.plotType === 'pie' ? 'Value (opt):' : config.plotType === 'box' ? 'Y Field:' : 'Y Field:'}
                  </label>
                  <select
                    value={config.yField}
                    onChange={(e) => setConfig(prev => ({ ...prev, yField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">
                      {['bar', 'pie'].includes(config.plotType) ? 'Count records' : 'Select field...'}
                    </option>
                    {columns.map((col: ColumnInfo) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Optional Fields */}
          {columns.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 2fr', gap: '12px' }}>
              {/* Color Field */}
              {['scatter', 'line', 'bar'].includes(config.plotType) && (
                <div>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    Color (opt):
                  </label>
                  <select
                    value={config.colorField}
                    onChange={(e) => setConfig(prev => ({ ...prev, colorField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">None</option>
                    {columns.map((col: ColumnInfo) => (
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
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                    Size (opt):
                  </label>
                  <select
                    value={config.sizeField}
                    onChange={(e) => setConfig(prev => ({ ...prev, sizeField: e.target.value }))}
                    style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                  >
                    <option value="">None</option>
                    {getNumericColumns().map((col: ColumnInfo) => (
                      <option key={col.name} value={col.name}>
                        {col.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Title */}
              <div>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '0.85em', fontWeight: 'bold' }}>
                  Title:
                </label>
                <input
                  type="text"
                  value={String(config.title)}
                  onChange={(e) => setConfig(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Chart title..."
                  style={{ width: '100%', padding: '6px', fontSize: '0.9em' }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      <div style={{ padding: '0', overflow: 'visible' }}>
        <VegaLite
          spec={finalSpec}
          actions={showHeader || enableActions}
        />
      </div>
    </div>
  );
};

export default React.memo(VegaLiteChart, (prevProps, nextProps) => {
  // Custom comparison to prevent re-renders when only unrelated props change
  return (
    prevProps.spec === nextProps.spec &&
    prevProps.dbContext === nextProps.dbContext &&
    prevProps.schema === nextProps.schema &&
    prevProps.showHeader === nextProps.showHeader &&
    prevProps.enableActions === nextProps.enableActions &&
    prevProps.configOnly === nextProps.configOnly &&
    prevProps.onSpecChange === nextProps.onSpecChange
  );
});
