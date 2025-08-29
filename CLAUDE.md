# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with host 0.0.0.0
- `npm run build` - Build project (runs TypeScript compiler then Vite build)
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking without emitting files
- `npm test` - Run Vitest tests (single run)
- `npm run test:watch` - Run Vitest tests in watch mode
- `npm run test:browser` - Run browser-specific tests
- `npm run test:unit` - Run unit tests
- `npm run preview` - Preview built application

## IMPORTANT: Always Run Build and Test After Changes

After making any code changes, you MUST run:
```bash
npm run build && npm test
```

This ensures:
1. TypeScript compilation succeeds
2. The build process completes without errors
3. All tests pass
4. No regressions are introduced

If the build or tests fail, fix the issues before considering the task complete.

## Critical Implementation Details

### Property Access in MapLibre Styles

When generating styles for map visualization:

1. **ALWAYS use direct property access** for all properties:
   - ✅ CORRECT: `["get", "都道府県名"]`
   - ✅ CORRECT: `["get", "prefecture"]`
   - ❌ WRONG: `["get", "properties", ["get", "都道府県名"]]`
   - ❌ WRONG: `["get", ["get", "都道府県名", ["get", "properties"]]]`

2. **The system automatically extracts JSON properties** when the 'properties' column is selected in the table list

3. **Column values ARE automatically converted to JSON** in the SQL query using `to_json()` to handle complex data types uniformly. The property extraction code handles unwrapping JSON-encoded strings.

### Temporary Tables Management

1. **Temporary tables are hidden from UI but accessible to queries**:
   - Tables prefixed with: `temp_`, `tmp_`
   - Tables suffixed with: `_timeline`, `_stats`, `_analysis`
   - These remain fully accessible to SQL queries and Vega-Lite charts

2. **Always verify table creation** before using in visualizations:
   ```sql
   CREATE TABLE temp_analysis AS SELECT ...;
   SELECT COUNT(*) FROM temp_analysis; -- Verify success
   ```

### Map Rendering Requirements

**CRITICAL: Vector tiles require at least one column to be selected**
- When no columns are selected, the vector tile query generates invalid SQL
- This causes points/lines/polygons to not appear on the map even though geometry exists
- The map will still zoom to the correct bounds (proving geometry is valid) but features won't render
- Always ensure at least one column is selected in the table list UI for map visualization to work
- This is particularly important for CSV files loaded with automatic coordinate detection

## Architecture Overview

This is a React application that demonstrates DuckDB-WASM integration with geospatial data visualization on MapLibre GL maps.

### Core Components

- **useDuckDB hook** (`src/hooks/useDuckDB.ts`): Manages DuckDB-WASM initialization with spatial extension support. Uses manual bundles configuration and initializes once with ref-based tracking.

- **App component** (`src/App.tsx`): Main application state management for table selection, column visibility, and data refresh coordination between components.

- **RemoteFile component** (`src/components/RemoteFile.tsx`): Handles URL input and creates DuckDB tables from remote data sources.

- **TableList component** (`src/components/TableList.tsx`): Displays available tables and manages column selection for popup display. Automatically filters out temporary analysis tables (prefix: `temp_`, `tmp_`, suffix: `_timeline`, `_stats`, `_analysis`) from the UI while keeping them accessible for queries.

- **Map component** (`src/components/Map.tsx`): MapLibre GL integration that renders selected table data and shows column information in popups. Handles JSON property extraction for all geometry types (points, lines, polygons).

- **VegaLiteChart component** (`src/components/VegaLiteChart.tsx`): Interactive chart component that can access all tables including temporary ones hidden from the UI.

- **AI Chat components** (`src/components/chat/`): AI-powered SQL assistant with tools for map styling and data visualization. Uses Anthropic Claude with specialized tools for DuckDB queries and MapLibre style generation.

### Key Technical Details

- **DuckDB Configuration**: Uses manual bundles for DuckDB-WASM with both MVP and EH (Exception Handling) workers. Spatial extension is automatically installed and loaded.

- **Vite Configuration**: Excludes `@duckdb/duckdb-wasm` from optimization and sets required headers for SharedArrayBuffer support (Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy). Base path set to `/duckdb-wasm-prototype/` for GitHub Pages deployment.

- **Tile Utilities** (`src/utils/tileUtils.ts`): Contains functions for tile coordinate calculations, GeoJSON to raster conversion, and GeoJSON to MVT conversion with caching optimization.

- **Vector Tile Support** (`src/utils/vectorTileUtils.ts`): Handles vector tile processing and rendering.

- **MapLibre Expression Fixer** (`src/utils/maplibreExpressionFixer.ts`): Automatically fixes incorrect property reference patterns in MapLibre styles, handling various nested access patterns that may be generated by AI or external tools.

- **JSON Property Handling**: The Map component automatically extracts JSON properties from a 'properties' column when selected, making nested JSON fields directly accessible in MapLibre style expressions.

- **SQL History Manager** (`src/lib/duckdb/sqlHistoryManager.ts`): Manages SQL query history with localStorage persistence.

- **Database Context** (`src/lib/duckdb/dbContext.ts`): Provides centralized DuckDB connection management with schema support.

### State Management

- **Jotai Atoms**: Used for global state management, organized in `src/store/`:
  - `modelingRemoteAtoms.ts`: Chat state and AI-related atoms
  - `atomFactories.ts`: Factory functions for creating atoms with persistence

### AI Tool Integration

The application includes comprehensive AI tools for data manipulation and visualization:

- **duckdbTool** (`src/lib/ai/tools/duckdbTool.ts`): Executes SQL queries against DuckDB with safety checks, automatic LIMIT for SELECT queries, and SQL explanation generation
- **chartTool** (`src/lib/ai/tools/chartTool.ts`): Creates and retrieves Vega-Lite chart specifications for data visualization
- **mapStyleTool** (`src/lib/ai/tools/mapStyleTool.ts`): Updates map styles with extensive MapLibre GL expression support, geometry type validation, and nested property access
- **mapStyleGetTool** (`src/lib/ai/tools/mapStyleGetTool.ts`): Retrieves current map styles for analysis
- **geocodingTool** (`src/lib/ai/tools/geocodingTool.ts`): Geocodes addresses using OpenStreetMap Nominatim API, supports single and batch geocoding with rate limiting
- **geocodingTools** (`src/lib/ai/tools/geocodingTools.ts`): Helper functions for analyzing tables for geocoding and adding geocoded columns
- **completionTool** (`src/lib/ai/tools/completionTool.ts`): Provides SQL query completion and suggestions

### Data Flow

1. User inputs remote file URL
2. RemoteFile component creates DuckDB table
3. TableList refreshes and displays available tables (filtering temporary tables from UI)
4. User selects table and columns for display
5. Map component queries selected table and renders data
6. Column data appears in map popups when features are clicked
7. JSON properties are automatically extracted and made available for styling
8. AI assistant can help with SQL queries and map styling through chat interface

### Testing Approach

- Tests are organized alongside source files with `.test.ts` or `.test.tsx` extensions
- **Browser tests** (`.browser.test.ts`): Use for unit-test style tests that depend on browser-only APIs like DuckDB-WASM, MapLibre GL, or other browser-specific features
- **Regular unit tests** (`.test.ts`): Use for tests that don't depend on browser APIs and can run in Node.js environment
- Run all tests with `npm test`, watch mode with `npm run test:watch`
- Run browser tests specifically with `npm run test:browser`
- Run unit tests specifically with `npm run test:unit`
- Test utilities available in `src/test/` directory

#### When to Use Browser Tests

Use browser tests (`.browser.test.ts`) when testing:
- DuckDB-WASM functionality
- MapLibre GL map rendering
- Vector tile processing
- WebAssembly modules
- Browser-specific APIs (WebWorkers, SharedArrayBuffer, etc.)

Use regular unit tests (`.test.ts`) when testing:
- Pure utility functions
- Data transformations
- Business logic without browser dependencies
- React component logic (without browser-specific rendering)

### Code Organization Principles

- If the contents of a function become large, such as dozens of lines, aggressively split it into separate files or separate functions, and give it an easy-to-understand name.
- Avoid dataset-specific code - keep implementations generic and reusable.
- When handling JSON data, ensure the approach works for any JSON structure, not just specific schemas.

## ⚠️ CRITICAL: Always Run Lint Before Completion

**IMPORTANT**: After making any code changes and before considering your task complete, you MUST run:

```bash
npm run lint
```

This ensures:
- Code follows the project's style guidelines
- No syntax errors or warnings
- Consistent formatting across the codebase
- ESLint rules are satisfied

If lint errors occur, fix them before marking the task as complete. The linter may automatically fix some issues, which will modify files - this is expected and desired behavior.