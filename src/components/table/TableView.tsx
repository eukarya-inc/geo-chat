import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { getTableData, getTableDataByWindow } from '../../utils/duckdb';
import { Table as ArrowTable } from 'apache-arrow';
import { throttle } from '../../utils/throttle';
import { LRUCache } from '../../utils/lruCache';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    ColumnDef,
    flexRender,
    SortingState,
    ColumnResizeMode,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import './TableView.css';

interface TableViewProps {
    connection?: AsyncDuckDBConnection;
    tableName: string;
    dbContext?: DBContext;
    schema?: string | null;
    wrapText?: boolean;
}

// Helper function to check if a column type is geometry
const isGeometryType = (columnType?: string): boolean => {
    if (!columnType) return false;
    const typeUpper = columnType.toUpperCase();
    return (
        typeUpper.includes('GEOMETRY') ||
        typeUpper.includes('POINT') ||
        typeUpper.includes('LINESTRING') ||
        typeUpper.includes('POLYGON') ||
        typeUpper.includes('MULTIPOINT') ||
        typeUpper.includes('MULTILINESTRING') ||
        typeUpper.includes('MULTIPOLYGON') ||
        typeUpper.includes('GEOMETRYCOLLECTION')
    );
};

// Helper function to get geometry type label from column type (fast path)
const getGeometryTypeLabel = (columnType: string): string => {
    const typeUpper = columnType.toUpperCase();
    if (typeUpper.includes('MULTIPOLYGON')) return '[MultiPolygon]';
    if (typeUpper.includes('MULTILINESTRING')) return '[MultiLineString]';
    if (typeUpper.includes('MULTIPOINT')) return '[MultiPoint]';
    if (typeUpper.includes('POLYGON')) return '[Polygon]';
    if (typeUpper.includes('LINESTRING')) return '[LineString]';
    if (typeUpper.includes('POINT')) return '[Point]';
    return '[Geometry]';
};

// Helper function to format cell values for display
const formatCellValue = (value: unknown, columnType?: string): string => {
    if (value === null || value === undefined) {
        return 'NULL';
    }

    // Fast path: if column type indicates geometry, skip expensive WKB parsing
    if (isGeometryType(columnType)) {
        return getGeometryTypeLabel(columnType!);
    }

    // Handle BLOB/geometry data
    if (
        value instanceof Uint8Array ||
        value instanceof ArrayBuffer ||
        (value && typeof value === 'object' && 'byteLength' in value)
    ) {
        // For non-geometry BLOB, show size
        let byteLength = 0;
        if (value instanceof Uint8Array) {
            byteLength = value.byteLength;
        } else if (value instanceof ArrayBuffer) {
            byteLength = value.byteLength;
        } else if (value && typeof value === 'object' && 'byteLength' in value) {
            byteLength = (value as { byteLength: number }).byteLength;
        }

        if (byteLength > 0) {
            if (byteLength < 1024) {
                return `[Blob: ${byteLength}B]`;
            } else if (byteLength < 1024 * 1024) {
                return `[Blob: ${(byteLength / 1024).toFixed(1)}KB]`;
            } else {
                return `[Blob: ${(byteLength / (1024 * 1024)).toFixed(1)}MB]`;
            }
        }

        return '[Blob]';
    }

    // Handle objects (STRUCT, LIST, etc.)
    if (typeof value === 'object' && value !== null) {
        try {
            return JSON.stringify(value);
        } catch {
            // If JSON.stringify fails (circular reference, etc.), fallback to String()
            return String(value);
        }
    }

    return String(value);
};

// Function to estimate text width (approximate)
const estimateTextWidth = (text: string): number => {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        // Japanese characters and full-width characters are wider
        if (char > 0x3000) {
            width += 12; // ~12px per Japanese character
        } else {
            width += 8; // ~8px per ASCII character
        }
    }
    return width;
};

interface TableData {
    [key: string]: unknown;
}

export const TableView: React.FC<TableViewProps> = ({
    connection: providedConnection,
    tableName,
    dbContext,
    schema,
    wrapText: providedWrapText = true,
}) => {
    const [internalConnection, setInternalConnection] = useState<AsyncDuckDBConnection | null>(null);
    const [connectionError, setConnectionError] = useState<string | null>(null);
    const [data, setData] = useState<TableData[]>([]);
    const [columnTypes, setColumnTypes] = useState<Record<string, string>>({});
    const [totalRows, setTotalRows] = useState(0);
    // Use LRU cache with max 100 windows (10000 rows at 100 rows per window)
    const [arrowCache] = useState(() => new LRUCache<string, ArrowTable>(100));
    const [rawDataCache, setRawDataCache] = useState(() => new LRUCache<string, Map<string, unknown>[]>(100));
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadingWindowsRef = useRef(new Set<string>());
    const tableContainerRef = useRef<HTMLDivElement>(null);
    const [sorting, setSorting] = useState<SortingState>([]);
    const columnResizeMode: ColumnResizeMode = 'onChange';
    const wrapText = providedWrapText; // Use provided value or default
    const [columnSizing, setColumnSizing] = useState({});
    const [isResizing, setIsResizing] = useState(false);

    // Create connection from dbContext if not provided
    useEffect(() => {
        if (providedConnection) {
            // Use provided connection
            setInternalConnection(providedConnection);
            return;
        }

        if (!dbContext) {
            setConnectionError('Neither connection nor dbContext provided');
            return;
        }

        // Create managed connection from dbContext
        let isActive = true;
        let connectionToCleanup: AsyncDuckDBConnection | null = null;

        dbContext
            .createUnmanagedConnection(schema || null)
            .then(conn => {
                if (isActive) {
                    connectionToCleanup = conn;
                    setInternalConnection(conn);
                    setConnectionError(null);
                } else {
                    // Connection arrived after unmount - close it immediately
                    conn.close().catch(err => {
                        console.error('[TableView] Failed to close late-arriving connection:', err);
                    });
                }
            })
            .catch(err => {
                if (isActive) {
                    setConnectionError(
                        `Failed to create connection: ${err instanceof Error ? err.message : String(err)}`
                    );
                }
            });

        return () => {
            isActive = false;
            // Cleanup connection when component unmounts
            if (connectionToCleanup) {
                connectionToCleanup.close().catch(err => {
                    console.warn('[TableView] Failed to close connection:', err);
                });
            }
        };
    }, [providedConnection, dbContext, schema]);

    const connection = internalConnection;

    // Convert sorting state to our format
    const sortColumn = sorting[0]?.id || null;
    const sortDirection = sorting[0]?.desc ? 'DESC' : 'ASC';

    // Reset cache when sort changes
    useEffect(() => {
        arrowCache.clear();
        setRawDataCache(new LRUCache<string, Map<string, unknown>[]>(100));
        loadingWindowsRef.current.clear();
    }, [sortColumn, sortDirection, arrowCache]);

    useEffect(() => {
        const loadInitialData = async (retryCount = 0) => {
            if (!connection) {
                return;
            }

            setLoading(true);
            setError(null);
            // Clear cache and reset loading windows when connection or table changes
            arrowCache.clear();
            setRawDataCache(new LRUCache<string, Map<string, unknown>[]>(100));
            loadingWindowsRef.current.clear();

            const conn = connection;

            try {
                const initialData = await getTableData(
                    conn,
                    tableName,
                    0,
                    100,
                    sortColumn || undefined,
                    sortDirection as 'ASC' | 'DESC'
                );

                // Store column types for later use
                const types: Record<string, string> = {};
                initialData.columns.forEach((col: { name: string; type: string }) => {
                    types[col.name] = col.type;
                });

                setColumnTypes(types);
                setTotalRows(initialData.totalRows);

                // Store initial Arrow table and raw data in cache
                arrowCache.set('window-0-100', initialData.arrowTable);
                if (initialData.rawData) {
                    const rawData = initialData.rawData;
                    setRawDataCache(prev => {
                        const newCache = new LRUCache<string, Map<string, unknown>[]>(100);
                        // Copy existing entries
                        prev.forEach((value, key) => {
                            newCache.set(key, value);
                        });
                        newCache.set('window-0-100', rawData);
                        return newCache;
                    });
                    // Convert raw data to array format for initial display
                    const arrayData = initialData.rawData.map((row: Map<string, unknown>) => {
                        const obj: TableData = {};
                        if (row instanceof Map) {
                            row.forEach((value, key) => {
                                obj[key] = value;
                            });
                        } else {
                            Object.assign(obj, row);
                        }
                        return obj;
                    });
                    setData(arrayData);
                }

                // Success - set loading to false
                setLoading(false);
            } catch (error) {
                // Log the full error details
                console.error('Error loading initial table data:', error);
                console.error('Table name:', tableName);
                // Retry on various errors that might indicate the table isn't ready yet
                const errorMessage = error instanceof Error ? error.message : String(error);
                const shouldRetry =
                    (errorMessage.includes('No columns found') ||
                        errorMessage.includes('does not exist') ||
                        errorMessage.includes('not found') ||
                        errorMessage.includes('Parser Error')) &&
                    retryCount < 5; // Increase retry count to 5

                if (shouldRetry) {
                    console.log(`Retrying table load (attempt ${retryCount + 1}/5)...`);
                    // Keep loading state true while retrying
                    setTimeout(
                        () => {
                            loadInitialData(retryCount + 1);
                        },
                        300 * (retryCount + 1)
                    ); // Shorter initial delay, still exponential
                    return; // Don't set loading to false, we're still trying
                }

                // Reset state on error
                setData([]);
                setColumnTypes({});
                setTotalRows(0);
                setLoading(false); // Only set loading to false when we're done retrying

                // Provide more detailed error message
                let displayMessage = errorMessage;

                // Check if it's a "no columns found" error
                if (errorMessage.includes('No columns found')) {
                    displayMessage = `Table "${tableName}" was not found or has no columns. Please make sure the table exists in the current schema.`;
                }

                console.error('Display error:', displayMessage);
                setError(displayMessage);
            }
        };

        loadInitialData();
    }, [connection, tableName, arrowCache, dbContext, sortColumn, sortDirection]);

    const loadDataWindow = useCallback(
        async (startRow: number) => {
            if (!connection) {
                return;
            }

            const windowSize = 100;
            const windowStart = Math.floor(startRow / windowSize) * windowSize;
            const windowEnd = Math.min(windowStart + windowSize, totalRows);

            const cacheKey = `window-${windowStart}-${windowEnd}`;

            // Check if already cached or currently loading
            if (rawDataCache.has(cacheKey) || loadingWindowsRef.current.has(cacheKey)) {
                return rawDataCache.get(cacheKey);
            }

            // Mark as loading
            loadingWindowsRef.current.add(cacheKey);

            const conn = connection;

            try {
                const windowResult = await getTableDataByWindow(
                    conn,
                    tableName,
                    windowStart,
                    windowEnd,
                    sortColumn || undefined,
                    sortDirection as 'ASC' | 'DESC'
                );
                arrowCache.set(cacheKey, windowResult.arrowTable);
                setRawDataCache(prev => {
                    const newCache = new LRUCache<string, Map<string, unknown>[]>(100);
                    // Copy existing entries
                    prev.forEach((value, key) => {
                        newCache.set(key, value);
                    });
                    newCache.set(cacheKey, windowResult.rawData);
                    return newCache;
                });
                return windowResult.rawData;
            } catch (error) {
                console.error('Error loading data window:', error, {
                    tableName,
                    windowStart,
                    windowEnd,
                    sortColumn,
                    sortDirection,
                });
                return null;
            } finally {
                // Remove from loading set
                loadingWindowsRef.current.delete(cacheKey);
            }
        },
        [connection, tableName, arrowCache, sortColumn, sortDirection, totalRows]
    );

    // Create a throttled version of loadDataWindow
    const throttledLoadDataWindow = useMemo(() => throttle(loadDataWindow, 200), [loadDataWindow]);

    // Define columns for TanStack Table
    const columns = useMemo<ColumnDef<TableData>[]>(() => {
        const cols: ColumnDef<TableData>[] = [
            {
                id: '__row_number__',
                header: '',
                size: 60,
                enableSorting: false,
                enableResizing: false,
                cell: ({ row }) => row.index + 1,
            },
        ];

        // Add data columns
        Object.entries(columnTypes).forEach(([columnName, columnType]) => {
            // Calculate initial column width
            let initialWidth = 150;

            // For geometry columns, use fixed width
            if (isGeometryType(columnType)) {
                initialWidth = 150;
            } else {
                // Calculate width based on column name and sample data
                let maxTextWidth = estimateTextWidth(columnName);

                // Sample first 100 rows of data for width calculation
                if (data.length > 0) {
                    for (let i = 0; i < Math.min(data.length, 100); i++) {
                        const value = data[i][columnName];
                        if (value !== null && value !== undefined) {
                            const valueStr = String(value);
                            const textWidth = estimateTextWidth(valueStr.slice(0, 100));
                            if (textWidth > maxTextWidth) {
                                maxTextWidth = textWidth;
                            }
                        }
                    }
                }

                // Add padding
                const calculatedWidth = maxTextWidth + 48;

                // Apply min and max constraints
                const minColumnWidth = 100;
                const maxColumnWidth = 500;
                initialWidth = Math.min(maxColumnWidth, Math.max(minColumnWidth, calculatedWidth));
            }

            cols.push({
                id: columnName,
                accessorKey: columnName,
                header: columnName,
                size: initialWidth,
                enableSorting: true,
                enableResizing: true,
                cell: ({ row, getValue }) => {
                    // Check if data is loaded
                    const rowData = row.original as TableData;
                    if (!rowData.__loaded__) {
                        return ''; // Return empty string for unloaded data
                    }
                    const value = getValue();
                    return formatCellValue(value, columnType);
                },
            });
        });

        return cols;
    }, [columnTypes, data]);

    // Create virtualized data that loads on demand
    const virtualData = useMemo(() => {
        return Array.from({ length: totalRows }, (_, index) => {
            const windowSize = 100;
            const windowStart = Math.floor(index / windowSize) * windowSize;
            const windowEnd = windowStart + windowSize;
            const cacheKey = `window-${windowStart}-${windowEnd}`;

            const cachedData = rawDataCache.get(cacheKey);
            if (cachedData) {
                const rowInWindow = index - windowStart;
                const row = cachedData[rowInWindow];
                const obj: TableData = { __index__: index, __loaded__: true };
                if (row instanceof Map) {
                    row.forEach((value, key) => {
                        obj[key] = value;
                    });
                } else if (row) {
                    Object.assign(obj, row);
                }
                return obj;
            }

            // Return placeholder data with index and loaded flag
            return { __index__: index, __loaded__: false };
        });
    }, [totalRows, rawDataCache]);

    const table = useReactTable({
        data: virtualData,
        columns,
        state: {
            sorting,
            columnSizing,
        },
        onSortingChange: setSorting,
        onColumnSizingChange: setColumnSizing,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        manualSorting: true, // We handle sorting server-side
        columnResizeMode,
        enableColumnResizing: true,
        debugTable: false,
    });

    // Row virtualizer
    const rowVirtualizer = useVirtualizer({
        count: totalRows,
        getScrollElement: () => tableContainerRef.current,
        estimateSize: () => (wrapText ? 60 : 36), // Larger estimate when wrapping
        overscan: 10,
        measureElement: element => {
            // Measure actual element height for accurate scrolling
            if (element && wrapText) {
                return element.getBoundingClientRect().height;
            }
            return 36;
        },
    });

    // Detect when resizing ends
    useEffect(() => {
        if (isResizing) {
            const handleMouseUp = () => {
                setIsResizing(false);
            };
            const handleTouchEnd = () => {
                setIsResizing(false);
            };

            document.addEventListener('mouseup', handleMouseUp);
            document.addEventListener('touchend', handleTouchEnd);

            return () => {
                document.removeEventListener('mouseup', handleMouseUp);
                document.removeEventListener('touchend', handleTouchEnd);
            };
        }
    }, [isResizing]);

    // Load data for visible rows
    useEffect(() => {
        const range = rowVirtualizer.range;
        if (range) {
            // Load data for visible range
            const windowSize = 100;
            const startWindow = Math.floor(range.startIndex / windowSize) * windowSize;
            const endWindow = Math.min(Math.floor((range.endIndex + windowSize) / windowSize) * windowSize, totalRows);

            // Load current window
            for (let window = startWindow; window <= endWindow; window += windowSize) {
                throttledLoadDataWindow(window);
            }

            // Prefetch next window
            if (endWindow < totalRows) {
                throttledLoadDataWindow(endWindow + windowSize);
            }

            // Prefetch previous window
            if (startWindow > 0) {
                throttledLoadDataWindow(startWindow - windowSize);
            }
        }
    }, [rowVirtualizer.range, throttledLoadDataWindow, totalRows]);

    // Recalculate row heights when wrapText changes
    useEffect(() => {
        // Force recalculation of all visible row heights
        rowVirtualizer.measure();
    }, [wrapText, rowVirtualizer]);

    const virtualRows = rowVirtualizer.getVirtualItems();
    const totalSize = rowVirtualizer.getTotalSize();

    if (connectionError) {
        return (
            <div style={{ padding: '20px', color: '#dc3545' }}>
                <strong>Connection Error:</strong>
                <div style={{ marginTop: '10px', fontSize: '14px', fontFamily: 'monospace' }}>{connectionError}</div>
            </div>
        );
    }

    if (!connection) {
        return <div style={{ padding: '20px' }}>Connecting to database...</div>;
    }

    if (loading) {
        return <div style={{ padding: '20px' }}>Loading table...</div>;
    }

    if (error) {
        return (
            <div style={{ padding: '20px', color: '#dc3545' }}>
                <strong>Error loading table:</strong>
                <div style={{ marginTop: '10px', fontSize: '14px', fontFamily: 'monospace' }}>{error}</div>
            </div>
        );
    }

    if (columns.length === 0) {
        return <div style={{ padding: '20px' }}>No columns found in table</div>;
    }

    return (
        <div ref={tableContainerRef} className="tanstack-table-container">
            <div className="tanstack-table-wrapper">
                {/* Header as a separate div with same structure as rows */}
                <div className="tanstack-table-header-container">
                    {table.getHeaderGroups().map(headerGroup => (
                        <div key={headerGroup.id} className="tanstack-table-header-row">
                            {headerGroup.headers.map(header => (
                                <div
                                    key={header.id}
                                    className="tanstack-table-th"
                                    style={{
                                        width: header.getSize(),
                                        flexShrink: 0,
                                    }}
                                >
                                    <div
                                        className={header.column.getCanSort() ? 'tanstack-table-sortable' : ''}
                                        onClick={header.column.getToggleSortingHandler()}
                                    >
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        {header.column.getIsSorted() && (
                                            <span className="tanstack-table-sort-indicator">
                                                {header.column.getIsSorted() === 'desc' ? ' ↓' : ' ↑'}
                                            </span>
                                        )}
                                    </div>
                                    {header.column.getCanResize() && (
                                        <div
                                            className="tanstack-table-resizer"
                                            onMouseDown={e => {
                                                setIsResizing(true);
                                                header.getResizeHandler()(e);
                                            }}
                                            onTouchStart={e => {
                                                setIsResizing(true);
                                                header.getResizeHandler()(e);
                                            }}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    ))}
                </div>

                {/* Body with virtualized rows */}
                <div
                    className="tanstack-table-body"
                    style={{
                        height: `${totalSize}px`,
                        position: 'relative',
                    }}
                >
                    {virtualRows.map(virtualRow => {
                        const row = table.getRowModel().rows[virtualRow.index];
                        // Load data if needed for this row
                        const rowData = virtualData[virtualRow.index];
                        if (rowData && !rowData.__loaded__) {
                            // This row needs data
                            throttledLoadDataWindow(virtualRow.index);
                        }

                        return (
                            <div
                                key={virtualRow.key}
                                data-index={virtualRow.index}
                                ref={rowVirtualizer.measureElement}
                                className="tanstack-table-row"
                                style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    width: '100%',
                                    height: wrapText ? 'auto' : `${virtualRow.size}px`,
                                    minHeight: '36px',
                                    transform: `translateY(${virtualRow.start}px)`,
                                    display: 'flex',
                                }}
                            >
                                {row?.getVisibleCells().map(cell => (
                                    <div
                                        key={cell.id}
                                        className={`tanstack-table-cell ${wrapText ? 'tanstack-table-cell-wrap' : ''}`}
                                        style={{
                                            width: cell.column.getSize(),
                                            flexShrink: 0,
                                        }}
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </div>
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
