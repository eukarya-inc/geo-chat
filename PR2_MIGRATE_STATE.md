# PR2: Migrate State to Redux

## Overview
This PR migrates the existing component state from React hooks to Redux, completing the state management migration started in PR1.

## Changes Made

### 1. Created Redux-aware App Component
- Created `AppRedux.tsx` that uses Redux state instead of local `useState`
- Updated `AppWithRedux.tsx` to use the new component
- Removed all local state management in favor of Redux

### 2. Enhanced Redux Store
- Added logger middleware for development debugging
- Added Redux DevTools support (built into Redux Toolkit)
- Improved TypeScript typing throughout

### 3. Created Async Thunks
- `loadTables`: Loads all tables from DuckDB
- `createTableFromUrl`: Creates tables from remote files (Parquet, CSV, GeoJSON)
- Added proper error handling and loading states

### 4. Updated Data Slice
- Added `extraReducers` to handle async thunk states
- Re-exported thunks for convenience
- Proper loading and error state management

### 5. Developer Experience Improvements
- Console logging of all Redux actions in development
- Redux DevTools integration for state inspection
- Better error messages and state debugging

## State Migration Summary

| Old State (App.tsx) | New State (Redux) | Slice |
|---------------------|------------------|-------|
| `selectedTable` | `data.selectedTable` | dataSlice |
| `selectedColumns` | `data.selectedColumns` | dataSlice |
| `mapStyleManager` | `map.styleManager` | mapSlice |
| `apiKey` | `ui.apiKey` | uiSlice |
| `showApiKeyInput` | `ui.showApiKeyInput` | uiSlice |
| `isLoadingApiKey` | `ui.isLoadingApiKey` | uiSlice |
| `db` | `duckdb.connection` | duckdbSlice |
| `dbStateManager` | `duckdb.dbStateManager` | duckdbSlice |

## Benefits
1. **Centralized State**: All app state in one predictable location
2. **Time-travel Debugging**: Redux DevTools allows state replay
3. **Better Performance**: React components only re-render when their slice changes
4. **Async Operations**: Thunks provide consistent loading/error handling
5. **Maintainability**: Clear separation of concerns

## Testing
- All existing functionality works as before
- Redux DevTools shows proper state updates
- Console logs show action flow in development
- No TypeScript errors
- All tests pass

## Next Steps (Future PRs)
- PR3: Add more Redux middleware (persistence, etc.)
- PR4: Refactor DuckDB with Arrow support
- PR5: Create data processor system