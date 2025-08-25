import React, { useCallback, useEffect, useState, useRef, useMemo } from "react";
import { DataEditor, GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import type { DBContext } from "../../../lib/duckdb/dbContext";
import { getTableData, getTableDataByWindow, getValueFromArrowTable } from "../../../utils/duckdbTableUtils";
import { Table as ArrowTable } from "apache-arrow";
import { throttle } from "../../../utils/throttle";
import "@glideapps/glide-data-grid/dist/index.css";

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

interface TableProps {
  connection: AsyncDuckDBConnection;
  tableName: string;
  dbContext?: DBContext;
}

export const Table: React.FC<TableProps> = ({ connection, tableName, dbContext }) => {
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const loadingWindowsRef = useRef(new Set<string>());
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Track container width
  useEffect(() => {
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
    };
  }, []);

  // Update column widths when container width or columns change
  useEffect(() => {
    if (columns.length > 0 && containerWidth > 0) {
      const minColumnWidth = 100;
      const maxColumnWidth = 200;
      // Calculate width but cap it at maxColumnWidth
      const calculatedWidth = Math.min(
        maxColumnWidth,
        Math.max(minColumnWidth, Math.floor(containerWidth / columns.length))
      );
      
      const updatedColumns = columns.map(col => ({
        ...col,
        width: calculatedWidth
      }));
      
      // Only update if width actually changed to avoid infinite loop
      const firstCol = columns[0];
      const firstWidth = 'width' in firstCol ? firstCol.width : undefined;
      if (firstWidth !== calculatedWidth) {
        setColumns(updatedColumns);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [containerWidth, columns.length]); // Note: only depend on columns.length, not columns itself to avoid infinite loop

  useEffect(() => {
    const loadInitialData = async (retryCount = 0) => {
      setLoading(true);
      setError(null);
      // Clear cache and reset loading windows when connection or table changes
      arrowCache.clear();
      loadingWindowsRef.current.clear();
      
      // Use dbContext connection if available to ensure proper schema context
      const conn = connection;
      
      try {
        const initialData = await getTableData(conn, tableName, 0, 100);
        
          // Calculate initial column width based on container width
          const minColumnWidth = 100;
          const maxColumnWidth = 200;
          const currentContainerWidth = containerRef.current?.offsetWidth || containerWidth;
          const calculatedWidth = Math.min(
            maxColumnWidth,
            Math.max(minColumnWidth, Math.floor(currentContainerWidth / initialData.columns.length))
          );
          
          const gridColumns: GridColumn[] = initialData.columns.map((col) => ({
            id: col.name,
            title: col.name,
            width: calculatedWidth,
          }));
          
          // Store column types for later use
          const types: Record<string, string> = {};
          initialData.columns.forEach((col) => {
            types[col.name] = col.type;
          });
          
          setColumns(gridColumns);
          setColumnTypes(types);
          setTotalRows(initialData.totalRows);
          
          // Store initial Arrow table in cache
          arrowCache.set('window-0-100', initialData.arrowTable);
          
          // Success - set loading to false
          setLoading(false);
        } catch (error) {
        // Retry on various errors that might indicate the table isn't ready yet
        const errorMessage = error instanceof Error ? error.message : String(error);
        const shouldRetry = (
          errorMessage.includes('No columns found') ||
          errorMessage.includes('does not exist') ||
          errorMessage.includes('not found') ||
          errorMessage.includes('Parser Error')
        ) && retryCount < 5; // Increase retry count to 5
        
        if (shouldRetry) {
          // Keep loading state true while retrying
          setTimeout(() => {
            loadInitialData(retryCount + 1);
          }, 300 * (retryCount + 1)); // Shorter initial delay, still exponential
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
        
        setError(displayMessage);
      }
    };

    loadInitialData();
  }, [connection, tableName, arrowCache, dbContext, containerWidth]);

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
        const arrowTable = await getTableDataByWindow(conn, tableName, windowStart, windowEnd);
        arrowCache.set(cacheKey, arrowTable);
      } catch (error) {
        console.error("Error loading data window:", error);
      } finally {
        // Remove from loading set
        loadingWindowsRef.current.delete(cacheKey);
      }
    },
    [connection, tableName, arrowCache]
  );

  // Create a throttled version of loadDataWindow
  const throttledLoadDataWindow = useMemo(
    () => throttle(loadDataWindow, 200),
    [loadDataWindow]
  );

  const getCellContent = useCallback(
    (cell: Item): GridCell => {
      const [col, row] = cell;
      
      // Find which window contains this row
      const windowSize = 100;
      const windowStart = Math.floor(row / windowSize) * windowSize;
      const windowEnd = windowStart + windowSize;
      const cacheKey = `window-${windowStart}-${windowEnd}`;
      
      const arrowTable = arrowCache.get(cacheKey);
      if (!arrowTable) {
        // Try to load data but don't block - show empty cell instead
        throttledLoadDataWindow(row);
        return {
          kind: GridCellKind.Text,
          data: "",
          displayData: "",
          allowOverlay: false,
        };
      }
      
      // Convert only the specific cell value from Arrow
      const rowInWindow = row - windowStart;
      const columnName = columns[col]?.id;
      const columnType = columnName ? columnTypes[columnName] : undefined;
      const value = getValueFromArrowTable(arrowTable, rowInWindow, col, columnType);
      // Value is already converted to string in getValueFromArrowTable for BigInt and BLOB
      const displayValue = value === null ? "NULL" : String(value);
      
      return {
        kind: GridCellKind.Text,
        data: displayValue,
        displayData: displayValue,
        allowOverlay: true,
      };
    },
    [arrowCache, throttledLoadDataWindow, columns, columnTypes]
  );

  const onVisibleRegionChanged = useCallback(
    (range: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
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

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading table...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "20px", color: "#dc3545" }}>
        <strong>Error loading table:</strong>
        <div style={{ marginTop: "10px", fontSize: "14px", fontFamily: "monospace" }}>
          {error}
        </div>
      </div>
    );
  }

  if (columns.length === 0) {
    return <div style={{ padding: "20px" }}>No columns found in table</div>;
  }

  return (
    <div ref={containerRef} style={{ width: "100%", height: "100%", position: "relative" }}>
      <DataEditor
        columns={columns}
        rows={totalRows}
        getCellContent={getCellContent}
        smoothScrollX={true}
        smoothScrollY={true}
        rowHeight={36}
        headerHeight={36}
        onVisibleRegionChanged={onVisibleRegionChanged}
        theme={{
          bgCell: "#fff",
          bgCellMedium: "#fafafa",
          bgHeader: "#f8f9fa",
          bgHeaderHasFocus: "#e9ecef",
          bgHeaderHovered: "#e9ecef",
          borderColor: "#dee2e6",
          cellHorizontalPadding: 8,
          cellVerticalPadding: 6,
        }}
      />
    </div>
  );
};
