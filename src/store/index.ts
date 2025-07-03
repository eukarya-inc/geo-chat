import { configureStore } from '@reduxjs/toolkit';
import dataReducer from './slices/dataSlice';
import mapReducer from './slices/mapSlice';
import uiReducer from './slices/uiSlice';
import duckdbReducer from './slices/duckdbSlice';
import arrowReducer from './slices/arrowSlice';
import processorReducer from './slices/processorSlice';
import { loggerMiddleware } from './middleware/logger';

export const store = configureStore({
  reducer: {
    data: dataReducer,
    map: mapReducer,
    ui: uiReducer,
    duckdb: duckdbReducer,
    arrow: arrowReducer,
    processor: processorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: [
          'duckdb/setConnection',
          'data/setArrowTable',
          'map/setStyleManager',
          'arrow/querySuccess',
          'arrow/setTableStats',
          'processor/completeProcessing',
        ],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.db', 'payload.styleManager', 'payload.dbManager', 'payload.result.data'],
        // Ignore these paths in the state
        ignoredPaths: [
          'duckdb.connection',
          'data.arrowTables',
          'map.styleManager',
          'arrow.queryResults',
        ],
      },
    }).concat(loggerMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;