import { configureStore } from '@reduxjs/toolkit';
import duckdbReducer from './slices/duckdbSlice';
import chatReducer from './slices/chatSlice';
import mapReducer from './slices/mapSlice';
import dataReducer from './slices/dataSlice';

export const store = configureStore({
  reducer: {
    duckdb: duckdbReducer,
    chat: chatReducer,
    map: mapReducer,
    data: dataReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        // Ignore these action types
        ignoredActions: [
          'duckdb/initializeDuckDB/fulfilled',
          'chat/addMessage',
        ],
        // Ignore these paths in the state
        ignoredPaths: [
          'duckdb.instance', 
          'duckdb.connection',
          'chat.messages',
        ],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
