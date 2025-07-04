import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

interface DuckDBState {
  connection: AsyncDuckDB | null;
  isInitialized: boolean;
  error: string | null;
}

const initialState: DuckDBState = {
  connection: null,
  isInitialized: false,
  error: null,
};

const duckdbSlice = createSlice({
  name: 'duckdb',
  initialState,
  reducers: {
    setConnection: (state, action: PayloadAction<AsyncDuckDB>) => {
      state.connection = action.payload;
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