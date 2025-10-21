import React, { useCallback, useEffect, useState, useRef, useMemo } from 'react';
import { DataEditor, GridCell, GridCellKind, GridColumn, Item } from '@glideapps/glide-data-grid';
import { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { getTableData, getTableDataByWindow, getValueFromArrowTable, getValueFromRawData } from '../../utils/duckdb';
import { Table as ArrowTable } from 'apache-arrow';
import { throttle } from '../../utils/throttle';
import '@glideapps/glide-data-grid/dist/index.css';

// CSS to ensure scrollbars are visible
const scrollbarStyles = `
  .dvn-scroller::-webkit-scrollbar {
    width: 12px;
    height: 12px;
  }
  .dvn-scroller::-webkit-scrollbar-track {
    background: #f1f1f1;
  }
  .dvn-scroller::-webkit-scrollbar-thumb {
    background: #888;
    border-radius: 6px;
  }
  .dvn-scroller::-webkit-scrollbar-thumb:hover {
    background: #555;
  }
  .dvn-scroller {
    scrollbar-width: thin;
    scrollbar-color: #888 #f1f1f1;
  }
`;

interface TableViewProps {
    connection: AsyncDuckDBConnection;
    tableName: string;
    dbContext?: DBContext;
}

// Helper function to format cell values for display
const formatCellValue = (value: unknown, columnType?: string): string => {
    if (value === null || value === undefined) {
        return 'NULL';
    }

    // Binary data (Uint8Array) is now handled directly from rawData cache
    // No need for base64 encoding/decoding

    // Handle BLOB/geometry data
    if (
        value instanceof Uint8Array ||
        value instanceof ArrayBuffer ||
        (value && typeof value === 'object' && 'byteLength' in value)
    ) {
        // Check if this is a geometry column
        if (
            columnType &&
            (columnType.toUpperCase().includes('GEOMETRY') ||
                columnType.toUpperCase().includes('POINT') ||
                columnType.toUpperCase().includes('LINESTRING') ||
                columnType.toUpperCase().includes('POLYGON') ||
                columnType.toUpperCase().includes('MULTIPOINT') ||
                columnType.toUpperCase().includes('MULTILINESTRING') ||
                columnType.toUpperCase().includes('MULTIPOLYGON') ||
                columnType.toUpperCase().includes('GEOMETRYCOLLECTION'))
        ) {
            // Try to extract geometry type from WKB
            if (value instanceof Uint8Array && value.length > 5) {
                try {
                    console.log('WKB Parse - value length:', value.length);
                    console.log('WKB Parse - first 20 bytes:', Array.from(value.slice(0, 20)));

                    const view = new DataView(value.buffer, value.byteOffset, value.byteLength);
                    const byteOrder = value[0];
                    const typeCode = byteOrder === 1 ? view.getUint32(1, true) : view.getUint32(1, false);

                    console.log('WKB Parse - byteOrder:', byteOrder);
                    console.log('WKB Parse - typeCode:', typeCode);
                    console.log('WKB Parse - typeCode hex:', typeCode.toString(16));
                    console.log('WKB Parse - baseType:', typeCode & 0xff);

                    const geomTypes: Record<number, string> = {
                        1: 'Point',
                        2: 'LineString',
                        3: 'Polygon',
                        4: 'MultiPoint',
                        5: 'MultiLineString',
                        6: 'MultiPolygon',
                        7: 'GeometryCollection',
                    };

                    const baseType = typeCode & 0xff;
                    const typeName = geomTypes[baseType] || 'Geometry';
                    console.log('WKB Parse - typeName:', typeName);
                    return `[${typeName}]`;
                } catch (error) {
                    console.error('WKB Parse - error:', error);
                    // If parsing fails, use column type
                }
            } else {
                console.log('WKB Parse - skipped, value is not Uint8Array or length <= 5', {
                    isUint8Array: value instanceof Uint8Array,
                    length: value instanceof Uint8Array ? value.length : 'N/A',
                });
            }

            // Fallback: use column type
            const typeUpper = columnType.toUpperCase();
            if (typeUpper.includes('MULTIPOLYGON')) return '[MultiPolygon]';
            if (typeUpper.includes('MULTILINESTRING')) return '[MultiLineString]';
            if (typeUpper.includes('MULTIPOINT')) return '[MultiPoint]';
            if (typeUpper.includes('POLYGON')) return '[Polygon]';
            if (typeUpper.includes('LINESTRING')) return '[LineString]';
            if (typeUpper.includes('POINT')) return '[Point]';
            return '[Geometry]';
        }

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

    return String(value);
};

export const TableView: React.FC<TableViewProps> = ({ connection, tableName, dbContext }) => {
    // Inject scrollbar styles
    useEffect(() => {
        const styleElement = document.createElement('style');
        styleElement.textContent = scrollbarStyles;
        document.head.appendChild(styleElement);

        return () => {
            document.head.removeChild(styleElement);
        };
    }, []);
    const [columns, setColumns] = useState<GridColumn[]>([]);
    const [columnTypes, setColumnTypes] = useState<Record<string, string>>({});
    const [totalRows, setTotalRows] = useState(0);
    const [arrowCache] = useState(new Map<string, ArrowTable>());
    const [rawDataCache] = useState(new Map<string, Map<string, unknown>[]>());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const loadingWindowsRef = useRef(new Set<string>());
    const containerRef = useRef<HTMLDivElement>(null);
    const [sortColumn, setSortColumn] = useState<string | null>(null);
    const [sortDirection, setSortDirection] = useState<'ASC' | 'DESC'>('ASC');

    // Note: Removed automatic column width adjustment on container resize
    // Column widths are now calculated based on content and can be manually resized by users

    // Reset cache when sort changes
    useEffect(() => {
        arrowCache.clear();
        rawDataCache.clear();
        loadingWindowsRef.current.clear();
    }, [sortColumn, sortDirection, arrowCache, rawDataCache]);

    useEffect(() => {
        const loadInitialData = async (retryCount = 0) => {
            setLoading(true);
            setError(null);
            // Clear cache and reset loading windows when connection or table changes
            arrowCache.clear();
            rawDataCache.clear();
            loadingWindowsRef.current.clear();

            // Use dbContext connection if available to ensure proper schema context
            const conn = connection;

            try {
                const initialData = await getTableData(conn, tableName, 0, 100, sortColumn || undefined, sortDirection);

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

                // Add row number column as the first column
                const rowNumberColumn: GridColumn = {
                    id: '__row_number__',
                    title: 'S.No',
                    width: 60,
                };

                const dataColumns: GridColumn[] = initialData.columns.map(
                    (col: { name: string; type: string }, colIndex: number) => {
                        // Format column title with name
                        let title = col.name;
                        if (sortColumn === col.name) {
                            title = `${sortDirection === 'ASC' ? '↑' : '↓'} ${col.name}`;
                        }

                        // Calculate width based on column name
                        let maxTextWidth = estimateTextWidth(col.name);

                        // Check sample data values to get max text width
                        for (let rowIndex = 0; rowIndex < Math.min(initialData.arrowTable.numRows, 100); rowIndex++) {
                            const value = getValueFromArrowTable(initialData.arrowTable, rowIndex, colIndex, col.type);
                            if (value !== null) {
                                const valueStr = String(value);
                                // Only check first 50 characters to avoid very long values
                                const textWidth = estimateTextWidth(valueStr.slice(0, 50));
                                maxTextWidth = Math.max(maxTextWidth, textWidth);
                            }
                        }

                        // Add padding (16px for cell padding + some margin)
                        const calculatedWidth = maxTextWidth + 32;

                        // Apply min and max constraints
                        const minColumnWidth = 80;
                        const maxColumnWidth = 400;
                        const finalWidth = Math.min(maxColumnWidth, Math.max(minColumnWidth, calculatedWidth));

                        return {
                            id: col.name,
                            title,
                            width: finalWidth,
                        };
                    }
                );

                const gridColumns: GridColumn[] = [rowNumberColumn, ...dataColumns];

                // Store column types for later use
                const types: Record<string, string> = {};
                initialData.columns.forEach((col: { name: string; type: string }) => {
                    types[col.name] = col.type;
                });

                setColumns(gridColumns);
                setColumnTypes(types);
                setTotalRows(initialData.totalRows);

                // Store initial Arrow table and raw data in cache
                arrowCache.set('window-0-100', initialData.arrowTable);
                if (initialData.rawData) {
                    rawDataCache.set('window-0-100', initialData.rawData);
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
                setColumns([]);
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
            const windowSize = 100;
            const windowStart = Math.floor(startRow / windowSize) * windowSize;
            const windowEnd = windowStart + windowSize;

            const cacheKey = `window-${windowStart}-${windowEnd}`;

            // Check if already cached or currently loading
            if (arrowCache.has(cacheKey) || loadingWindowsRef.current.has(cacheKey)) {
                return;
            }

            // Mark as loading
            loadingWindowsRef.current.add(cacheKey);

            // Use dbContext connection if available to ensure proper schema context
            const conn = connection;

            try {
                const windowResult = await getTableDataByWindow(
                    conn,
                    tableName,
                    windowStart,
                    windowEnd,
                    sortColumn || undefined,
                    sortDirection
                );
                arrowCache.set(cacheKey, windowResult.arrowTable);
                rawDataCache.set(cacheKey, windowResult.rawData);
            } catch (error) {
                console.error('Error loading data window:', error, {
                    tableName,
                    windowStart,
                    windowEnd,
                    sortColumn,
                    sortDirection,
                });
            } finally {
                // Remove from loading set
                loadingWindowsRef.current.delete(cacheKey);
            }
        },
        [connection, tableName, arrowCache, rawDataCache, sortColumn, sortDirection]
    );

    // Create a throttled version of loadDataWindow
    const throttledLoadDataWindow = useMemo(() => throttle(loadDataWindow, 200), [loadDataWindow]);

    const getCellContent = useCallback(
        (cell: Item): GridCell => {
            const [col, row] = cell;

            // First column is row number
            if (col === 0) {
                const rowNumber = String(row + 1); // 1-based indexing
                return {
                    kind: GridCellKind.Text,
                    data: rowNumber,
                    displayData: rowNumber,
                    allowOverlay: false,
                    readonly: true,
                };
            }

            // Find which window contains this row
            const windowSize = 100;
            const windowStart = Math.floor(row / windowSize) * windowSize;
            const windowEnd = windowStart + windowSize;
            const cacheKey = `window-${windowStart}-${windowEnd}`;

            const rawData = rawDataCache.get(cacheKey);
            if (!rawData) {
                // Try to load data but don't block - show empty cell instead
                throttledLoadDataWindow(row);
                return {
                    kind: GridCellKind.Text,
                    data: '',
                    displayData: '',
                    allowOverlay: false,
                };
            }

            // Get value directly from raw data (more efficient for binary data)
            const rowInWindow = row - windowStart;
            const columnName = columns[col]?.id;
            const columnType = columnName ? columnTypes[columnName] : undefined;
            const value = getValueFromRawData(rawData, rowInWindow, columnName || '', columnType);
            // Format the value for display using our formatting function
            const displayValue = formatCellValue(value, columnType);

            return {
                kind: GridCellKind.Text,
                data: displayValue,
                displayData: displayValue,
                allowOverlay: true,
            };
        },
        [rawDataCache, throttledLoadDataWindow, columns, columnTypes]
    );

    const onVisibleRegionChanged = useCallback(
        (range: { x: number; y: number; width: number; height: number }) => {
            const startRow = range.y;
            const endRow = Math.min(range.y + range.height + 20, totalRows);

            // Load current window immediately
            loadDataWindow(startRow);

            // Pre-load adjacent windows with throttling
            const windowSize = 100;
            for (let row = startRow; row < endRow; row += windowSize) {
                throttledLoadDataWindow(row);
            }
        },
        [loadDataWindow, throttledLoadDataWindow, totalRows]
    );

    // Handle column resize
    const handleColumnResize = useCallback((column: GridColumn, newSize: number) => {
        // Don't allow resizing row number column
        if (column.id === '__row_number__') return;

        setColumns(prevColumns => prevColumns.map(col => (col.id === column.id ? { ...col, width: newSize } : col)));
    }, []);

    // Handle header click for sorting
    const handleHeaderClicked = useCallback(
        (colIndex: number) => {
            // Don't allow sorting on row number column
            if (colIndex === 0) return;

            const column = columns[colIndex];
            if (!column) return;

            const columnId = column.id;
            if (!columnId) return;

            if (sortColumn === columnId) {
                if (sortDirection === 'ASC') {
                    // First click: ASC -> DESC
                    setSortDirection('DESC');
                } else {
                    // Second click: DESC -> Remove sort (back to default)
                    setSortColumn(null);
                    setSortDirection('ASC');
                }
            } else {
                // New column: start with ASC
                setSortColumn(columnId);
                setSortDirection('ASC');
            }
        },
        [columns, sortColumn, sortDirection]
    );

    // Update column titles when sort changes
    useEffect(() => {
        setColumns(prevColumns =>
            prevColumns.map(col => {
                // Skip row number column
                if (col.id === '__row_number__') {
                    return col;
                }

                // Build the title with column name
                let title = '';

                // Add sort indicator before column name if this column is sorted
                if (col.id && sortColumn === col.id) {
                    title = `${sortDirection === 'ASC' ? '↑' : '↓'} ${col.id}`;
                }
                // Regular column name when not sorted
                else if (col.id) {
                    title = col.id;
                } else {
                    title = col.title || '';
                }

                return { ...col, title };
            })
        );
    }, [sortColumn, sortDirection, columnTypes]);

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
        <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative' }}>
            <DataEditor
                columns={columns}
                rows={totalRows}
                getCellContent={getCellContent}
                smoothScrollX={true}
                smoothScrollY={true}
                rowHeight={36}
                headerHeight={48}
                onVisibleRegionChanged={onVisibleRegionChanged}
                // Enable column resize
                onColumnResize={handleColumnResize}
                // Enable column sorting
                onHeaderClicked={handleHeaderClicked}
                // Make grid read-only but allow overlay for viewing
                onCellEdited={() => {
                    // Do nothing - prevents actual editing
                    return undefined;
                }}
                theme={{
                    bgCell: '#fff',
                    bgCellMedium: '#fafafa',
                    bgHeader: '#f8f9fa',
                    bgHeaderHasFocus: '#e9ecef',
                    bgHeaderHovered: '#e9ecef',
                    borderColor: '#dee2e6',
                    cellHorizontalPadding: 8,
                    cellVerticalPadding: 6,
                }}
            />
        </div>
    );
};
