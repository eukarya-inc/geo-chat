# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `npm run dev` - Start development server with host 0.0.0.0
- `npm run build` - Build project (runs TypeScript compiler then Vite build)
- `npm run format` - Format source files with Prettier (writes changes)
- `npm run format:check` - Verify Prettier formatting without writing
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript type checking without emitting files
- `npm run check` - Run format, lint, typecheck, and unit tests (fast feedback for development)
- `npm test` - Run unit tests only (fast, used in check script)
- `npm run test:watch` - Run Vitest tests in watch mode
- `npm run test:browser` - Run browser-specific tests
- `npm run test:unit` - Run unit tests (same as `npm test`)
- `npm run test:full` - Run all tests including browser tests (used in CI)
- `npm run preview` - Preview built application

## Git Workflow and Branch Protection

**CRITICAL: Never push directly to the main branch**

This repository has a pre-push hook that prevents direct pushes to main. All changes must go through feature branches and pull requests.

### Required Workflow

1. **Create a feature branch:**

    ```bash
    git checkout -b feature/your-feature-name
    ```

2. **Make your changes and commit them**

3. **Push your feature branch:**

    ```bash
    git push origin feature/your-feature-name
    ```

4. **Create a Pull Request on GitHub for review**

The pre-push hook will automatically reject any attempt to push directly to main with a helpful error message.

## IMPORTANT: Always Run Format, Lint, and Test After Changes

After making any code changes, you MUST run:

```bash
npm run check
```

This ensures:

1. Code is automatically formatted with Prettier
2. ESLint passes without errors or warnings
3. TypeScript compilation succeeds
4. All tests pass
5. No regressions are introduced

**Important notes:**

- The `check` script runs: format (error-only) → lint (quiet) → unit test (silent)
- Only unit tests are run for fast feedback; full tests (including browser tests) run in CI
- Output is suppressed on success; only errors are shown to save context
- If any step fails, the command chain stops and shows the error

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

- **RemoteFile component** (`src/components/remote-file/index.tsx`): Handles URL input and creates DuckDB tables from remote data sources.

- **TableView component** (`src/components/table/TableView.tsx`): Data grid component for displaying table contents with virtual scrolling.

- **TableSelector component** (`src/components/table/TableSelector.tsx`): Simple table selection dropdown used in the chat interface.

- **Query component** (`src/components/query/index.tsx`): SQL query display component showing table definitions and SQL flow visualization.

- **Map component** (`src/components/Map.tsx`): MapLibre GL integration that renders selected table data and shows column information in popups. Handles JSON property extraction for all geometry types (points, lines, polygons).

- **VegaLiteChart component** (`src/components/chart/VegaLiteChart.tsx`): Interactive chart component for data visualization. Uses a custom Vega loader that queries DuckDB directly using the `duckdb://schema.table` or `duckdb://table` URL scheme. The loader executes `SELECT * FROM table` when Vega requests data, eliminating serialization overhead.

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
    - `remoteAtoms.ts`: Remote state (chats, messages, map specs, chart specs)
    - `localAtoms.ts`: Local UI state (selected chat, visibility settings)
    - `derivedAtoms.ts`: Computed atoms combining remote and local state
    - `atoms.ts`: Re-exports all atoms for backward compatibility

### AI Tool Integration

The application includes comprehensive AI tools for data manipulation and visualization:

- **duckdbTool** (`src/lib/ai/tools/duckdbTool.ts`): Executes SQL queries against DuckDB with safety checks, automatic LIMIT for SELECT queries, and SQL explanation generation
- **chartTool** (`src/lib/ai/tools/chartTool.ts`): Creates and retrieves Vega-Lite chart specifications for data visualization
- **mapStyleTool** (`src/lib/ai/tools/mapStyleTool.ts`): Updates map styles with extensive MapLibre GL expression support, geometry type validation, and nested property access
- **mapStyleGetTool** (`src/lib/ai/tools/mapStyleGetTool.ts`): Retrieves current map styles for analysis
- **geocodingTool** (`src/lib/ai/tools/geocodingTool.ts`): Geocodes addresses using OpenStreetMap Nominatim API, supports single and batch geocoding with rate limiting, analyzes tables for geocoding, and adds geocoded columns
- **completionTool** (`src/lib/ai/tools/completionTool.ts`): Provides SQL query completion and suggestions

### Data Flow

1. User inputs remote file URL
2. RemoteFile component creates DuckDB table
3. TableSelector shows available tables for selection
4. User selects table to view
5. TableView displays table data with virtual scrolling
6. Map component queries selected table and renders data
7. Column data appears in map popups when features are clicked
8. JSON properties are automatically extracted and made available for styling
9. AI assistant can help with SQL queries and map styling through chat interface

### Testing Approach

- Tests are organized alongside source files with `.test.ts` or `.test.tsx` extensions
- **Browser tests** (`.browser.test.ts`): Use for unit-test style tests that depend on browser-only APIs like DuckDB-WASM, MapLibre GL, or other browser-specific features
- **Regular unit tests** (`.test.ts`): Use for tests that don't depend on browser APIs and can run in Node.js environment
- Run unit tests with `npm test` (fast, for local development)
- Run all tests with `npm run test:full` (includes browser tests, used in CI)
- Watch mode with `npm run test:watch`
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

## ⚠️ CRITICAL: Always Run Check Before Task Completion

**IMPORTANT**: After making any code changes and before considering your task complete, you MUST run:

```bash
npm run check
```

This ensures:

- Code is automatically formatted with Prettier
- Code follows the project's style guidelines
- No syntax errors or warnings
- TypeScript compilation succeeds
- All tests pass
- No regressions are introduced

The check command runs all validation steps quietly, only showing errors to save context.
