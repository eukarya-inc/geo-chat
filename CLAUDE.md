# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with host 0.0.0.0
- `npm run build` - Build project (runs TypeScript compiler then Vite build)
- `npm run lint` - Run ESLint
- `npm test` - Run Vitest tests (single run)
- `npm run test:watch` - Run Vitest tests in watch mode
- `npm run test:ui` - Run Vitest with UI interface
- `npm run preview` - Preview built application

## Architecture Overview

This is a React application that demonstrates DuckDB-WASM integration with geospatial data visualization on MapLibre GL maps.

### Core Components

- **useDuckDB hook** (`src/hooks/useDuckDB.ts`): Manages DuckDB-WASM initialization with spatial extension support. Uses manual bundles configuration and initializes once with ref-based tracking.

- **App component** (`src/App.tsx`): Main application state management for table selection, column visibility, and data refresh coordination between components.

- **RemoteFile component** (`src/components/RemoteFile.tsx`): Handles URL input and creates DuckDB tables from remote data sources.

- **TableList component** (`src/components/TableList.tsx`): Displays available tables and manages column selection for popup display.

- **Map component** (`src/components/Map.tsx`): MapLibre GL integration that renders selected table data and shows column information in popups.

### Key Technical Details

- **DuckDB Configuration**: Uses manual bundles for DuckDB-WASM with both MVP and EH (Exception Handling) workers. Spatial extension is automatically installed and loaded.

- **Vite Configuration**: Excludes `@duckdb/duckdb-wasm` from optimization and sets required headers for SharedArrayBuffer support (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy).

- **Tile Utilities** (`src/utils/tileUtils.ts`): Contains functions for tile coordinate calculations, GeoJSON to raster conversion, and GeoJSON to MVT conversion with caching optimization.

- **Vector Tile Support** (`src/utils/vectorTileUtils.ts`): Handles vector tile processing and rendering.

### Data Flow

1. User inputs remote file URL
2. RemoteFile component creates DuckDB table
3. TableList refreshes and displays available tables
4. User selects table and columns for display
5. Map component queries selected table and renders data
6. Column data appears in map popups when features are clicked

### Code Organization Principles

- If the contents of a function become large, such as dozens of lines, aggressively split it into separate files or separate functions, and give it an easy-to-understand name.