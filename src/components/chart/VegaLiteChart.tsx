import React, { useEffect, useState, useRef, useMemo } from 'react';
import { VegaLite } from 'react-vega';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { View } from 'vega';
import type { TopLevelSpec } from 'vega-lite';

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
    const [data, setData] = useState<Record<string, unknown>[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [currentSpec, setCurrentSpec] = useState(initialSpec);
    const [prevSchema, setPrevSchema] = useState(schema);
    const vegaViewRef = useRef<View | null>(null);

    // Clear data when schema changes
    useEffect(() => {
        if (prevSchema !== schema && prevSchema !== null) {
            setData([]);
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

    // Fetch data when spec changes
    useEffect(() => {
        const fetchData = async () => {
            if (!dbContext || !currentSpec.data || !('sql' in currentSpec.data) || !currentSpec.data.sql) {
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                setError(null);

                // Execute SQL query for chart data
                const rows = await dbContext.executeQuery(currentSpec.data.sql, schema);
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

    // Create final spec with data values, ensuring it's valid TopLevelSpec
    // Memoize to prevent unnecessary re-renders in VegaLite component
    // This must be before any conditional returns to follow React Hooks rules
    const finalSpec: TopLevelSpec = useMemo(
        () => ({
            ...currentSpec,
            data: { values: data },
        }),
        [currentSpec, data]
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
            style={{
                border: showHeader ? '1px solid #dee2e6' : 'none',
                borderRadius: showHeader ? '4px' : '0',
                backgroundColor: 'white',
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
            <div style={{ padding: '0', overflow: 'visible' }}>
                <VegaLite
                    spec={finalSpec}
                    actions={showHeader || enableActions}
                    onNewView={(view: View) => {
                        vegaViewRef.current = view;
                        onViewReady?.(view);
                    }}
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
