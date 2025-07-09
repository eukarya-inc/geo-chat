import React, { useCallback, useEffect, useState } from "react";
import { DataEditor, GridCell, GridCellKind, GridColumn, Item } from "@glideapps/glide-data-grid";
import { AsyncDuckDBConnection } from "@duckdb/duckdb-wasm";
import { getTableData, getTableDataByWindow, getValueFromArrowTable } from "../utils/duckdbTableUtils";
import { Table as ArrowTable } from "apache-arrow";
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
}

export const Table: React.FC<TableProps> = ({ connection, tableName }) => {
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
  const [totalRows, setTotalRows] = useState(0);
  const [arrowCache] = useState(new Map<string, ArrowTable>());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadInitialData = async () => {
      try {
        setLoading(true);
        arrowCache.clear();
        
        const initialData = await getTableData(connection, tableName, 0, 100);
        
        const gridColumns: GridColumn[] = initialData.columns.map((col) => ({
          id: col.name,
          title: col.name,
          width: 150,
        }));
        
        setColumns(gridColumns);
        setTotalRows(initialData.totalRows);
        
        // Store initial Arrow table in cache
        arrowCache.set('window-0-100', initialData.arrowTable);
      } catch (error) {
        console.error("Error loading table data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadInitialData();
  }, [connection, tableName, arrowCache]);

  const loadDataWindow = useCallback(
    async (startRow: number) => {
      const windowSize = 100;
      const windowStart = Math.floor(startRow / windowSize) * windowSize;
      const windowEnd = windowStart + windowSize;
      
      const cacheKey = `window-${windowStart}-${windowEnd}`;
      if (arrowCache.has(cacheKey)) {
        return;
      }
      
      try {
        const arrowTable = await getTableDataByWindow(connection, tableName, windowStart, windowEnd);
        arrowCache.set(cacheKey, arrowTable);
      } catch (error) {
        console.error("Error loading data window:", error);
      }
    },
    [connection, tableName, arrowCache]
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
        loadDataWindow(row);
        return {
          kind: GridCellKind.Text,
          data: "Loading...",
          displayData: "Loading...",
          allowOverlay: false,
        };
      }
      
      // Convert only the specific cell value from Arrow
      const rowInWindow = row - windowStart;
      const value = getValueFromArrowTable(arrowTable, rowInWindow, col);
      // Value is already converted to string in getValueFromArrowTable for BigInt and BLOB
      const displayValue = value === null ? "NULL" : String(value);
      
      return {
        kind: GridCellKind.Text,
        data: displayValue,
        displayData: displayValue,
        allowOverlay: true,
      };
    },
    [arrowCache, loadDataWindow]
  );

  const onVisibleRegionChanged = useCallback(
    (range: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      const startRow = range.y;
      
      loadDataWindow(startRow);
    },
    [loadDataWindow]
  );

  if (loading) {
    return <div style={{ padding: "20px" }}>Loading table...</div>;
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative" }}>
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