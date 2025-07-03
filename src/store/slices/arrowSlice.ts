import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { QueryResult } from '../../services/duckdb/enhancedDBManager';

interface ArrowState {
  // Cached query results
  queryResults: Record<string, {
    data: number[]; // Serialized Arrow table data as byte array
    metadata: {
      rowCount: number;
      columns: Array<{ name: string; type: string }>;
      executionTime: number;
      timestamp: number;
    };
  }>;
  
  // Current active query
  activeQuery: {
    query: string;
    isExecuting: boolean;
    error: string | null;
  } | null;
  
  // Export status
  exportStatus: {
    isExporting: boolean;
    tableName: string | null;
    format: string | null;
    progress: number;
    error: string | null;
  };
  
  // Table statistics
  tableStats: Record<string, {
    rowCount: number;
    sizeInBytes: number;
    columns: Array<{
      name: string;
      type: string;
      nullCount: number;
      distinctCount: number;
    }>;
    lastUpdated: number;
  }>;
}

const initialState: ArrowState = {
  queryResults: {},
  activeQuery: null,
  exportStatus: {
    isExporting: false,
    tableName: null,
    format: null,
    progress: 0,
    error: null
  },
  tableStats: {}
};

const arrowSlice = createSlice({
  name: 'arrow',
  initialState,
  reducers: {
    // Query execution
    startQuery: (state, action: PayloadAction<string>) => {
      state.activeQuery = {
        query: action.payload,
        isExecuting: true,
        error: null
      };
    },
    
    querySuccess: (state, action: PayloadAction<{
      query: string;
      result: Omit<QueryResult, 'arrow'> & { data: number[] };
    }>) => {
      const { query, result } = action.payload;
      state.queryResults[query] = {
        data: result.data,
        metadata: {
          rowCount: result.rowCount,
          columns: result.columns,
          executionTime: result.executionTime,
          timestamp: Date.now()
        }
      };
      
      if (state.activeQuery?.query === query) {
        state.activeQuery.isExecuting = false;
        state.activeQuery.error = null;
      }
    },
    
    queryError: (state, action: PayloadAction<{ query: string; error: string }>) => {
      if (state.activeQuery?.query === action.payload.query) {
        state.activeQuery.isExecuting = false;
        state.activeQuery.error = action.payload.error;
      }
    },
    
    clearQueryResults: (state) => {
      state.queryResults = {};
    },
    
    // Export operations
    startExport: (state, action: PayloadAction<{ tableName: string; format: string }>) => {
      state.exportStatus = {
        isExporting: true,
        tableName: action.payload.tableName,
        format: action.payload.format,
        progress: 0,
        error: null
      };
    },
    
    updateExportProgress: (state, action: PayloadAction<number>) => {
      state.exportStatus.progress = action.payload;
    },
    
    exportSuccess: (state) => {
      state.exportStatus = {
        isExporting: false,
        tableName: null,
        format: null,
        progress: 100,
        error: null
      };
    },
    
    exportError: (state, action: PayloadAction<string>) => {
      state.exportStatus.isExporting = false;
      state.exportStatus.error = action.payload;
    },
    
    // Table statistics
    setTableStats: (state, action: PayloadAction<{
      tableName: string;
      stats: {
        rowCount: number;
        sizeInBytes: number;
        columns: Array<{
          name: string;
          type: string;
          nullCount: number;
          distinctCount: number;
        }>;
      };
    }>) => {
      const { tableName, stats } = action.payload;
      state.tableStats[tableName] = {
        ...stats,
        lastUpdated: Date.now()
      };
    },
    
    clearTableStats: (state, action: PayloadAction<string>) => {
      delete state.tableStats[action.payload];
    },
    
    reset: () => initialState
  }
});

export const {
  startQuery,
  querySuccess,
  queryError,
  clearQueryResults,
  startExport,
  updateExportProgress,
  exportSuccess,
  exportError,
  setTableStats,
  clearTableStats,
  reset
} = arrowSlice.actions;

export default arrowSlice.reducer;