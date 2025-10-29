import React, { useEffect, useState, useRef, useMemo } from 'react';
import { VegaLite } from 'react-vega';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { View } from 'vega';
import type { TopLevelSpec } from 'vega-lite';
import { loader as vegaLoader, type Loader } from 'vega';

// Create a custom loader that queries DuckDB directly
function createDuckDBLoader(dbContext: DBContext, schema: string | null): Loader {
    const defaultLoader = vegaLoader();

    return {
        ...defaultLoader,
        load: async (uri: string) => {
            // Check if this is a DuckDB table URL: duckdb://schema/table
            if (uri.startsWith('duckdb://')) {
                // Extract table path from URI
                const path = uri.replace('duckdb://', '');
                const parts = path.split('/');

                let tableName: string;
                let schemaName: string | null = schema;

                if (parts.length === 2) {
                    // Format: duckdb://schema/table
                    schemaName = parts[0];
                    tableName = parts[1];
                } else {
                    // Format: duckdb://table (use default schema)
                    tableName = parts[0];
                }

                // Build SQL query
                const sql = `SELECT * FROM ${tableName}`;

                // Execute query directly
                const rows = await dbContext.executeQuery(sql, schemaName);

                // Return data as JSON string (Vega will parse it)
                return JSON.stringify(rows);
            }
            // For other URLs, use default loading
            return defaultLoader.load(uri);
        },
        sanitize: async (uri: string, options) => {
            // Allow duckdb:// URLs without modification
            if (uri.startsWith('duckdb://')) {
                return { href: uri };
            }
            // For other URLs, use default sanitization
            return defaultLoader.sanitize(uri, options);
        },
    };
}

interface VegaLiteChartProps {
    spec: VegaChartSpec;
    dbContext?: DBContext;
    schema?: string | null;
    showHeader?: boolean;
    enableActions?: boolean;
    onViewReady?: (view: View | null) => void;
}

const VegaLiteChart: React.FC<VegaLiteChartProps> = ({
    spec: initialSpec,
    dbContext,
    schema = null,
    showHeader = true,
    enableActions = false,
    onViewReady,
}) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentSpec, setCurrentSpec] = useState(initialSpec);
    const [prevSchema, setPrevSchema] = useState(schema);
    const [dataUrl, setDataUrl] = useState<string | null>(null);
    const vegaViewRef = useRef<View | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);

    // Create loader with current dbContext and schema
    const duckdbLoader = useMemo(() => {
        if (!dbContext) return vegaLoader();
        return createDuckDBLoader(dbContext, schema);
    }, [dbContext, schema]);

    // Clear data when schema changes
    useEffect(() => {
        if (prevSchema !== schema && prevSchema !== null) {
            setDataUrl(null);
            setError(null);
            setLoading(true);
            setPrevSchema(schema);
        }
    }, [schema, prevSchema]);

    // Update internal state when spec changes
    useEffect(() => {
        setCurrentSpec(initialSpec);
    }, [initialSpec]);

    // Update currentSpec dimensions when specWithSQL dimensions change
    useEffect(() => {
        setCurrentSpec(prev => {
            // Only update if values actually changed
            const prevWidth = 'width' in prev ? prev.width : undefined;
            const prevHeight = 'height' in prev ? prev.height : undefined;
            const prevAutosize = 'autosize' in prev ? prev.autosize : undefined;
            const prevPadding = 'padding' in prev ? prev.padding : undefined;

            const newWidth = 'width' in initialSpec ? initialSpec.width : undefined;
            const newHeight = 'height' in initialSpec ? initialSpec.height : undefined;
            const newAutosize = 'autosize' in initialSpec ? initialSpec.autosize : undefined;
            const newPadding = 'padding' in initialSpec ? initialSpec.padding : undefined;

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
                    ...(newPadding !== undefined ? { padding: newPadding } : {}),
                };
            }
            return prev;
        });
    }, [initialSpec]);

    // Observe container size changes and resize Vega view
    useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => {
            if (vegaViewRef.current) {
                // Use requestAnimationFrame to avoid resize loop
                requestAnimationFrame(() => {
                    vegaViewRef.current?.resize();
                });
            }
        });

        resizeObserver.observe(containerRef.current);

        return () => {
            resizeObserver.disconnect();
        };
    }, []);

    // Listen for window resize events (for grid layout resize)
    useEffect(() => {
        const handleWindowResize = () => {
            if (vegaViewRef.current) {
                requestAnimationFrame(() => {
                    vegaViewRef.current?.resize();
                });
            }
        };

        window.addEventListener('resize', handleWindowResize);

        return () => {
            window.removeEventListener('resize', handleWindowResize);
        };
    }, []);

    // Set data URL when spec changes - loader will query DuckDB directly
    useEffect(() => {
        if (!dbContext || !currentSpec.data || !('sql' in currentSpec.data) || !currentSpec.data.sql) {
            setLoading(false);
            setDataUrl(null);
            return;
        }

        try {
            setLoading(false);
            setError(null);

            const sql = currentSpec.data.sql;

            // Extract table name from SQL: "SELECT * FROM table_name"
            const tableMatch = sql.match(/FROM\s+([^\s;]+)/i);
            if (!tableMatch) {
                throw new Error('Could not extract table name from SQL');
            }

            const tableName = tableMatch[1];

            // Create DuckDB URL: duckdb://schema/table or duckdb://table
            const dataUri = schema ? `duckdb://${schema}/${tableName}` : `duckdb://${tableName}`;
            setDataUrl(dataUri);

            console.info(`Chart configured to load from DuckDB: ${dataUri}`);
        } catch (err) {
            console.error('Error configuring Vega-Lite chart:', err);
            setError(err instanceof Error ? err.message : 'Failed to configure chart');
            setDataUrl(null);
        }
    }, [dbContext, currentSpec, schema]);

    // Create final spec with URL data, ensuring it's valid TopLevelSpec
    // Memoize to prevent unnecessary re-renders in VegaLite component
    // This must be before any conditional returns to follow React Hooks rules
    const finalSpec: TopLevelSpec = useMemo(
        () => ({
            ...currentSpec,
            data: dataUrl ? { url: dataUrl, format: { type: 'json' } } : { values: [] },
        }),
        [currentSpec, dataUrl]
    );

    if (loading) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height:
                        ('height' in currentSpec && typeof currentSpec.height === 'number'
                            ? currentSpec.height
                            : undefined) || 300,
                    backgroundColor: '#f8f9fa',
                    border: '1px solid #dee2e6',
                    borderRadius: '4px',
                }}
            >
                <div style={{ color: '#6c757d' }}>Loading chart...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div
                style={{
                    padding: '20px',
                    backgroundColor: '#f8d7da',
                    border: '1px solid #f5c6cb',
                    borderRadius: '4px',
                    color: '#721c24',
                }}
            >
                <strong>Chart Error:</strong> {error}
            </div>
        );
    }

    return (
        <div
            ref={containerRef}
            style={{
                width: '100%',
                height: '100%',
                border: showHeader ? '1px solid #dee2e6' : 'none',
                borderRadius: showHeader ? '4px' : '0',
                backgroundColor: 'white',
                display: 'flex',
                flexDirection: 'column',
            }}
        >
            {/* Chart Header */}
            {showHeader && (
                <div className="border-b border-gray-300 px-3 py-2 bg-gray-50">
                    <div className="text-sm font-bold text-gray-700">
                        {(typeof currentSpec.title === 'string' && currentSpec.title) || 'Chart'}
                    </div>
                </div>
            )}

            {/* Chart */}
            <div
                style={{
                    flex: 1,
                    padding: '0',
                    overflow: 'visible',
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <VegaLite
                    spec={finalSpec}
                    actions={showHeader || enableActions}
                    onNewView={(view: View) => {
                        vegaViewRef.current = view;
                        onViewReady?.(view);
                    }}
                    style={{ width: '100%', height: '100%' }}
                    loader={duckdbLoader}
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
        prevProps.onViewReady === nextProps.onViewReady
    );
});
