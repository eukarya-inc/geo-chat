import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';

interface DuckDBState {
  instance: AsyncDuckDB | null;
  connection: AsyncDuckDBConnection | null;
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;
}

const initialState: DuckDBState = {
  instance: null,
  connection: null,
  isInitialized: false,
  isLoading: false,
  error: null,
};

// Initialize DuckDB
export const initializeDuckDB = createAsyncThunk(
  'duckdb/initializeDuckDB',
  async () => {
    // Use manual bundles with Vite URL imports
    const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
      mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
      },
      eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
      },
    };
    
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    
    // Open the database
    await db.open({
      path: ':memory:',
      accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
    });
    
    // Install spatial extension
    const connection = await db.connect();
    await connection.query(`INSTALL spatial; LOAD spatial;`);
    
    // Test spatial extension
    console.log('🗄️ DuckDB initialized successfully');
    const testResult = await connection.query(`SELECT ST_AsText(ST_Point(1, 1)) as test_point;`);
    console.log('🌍 Spatial extension test:', testResult.toArray());
    
    return { db, connection };
  }
);

const duckdbSlice = createSlice({
  name: 'duckdb',
  initialState,
  reducers: {
    resetError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(initializeDuckDB.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(initializeDuckDB.fulfilled, (state, action) => {
        state.instance = action.payload.db;
        state.connection = action.payload.connection;
        state.isInitialized = true;
        state.isLoading = false;
      })
      .addCase(initializeDuckDB.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.error.message || 'Failed to initialize DuckDB';
      });
  },
});

export const { resetError } = duckdbSlice.actions;
export default duckdbSlice.reducer;
