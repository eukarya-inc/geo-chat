import React, { useEffect, useState, useCallback } from 'react';
import { VegaLite } from 'react-vega';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';

import type { VegaLiteSpec } from '../types/vega';

interface VegaLiteChartProps {
  spec: VegaLiteSpec;
  db?: AsyncDuckDB;
  dbStateManager?: DBStateManager;
}

interface ColumnInfo {
  name: string;
  type: string;
}

const VegaLiteChart: React.FC<VegaLiteChartProps> = ({ spec: initialSpec, dbStateManager }) => {
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showConfig, setShowConfig] = useState(false);
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
    title: (typeof initialSpec.title === 'object' && initialSpec.title?.text) || 
           (typeof initialSpec.title === 'string' ? initialSpec.title : '') || '',
    width: initialSpec.width || 600,
    height: initialSpec.height || 400
  });

  const [currentSpec, setCurrentSpec] = useState(initialSpec);

  // Update internal state when initialSpec changes
  useEffect(() => {
    setCurrentSpec(initialSpec);
    setConfig({
      tableName: extractTableName(initialSpec),
      plotType: extractPlotType(initialSpec),
      xField: extractField(initialSpec, 'x'),
      yField: extractField(initialSpec, 'y'),
      colorField: extractField(initialSpec, 'color'),
      sizeField: extractField(initialSpec, 'size'),
      title: (typeof initialSpec.title === 'object' && initialSpec.title?.text) || 
             (typeof initialSpec.title === 'string' ? initialSpec.title : '') || '',
      width: initialSpec.width || 400,
      height: initialSpec.height || 300
    });
  }, [initialSpec]);

  // Update currentSpec dimensions when initialSpec dimensions change
  useEffect(() => {
    if (initialSpec.width !== currentSpec.width || initialSpec.height !== currentSpec.height) {
      setCurrentSpec(prev => ({
        ...prev,
        width: initialSpec.width,
        height: initialSpec.height,
        // Also update autosize and padding if present
        ...(initialSpec.autosize ? { autosize: initialSpec.autosize } : {}),
        ...(initialSpec.padding !== undefined ? { padding: initialSpec.padding } : {})
      }));
    }
  }, [initialSpec.width, initialSpec.height, initialSpec.autosize, initialSpec.padding, currentSpec.width, currentSpec.height]);

  // Extract table name from SQL query
  function extractTableName(spec: VegaLiteSpec): string {
    if (spec.data?.sql) {
      // Handle both "FROM table" and "FROM schema.table" patterns
      // Also handle quoted identifiers like "schema"."table"
      const patterns = [
        /FROM\s+["']?(\w+)\.["']?(\w+)["']?/i,  // schema.table or "schema"."table"
        /FROM\s+["']?(\w+)["']?/i                 // simple table name
      ];
      
      for (const pattern of patterns) {
        const match = spec.data.sql.match(pattern);
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
  function extractPlotType(spec: VegaLiteSpec): string {
    if (typeof spec.mark === 'object' && spec.mark?.type === 'circle') return 'scatter';
    if (typeof spec.mark === 'object' && (spec.mark?.type === 'line' || (spec.mark?.type === 'line' && spec.mark?.point))) return 'line';
    if (spec.mark === 'bar' || (typeof spec.mark === 'object' && spec.mark?.type === 'bar')) return 'bar';
    if (spec.mark === 'bar' && spec.encoding?.x?.bin) return 'histogram';
    if (typeof spec.mark === 'object' && spec.mark?.type === 'arc') return 'pie';
    if (spec.mark === 'rect' || (typeof spec.mark === 'object' && spec.mark?.type === 'rect')) return 'heatmap';
    if (typeof spec.mark === 'object' && spec.mark?.type === 'boxplot') return 'box';
    return 'scatter';
  }

  // Extract field from encoding
  function extractField(spec: VegaLiteSpec, encoding: string): string {
    return spec.encoding?.[encoding]?.field || '';
  }

  // Fetch available tables using state manager
  useEffect(() => {
    const fetchTables = async () => {
      if (!dbStateManager) return;
      
      try {
        const tableNames = await dbStateManager.getTables();
        setTables(tableNames);
      } catch (err) {
        console.error('Error fetching tables:', err);
      }
    };

    fetchTables();
  }, [dbStateManager]);

  // Subscribe to table changes
  useEffect(() => {
    if (!dbStateManager) return;

    const unsubscribe = dbStateManager.onTableChange(async () => {
      console.log('VegaLite: Received table change notification, refreshing tables');
      try {
        const tableNames = await dbStateManager.getTables();
        setTables(tableNames);
      } catch (err) {
        console.error('Error refreshing tables:', err);
      }
    });

    return unsubscribe;
  }, [dbStateManager]);

  // Fetch columns when table changes
  useEffect(() => {
    const fetchColumns = async () => {
      if (!dbStateManager || !config.tableName) {
        setColumns([]);
        return;
      }

      try {
        const cols = await dbStateManager.getTableColumns(config.tableName);
        setColumns(cols);
      } catch (err) {
        console.error('Error fetching columns:', err);
        setColumns([]);
      }
    };

    fetchColumns();
  }, [dbStateManager, config.tableName]);

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

    // Get schema-qualified table name if schema is set
    const currentSchema = dbStateManager?.getCurrentSchema();
    const qualifiedTableName = currentSchema ? `${currentSchema}.${config.tableName}` : config.tableName;

    const baseSpec: VegaLiteSpec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
      title: config.title || `${config.plotType.charAt(0).toUpperCase() + config.plotType.slice(1)} Chart`,
      width: config.width,
      height: config.height,
      // Preserve autosize and padding from initial spec if present
      ...(initialSpec.autosize ? { autosize: initialSpec.autosize } : {}),
      ...(initialSpec.padding !== undefined ? { padding: initialSpec.padding } : {}),
      data: {
        sql: `SELECT * FROM ${qualifiedTableName} LIMIT 1000`
      },
      config: {
        view: { stroke: null },
        axis: { grid: true },
        legend: { orient: 'right' }
      }
    };

    try {
      switch (config.plotType) {
        case 'scatter':
          if (!config.xField || !config.yField) return initialSpec;
          baseSpec.mark = { type: 'circle', size: 60, opacity: 0.7 };
          baseSpec.encoding = {
            x: { field: config.xField, type: getFieldType(config.xField) },
            y: { field: config.yField, type: getFieldType(config.yField) }
          };
          if (config.colorField) {
            baseSpec.encoding.color = { field: config.colorField, type: getFieldType(config.colorField) };
          }
          if (config.sizeField) {
            baseSpec.encoding.size = { field: config.sizeField, type: getFieldType(config.sizeField) };
          }
          break;

        case 'line':
          if (!config.xField || !config.yField) return initialSpec;
          baseSpec.mark = { type: 'line', point: true, strokeWidth: 2 };
          baseSpec.encoding = {
            x: { field: config.xField, type: getFieldType(config.xField) },
            y: { field: config.yField, type: getFieldType(config.yField) }
          };
          if (config.colorField) {
            baseSpec.encoding.color = { field: config.colorField, type: getFieldType(config.colorField) };
          }
          break;

        case 'bar':
          if (!config.xField) return initialSpec;
          baseSpec.mark = 'bar';
          
          if (config.yField) {
            baseSpec.encoding = {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { field: config.yField, type: getFieldType(config.yField), aggregate: 'mean' }
            };
          } else {
            baseSpec.encoding = {
              x: { field: config.xField, type: getFieldType(config.xField) },
              y: { aggregate: 'count' }
            };
          }
          
          if (config.colorField) {
            baseSpec.encoding.color = { field: config.colorField, type: getFieldType(config.colorField) };
          }
          break;

        case 'histogram':
          if (!config.xField) return initialSpec;
          baseSpec.mark = 'bar';
          baseSpec.encoding = {
            x: { field: config.xField, type: getFieldType(config.xField), bin: true },
            y: { aggregate: 'count' }
          };
          break;

        case 'pie':
          if (!config.xField) return initialSpec;
          baseSpec.mark = { type: 'arc', innerRadius: 0 };
          
          if (config.yField) {
            baseSpec.encoding = {
              theta: { field: config.yField, type: getFieldType(config.yField), aggregate: 'sum' },
              color: { field: config.xField, type: getFieldType(config.xField) }
            };
          } else {
            baseSpec.encoding = {
              theta: { aggregate: 'count' },
              color: { field: config.xField, type: getFieldType(config.xField) }
            };
          }
          break;

        case 'heatmap':
          if (!config.xField || !config.yField) return initialSpec;
          baseSpec.mark = 'rect';
          baseSpec.encoding = {
            x: { field: config.xField, type: getFieldType(config.xField) },
            y: { field: config.yField, type: getFieldType(config.yField) },
            color: { aggregate: 'count', type: 'quantitative' }
          };
          break;

        case 'box':
          if (!config.yField) return initialSpec;
          baseSpec.mark = { type: 'boxplot', extent: 'min-max' };
          baseSpec.encoding = {
            y: { field: config.yField, type: getFieldType(config.yField) }
          };
          if (config.xField) {
            baseSpec.encoding.x = { field: config.xField, type: getFieldType(config.xField) };
          }
          break;

        default:
          return initialSpec;
      }

      // Add tooltip
      const tooltipFields = [config.xField, config.yField, config.colorField, config.sizeField].filter(Boolean);
      if (tooltipFields.length > 0 && baseSpec.encoding) {
        baseSpec.encoding.tooltip = {
          field: tooltipFields[0],
          type: getFieldType(tooltipFields[0]!)
        };
      }

      return baseSpec;
    } catch (error) {
      console.error('Error generating spec:', error);
      return initialSpec;
    }
  }, [config, columns, initialSpec, dbStateManager]);

  // Update spec when configuration changes
  useEffect(() => {
    if (columns.length > 0) {
      const newSpec = generateSpec();
      if (JSON.stringify(newSpec) !== JSON.stringify(currentSpec)) {
        setCurrentSpec(newSpec);
      }
    }
  }, [config, columns, generateSpec, currentSpec]);

  // Fetch data when spec changes
  useEffect(() => {
    const fetchData = async () => {
      if (!dbStateManager || !currentSpec.data?.sql) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        console.log('VegaLite: Executing SQL:', currentSpec.data.sql);
        const rows = await dbStateManager.executeQuery(currentSpec.data.sql);
        
        console.log(`VegaLite: Fetched ${rows.length} rows for chart`);
        setData(rows);
      } catch (err) {
        console.error('Error fetching data for Vega-Lite chart:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dbStateManager, currentSpec.data?.sql]);

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
        height: currentSpec.height || 300,
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

  const finalSpec: VegaLiteSpec = {
    ...currentSpec,
    data: { values: data }
  };

  // Remove sql property if it exists
  if (finalSpec.data && 'sql' in finalSpec.data) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { sql, ...dataWithoutSql } = finalSpec.data;
    finalSpec.data = dataWithoutSql;
  }

  return (
    <div style={{ 
      border: '1px solid #dee2e6',
      borderRadius: '4px',
      backgroundColor: 'white'
    }}>
      {/* Chart Header with Controls */}
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
          {config.title || 'Interactive Chart'}
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

      {/* Configuration Panel */}
      {showConfig && (
        <div style={{ 
          padding: '15px',
          backgroundColor: '#f8f9fa',
          borderBottom: '1px solid #dee2e6'
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
                  value={config.title}
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
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          spec={finalSpec as any}
          actions={true}
        />
      </div>
    </div>
  );
};

export default VegaLiteChart;
