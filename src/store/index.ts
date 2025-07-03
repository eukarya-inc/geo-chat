import { configureStore } from '@reduxjs/toolkit';
import dataReducer from './slices/dataSlice';
import mapReducer from './slices/mapSlice';
import uiReducer from './slices/uiSlice';
import duckdbReducer from './slices/duckdbSlice';
import { loggerMiddleware } from './middleware/logger';

export const store = configureStore({
  reducer: {
    data: dataReducer,
    map: mapReducer,
    ui: uiReducer,
    duckdb: duckdbReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: [
          'duckdb/setConnection',
          'data/setArrowTable',
          'map/setStyleManager',
        ],
        // Ignore these field paths in all actions
        ignoredActionPaths: ['payload.db', 'payload.styleManager'],
        // Ignore these paths in the state
        ignoredPaths: [
          'duckdb.connection',
          'data.arrowTables',
          'map.styleManager',
        ],
      },
    }).concat(loggerMiddleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;