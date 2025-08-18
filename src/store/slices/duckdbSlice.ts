import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface DuckDBState {
  connection: AsyncDuckDB | null;
  dbContext: DBContext | null;
  isInitialized: boolean;
  error: string | null;
}

const initialState: DuckDBState = {
  connection: null,
  dbContext: null,
  isInitialized: false,
  error: null,
};

const duckdbSlice = createSlice({
  name: 'duckdb',
  initialState,
  reducers: {
    setConnection: (state, action: PayloadAction<{ db: AsyncDuckDB; dbContext: DBContext }>) => {
      state.connection = action.payload.db;
      state.dbContext = action.payload.dbContext;
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