import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { loadTables, createTableFromUrl } from '../thunks/dataThunks';

interface TableColumn {
  name: string;
  type: string;
}

interface TableInfo {
  name: string;
  columns: TableColumn[];
  rowCount?: number;
}

interface DataState {
  tables: TableInfo[];
  selectedTable: string | null;
  selectedColumns: Record<string, string[]>;
  isLoading: boolean;
  error: string | null;
}

const initialState: DataState = {
  tables: [],
  selectedTable: null,
  selectedColumns: {},
  isLoading: false,
  error: null,
};

const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    setTables: (state, action: PayloadAction<TableInfo[]>) => {
      state.tables = action.payload;
      state.error = null;
    },
    addTable: (state, action: PayloadAction<TableInfo>) => {
      state.tables.push(action.payload);
      state.error = null;
    },
    removeTable: (state, action: PayloadAction<string>) => {
      state.tables = state.tables.filter(t => t.name !== action.payload);
      if (state.selectedTable === action.payload) {
        state.selectedTable = null;
      }
      delete state.selectedColumns[action.payload];
    },
    setSelectedTable: (state, action: PayloadAction<string | null>) => {
      state.selectedTable = action.payload;
    },
    setSelectedColumns: (state, action: PayloadAction<{ table: string; columns: string[] }>) => {
      state.selectedColumns[action.payload.table] = action.payload.columns;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    reset: () => initialState,
  },
  extraReducers: (builder) => {
    // Handle loadTables async thunk
    builder
      .addCase(loadTables.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loadTables.fulfilled, (state, action) => {
        state.tables = action.payload;
        state.isLoading = false;
        state.error = null;
      })
      .addCase(loadTables.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || 'Failed to load tables';
      });
    
    // Handle createTableFromUrl async thunk
    builder
      .addCase(createTableFromUrl.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(createTableFromUrl.fulfilled, (state, action) => {
        // The table will be loaded by a subsequent loadTables call
        state.isLoading = false;
        state.error = null;
        // Auto-select the newly created table
        state.selectedTable = action.payload;
      })
      .addCase(createTableFromUrl.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload || 'Failed to create table';
      });
  },
});

export const {
  setTables,
  addTable,
  removeTable,
  setSelectedTable,
  setSelectedColumns,
  setLoading,
  setError,
  reset,
} = dataSlice.actions;

export default dataSlice.reducer;

// Re-export thunks for convenience
export { loadTables, createTableFromUrl } from '../thunks/dataThunks';