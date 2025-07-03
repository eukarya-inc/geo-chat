import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../../lib/duckdb/dbStateManager';

interface DuckDBState {
  connection: AsyncDuckDB | null;
  dbStateManager: DBStateManager | null;
  isInitialized: boolean;
  error: string | null;
}

const initialState: DuckDBState = {
  connection: null,
  dbStateManager: null,
  isInitialized: false,
  error: null,
};

const duckdbSlice = createSlice({
  name: 'duckdb',
  initialState,
  reducers: {
    setConnection: (state, action: PayloadAction<{ db: AsyncDuckDB; dbStateManager: DBStateManager }>) => {
      state.connection = action.payload.db;
      state.dbStateManager = action.payload.dbStateManager;
      state.isInitialized = true;
      state.error = null;
    },
    setError: (state, action: PayloadAction<string>) => {
      state.error = action.payload;
      state.isInitialized = false;
    },
    reset: () => initialState,
  },
});

export const { setConnection, setError, reset } = duckdbSlice.actions;
export default duckdbSlice.reducer;