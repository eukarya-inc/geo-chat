import { createSlice, PayloadAction } from '@reduxjs/toolkit';

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