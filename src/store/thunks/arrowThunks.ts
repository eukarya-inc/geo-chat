import { createAsyncThunk } from '@reduxjs/toolkit';
import { tableToIPC } from 'apache-arrow';
import type { EnhancedDBManager } from '../../services/duckdb/enhancedDBManager';
import { 
  startQuery, 
  querySuccess, 
  queryError,
  startExport,
  exportSuccess,
  exportError,
  setTableStats
} from '../slices/arrowSlice';

/**
 * Execute a query using Arrow for efficient data transfer
 */
export const executeArrowQuery = createAsyncThunk<
  void,
  { query: string; dbManager: EnhancedDBManager },
  { rejectValue: string }
>(
  'arrow/executeQuery',
  async ({ query, dbManager }, { dispatch, rejectWithValue }) => {
    dispatch(startQuery(query));
    
    try {
      const result = await dbManager.executeQuery(query);
      
      // Serialize Arrow table for Redux storage
      const serializedData = Array.from(tableToIPC(result.arrow));
      
      dispatch(querySuccess({
        query,
        result: {
          data: serializedData,
          rowCount: result.rowCount,
          columns: result.columns,
          executionTime: result.executionTime
        }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Query execution failed';
      dispatch(queryError({ query, error: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Execute a spatial query using GeoArrow
 */
export const executeSpatialQuery = createAsyncThunk<
  void,
  { query: string; dbManager: EnhancedDBManager },
  { rejectValue: string }
>(
  'arrow/executeSpatialQuery',
  async ({ query, dbManager }, { dispatch, rejectWithValue }) => {
    dispatch(startQuery(query));
    
    try {
      const result = await dbManager.executeSpatialQuery(query);
      
      // Serialize Arrow table for Redux storage
      const serializedData = Array.from(tableToIPC(result.arrow));
      
      dispatch(querySuccess({
        query,
        result: {
          data: serializedData,
          rowCount: result.rowCount,
          columns: result.columns,
          executionTime: result.executionTime
        }
      }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Spatial query execution failed';
      dispatch(queryError({ query, error: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Export a table in various formats
 */
export const exportTable = createAsyncThunk<
  Uint8Array,
  { 
    tableName: string; 
    format: 'arrow' | 'parquet' | 'csv';
    dbManager: EnhancedDBManager;
  },
  { rejectValue: string }
>(
  'arrow/exportTable',
  async ({ tableName, format, dbManager }, { dispatch, rejectWithValue }) => {
    dispatch(startExport({ tableName, format }));
    
    try {
      const data = await dbManager.exportTable(tableName, format);
      dispatch(exportSuccess());
      return data;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Export failed';
      dispatch(exportError(errorMessage));
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Load table statistics
 */
export const loadTableStats = createAsyncThunk<
  void,
  { tableName: string; dbManager: EnhancedDBManager },
  { rejectValue: string }
>(
  'arrow/loadTableStats',
  async ({ tableName, dbManager }, { dispatch, rejectWithValue }) => {
    try {
      const stats = await dbManager.getTableStats(tableName);
      dispatch(setTableStats({ tableName, stats }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load table statistics';
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Perform spatial join operation
 */
export const performSpatialJoin = createAsyncThunk<
  void,
  {
    leftTable: string;
    rightTable: string;
    predicate: 'intersects' | 'contains' | 'within' | 'touches';
    outputTable: string;
    dbManager: EnhancedDBManager;
  },
  { rejectValue: string }
>(
  'arrow/spatialJoin',
  async ({ leftTable, rightTable, predicate, outputTable, dbManager }, { dispatch, rejectWithValue }) => {
    try {
      const geoArrowService = dbManager.getGeoArrowService();
      const resultTable = await geoArrowService.spatialJoin(leftTable, rightTable, predicate);
      
      // Save result as new table
      await dbManager.getArrowService().loadArrowTable(outputTable, resultTable);
      
      // Load stats for the new table
      dispatch(loadTableStats({ tableName: outputTable, dbManager }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Spatial join failed';
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Create spatial index for better performance
 */
export const createSpatialIndex = createAsyncThunk<
  void,
  {
    tableName: string;
    geomColumn: string;
    dbManager: EnhancedDBManager;
  },
  { rejectValue: string }
>(
  'arrow/createSpatialIndex',
  async ({ tableName, geomColumn, dbManager }, { rejectWithValue }) => {
    try {
      const geoArrowService = dbManager.getGeoArrowService();
      await geoArrowService.createSpatialIndex(tableName, geomColumn);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to create spatial index';
      return rejectWithValue(errorMessage);
    }
  }
);