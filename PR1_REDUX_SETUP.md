# PR1: Redux Basic Setup

## Overview
This PR introduces Redux Toolkit to the project as the foundation for better state management. This is the first step in our architecture revamp based on Kepler.gl patterns.

## Changes Made

### 1. Dependencies
- Added `@reduxjs/toolkit` and `react-redux`

### 2. Store Structure
Created Redux store with the following slices:
- **duckdbSlice**: Manages DuckDB connection and initialization state
- **dataSlice**: Manages tables, selected table, and columns
- **mapSlice**: Manages map layers and visualization state
- **uiSlice**: Manages UI state like API key input and sidebar

### 3. Integration
- Created `AppWithRedux` wrapper component for progressive migration
- Updated `main.tsx` to wrap app with Redux Provider
- Added custom hooks (`useAppDispatch`, `useAppSelector`)
- Created `useInitializeDuckDB` hook for Redux-aware DB initialization

## Architecture Benefits
1. **Centralized State**: All application state in one place
2. **Type Safety**: Full TypeScript support with Redux Toolkit
3. **DevTools Support**: Easy debugging with Redux DevTools
4. **Scalability**: Foundation for complex state management
5. **Progressive Migration**: Existing functionality remains intact

## What's NOT Changed
- Existing components still work as before
- No breaking changes to current functionality
- DuckDB integration remains the same
- Map visualization unchanged

## Next Steps (Future PRs)
- PR2: Migrate existing component state to Redux
- PR3: Add Redux middleware and DevTools enhancements
- PR4: Refactor DuckDB with Arrow support
- PR5: Implement data processor system

## Testing
- All existing tests pass
- Application runs without errors
- TypeScript compilation successful
- ESLint passes (except pre-existing issues)

## How to Test
1. Run `npm install --legacy-peer-deps`
2. Run `npm run dev`
3. Verify application works as before
4. Install Redux DevTools browser extension to see store state