# CLAUDE.md - AI Assistant Guidelines

This document provides guidance for Claude and other AI assistants when working with the GIS BI Chat Tool codebase.

## Project Overview

This is a browser-based GIS (Geographic Information System) Business Intelligence tool that combines:
- Natural language chat interface powered by Claude AI
- DuckDB WASM for SQL-based spatial data processing
- MapLibre GL for map visualizations
- ECharts for statistical charts
- React + TypeScript + Redux for the frontend

## Key Architectural Decisions (Updated from TODO.md)

### 1. **Conversational-First Design**
- The chat interface is the primary interaction method
- Visualizations appear inline within the chat
- All operations should be explainable in natural language
- Complex GIS operations are simplified through conversation

### 2. **Browser-Only Processing**
- All data processing happens in the browser using DuckDB WASM
- No backend server required for data operations
- User data never leaves their machine
- API keys are encrypted and stored locally

### 3. **Multi-Agent AI System**
When implementing AI features, use specialized agents:
```typescript
- OrchestratorAgent: Routes requests to appropriate agents
- SQLAgent: Generates DuckDB SQL queries
- SpatialAgent: Handles GIS-specific operations
- VisualizationAgent: Creates appropriate visualizations
- ExplanationAgent: Explains results in plain language
```

### 4. **Tool-Based Approach**
AI interactions use defined tools rather than free-form responses:
```typescript
// Good: Structured tool call
await executeSQL({ 
  query: "SELECT * FROM table WHERE ST_Within(geom, ...)",
  explain: true 
});

// Avoid: Free-form SQL generation without structure
```

## Technology Stack (Based on Design Decisions)

- **State Management**: Lighter Redux approach
- **Component Architecture**: Factory pattern for extensibility
- **Data Pipeline**: Parquet-first with support for other formats
- **AI Integration**: Tool-based using Vercel AI SDK
- **Styling**: Styled-components (moving to shadcn later)
- **Testing**: Vitest + React Testing Library + Vercel AI SDK Mock Provider

## Code Style Guidelines

### TypeScript Conventions
```typescript
// Use interfaces for data structures
interface Dataset {
  id: string;
  name: string;
  type: 'geojson' | 'parquet' | 'csv';
  geometry?: GeometryType;
}

// Use type for unions and aliases
type LayerType = 'point' | 'polygon' | 'line' | 'heatmap';

// Prefer const assertions for constants
const LAYER_TYPES = ['point', 'polygon', 'line'] as const;
```

### React Patterns
```typescript
// Use functional components with hooks
function DataPanel({ onClose }: DataPanelProps) {
  const datasets = useAppSelector(state => state.data.datasets);
  // ...
}

// Use Redux Toolkit for state management
const dataSlice = createSlice({
  name: 'data',
  initialState,
  reducers: {
    addDataset: (state, action) => {
      // Immer allows direct mutation
      state.datasets.push(action.payload);
    }
  }
});
```

### File Organization
```
src/
├── components/      # Shared UI components
├── features/        # Feature-based modules
│   ├── chat/       # Chat-related code
│   ├── map/        # Map visualization
│   └── data/       # Data management
├── store/          # Redux store and slices
├── lib/            # Core libraries (DuckDB, AI)
├── hooks/          # Shared React hooks
├── utils/          # Utility functions
└── types/          # TypeScript type definitions
```

## DuckDB and Spatial Operations

### Always Load Spatial Extension
```sql
INSTALL spatial;
LOAD spatial;
```

### Geometry Column Detection
Look for columns named: 'geometry', 'geom', 'the_geom', 'wkt', 'geojson', or containing coordinate pairs (lat/lon, latitude/longitude).

### Common Spatial Queries
```sql
-- Point in polygon
SELECT * FROM points 
WHERE ST_Within(geometry, (SELECT geometry FROM regions WHERE name = 'Tokyo'));

-- Buffer analysis
SELECT ST_Buffer(geometry, 1000) as buffer_geom FROM points;

-- Spatial join
SELECT a.*, b.region_name 
FROM points a 
JOIN regions b ON ST_Within(a.geometry, b.geometry);
```

## Visualization Guidelines

### Choosing Visualization Types

1. **Point Data**
   - Few points (< 1000): Regular point markers
   - Many points (1000-10000): Clustered points
   - Dense points (> 10000): Heatmap

2. **Polygon Data**
   - With numeric attribute: Choropleth map
   - Categories only: Categorical colors
   - Hierarchical: Consider 3D extrusion

3. **Line Data**
   - Roads/paths: Simple lines with width variation
   - Flows: Animated or gradient lines
   - Networks: Consider edge bundling

4. **Statistical Data**
   - Distributions: Histogram or violin plot
   - Time series: Line chart with time axis
   - Comparisons: Bar or grouped bar chart
   - Proportions: Pie or donut chart

### Color Schemes
```typescript
// Use ColorBrewer schemes for maps
const sequentialSchemes = ['Blues', 'Greens', 'Oranges', 'Purples'];
const divergingSchemes = ['RdBu', 'RdYlBu', 'RdYlGn', 'Spectral'];
const categoricalSchemes = ['Set1', 'Set2', 'Set3', 'Pastel1'];
```

## AI Response Patterns

### Explaining Operations
```typescript
// Good: Explain what will happen
"I'll analyze the accident data by prefecture for 2022. First, I'll filter the data to only include 2022 records, then group by prefecture and count the incidents."

// Then show the SQL
"Here's the SQL query I'll use:"
```sql
SELECT prefecture, COUNT(*) as accident_count
FROM accidents
WHERE year = 2022
GROUP BY prefecture
ORDER BY accident_count DESC;
```

### Progressive Disclosure
Start simple and add complexity as needed:
1. Give a brief answer first
2. Show the visualization
3. Offer to explain the methodology
4. Suggest follow-up analyses

### Error Handling
```typescript
// Good: Helpful error messages
"I couldn't find a geometry column in this dataset. To create a map, I need either:
- A column with GeoJSON or WKT geometries
- Separate latitude and longitude columns
- An address column I can geocode"

// Avoid: Technical errors without context
"Error: ST_GeomFromText failed"
```

## Testing with Vercel AI SDK Mock Provider

When writing tests, use the mock provider:

```typescript
import { MockLanguageModelV1 } from 'ai/test';
import { createGISMockModel } from '../../../../test/mocks/aiMocks';

// Use predefined mock patterns
const mockModel = createGISMockModel();

// Test specific scenarios
const errorModel = createGISMockModel({ errorRate: 0.5 });
const slowModel = createGISMockModel({ delay: 1000 });
```

## Performance Considerations

### Large Datasets
- Sample data for initial exploration (LIMIT 1000)
- Use spatial indexes for geometry queries
- Implement progressive loading for visualizations
- Cache computed results in Redux

### Query Optimization
```sql
-- Good: Use spatial index
CREATE INDEX idx_geom ON table USING GIST (geometry);

-- Good: Filter early
WITH filtered AS (
  SELECT * FROM large_table 
  WHERE date >= '2022-01-01' 
  LIMIT 10000
)
SELECT * FROM filtered WHERE ST_Within(geometry, ...);
```

## Common Tasks and Solutions

### Loading Parquet Files (Priority Format)
```typescript
// Register file with DuckDB
await db.registerFileHandle('data.parquet', file);

// Create table from Parquet
await db.exec(`
  CREATE TABLE geodata AS 
  SELECT * FROM parquet_scan('data.parquet');
`);
```

### Loading GeoJSON
```typescript
// Register file with DuckDB
await db.registerFileHandle('data.geojson', file);

// Create table with spatial column
await db.exec(`
  CREATE TABLE geodata AS 
  SELECT * FROM ST_Read('data.geojson');
`);
```

### Creating Choropleth Map
```typescript
// 1. Aggregate data by region
const sql = `
  SELECT 
    region_id,
    region_name,
    geometry,
    COUNT(*) as count,
    AVG(value) as avg_value
  FROM data
  GROUP BY region_id, region_name, geometry
`;

// 2. Determine color scale based on data distribution
const colorScale = getColorScale(values, 'sequential');

// 3. Create map layer with data-driven styling
```

### Time Series Animation
```typescript
// Extract time range
const timeRange = await db.query(`
  SELECT MIN(date) as start, MAX(date) as end 
  FROM dataset
`);

// Create frames for animation
const frames = generateTimeFrames(timeRange.start, timeRange.end);

// Animate through frames
```

## Debugging Tips

### Console Logging
```typescript
// Development logging
console.log('🗺️ Map: Layer added', { layerId, features: data.length });
console.log('🤖 AI: Tool called', { tool: toolName, params });
console.log('🗄️ DB: Query executed', { sql, rowCount: result.length });
```

### Redux DevTools
- Use Redux DevTools browser extension
- Check action flow and state changes
- Time-travel debugging for complex interactions

### Performance Profiling
```typescript
// Measure query performance
console.time('spatial-query');
const result = await db.query(complexSpatialQuery);
console.timeEnd('spatial-query');
```

## Security Considerations

1. **Never execute raw user input as SQL** - Always use parameterized queries or validate input
2. **API keys are sensitive** - Store encrypted, never in code
3. **File uploads** - Validate file types and sizes
4. **CORS policies** - Required for DuckDB WASM SharedArrayBuffer

## Configuration Notes

### Required Headers for DuckDB WASM
The following headers must be set (already configured in vite.config.ts):
```typescript
{
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp'
}
```

### TypeScript Path Aliases
Use `@/` to import from src directory:
```typescript
import { useAppSelector } from '@/store/hooks';
```

## Project Management and Documentation

### Keeping TODO.md & TODO_DETAILED.md Updated

When working on this project, always:

1. **Check TODO.md & TODO_DETAILED.md First**: Before starting work, review the current status
2. **Update Progress**: Mark items as completed when finished
3. **Add New Items**: If discovering new requirements, add them to the appropriate phase
4. **Document Completions**: Add completed features to the "Recent Updates" section with date
5. **Use Status Indicators**:
   - `[ ]` - Not started
   - `[x]` - Completed
   - `🚧` - In progress/Partial completion
   - `✅` - Phase fully completed

### Update Format
```markdown
## Recent Updates (YYYY-MM-DD)

### Completed Features
1. **Feature Name**: Brief description
   - Sub-feature details
   - Implementation notes
```

### Documentation Sync
- Keep CLAUDE.md updated with new patterns and decisions
- Update README.md when adding major features
- Document breaking changes or migration steps

## Remember

1. **User-Centric**: Always think about the end user who may not know GIS/SQL
2. **Progressive**: Start simple, add complexity only when needed
3. **Explainable**: Every operation should be understandable
4. **Reliable**: Validate inputs, handle errors gracefully
5. **Performant**: Consider data size and browser limitations
6. **Parquet-First**: Prioritize Parquet format for better performance
7. **Keep TODO.md Current**: Update it after completing tasks or finding new requirements

This tool aims to make GIS accessible to everyone through conversation. Keep responses friendly, helpful, and educational.

## TypeScript Best Practices

### File Extensions
- Use `.tsx` for files containing JSX (React components and tests with JSX)
- Use `.ts` for pure TypeScript files without JSX
- Test files with JSX must use `.test.tsx` extension

### Import Management
```typescript
// Always import React when using JSX
import React from 'react';

// Import vitest utilities explicitly
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Import testing utilities
import { render, screen, act, waitFor } from '@testing-library/react';
```

### Type Safety
```typescript
// Avoid using 'any' - use proper types or 'unknown'
// Bad
const data: any = await fetchData();

// Good
interface DataResponse {
  items: Array<{ id: string; name: string }>;
}
const data: DataResponse = await fetchData();

// For truly dynamic data, use 'unknown' and type guards
const response: unknown = await fetchData();
if (isDataResponse(response)) {
  // response is now typed as DataResponse
}
```

### Mock Type Safety
```typescript
// When mocking, provide proper types
// Bad
global.Worker = vi.fn() as any;

// Good
class MockWorker implements Partial<Worker> {
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}
global.Worker = MockWorker as typeof Worker;
```

### Redux Store Types
```typescript
// Use Partial<RootState> for preloaded state in tests
export function setupStore(preloadedState?: Partial<RootState>) {
  // ...
}

// Never use deprecated PreloadedState type from Redux
```

### Vercel AI SDK Types
```typescript
// Handle message content properly
const lastMessageContent = messages[messages.length - 1].content;
const text = typeof lastMessageContent === 'string' 
  ? lastMessageContent 
  : lastMessageContent.map((part: any) => part.text || '').join(' ');

// Always include required response properties
return {
  stream: createMockStream(events),
  rawCall: { rawPrompt: null, rawSettings: {} }
};
```

### ESLint Configuration
- Use modern `eslint.config.js` (ESLint 9+)
- No `.eslintignore` file - use `ignores` in config
- Run `yarn lint` before committing

### Common TypeScript Errors and Solutions

1. **JSX in .ts files**
   - Error: `'>' expected` or `Unterminated regular expression`
   - Solution: Rename file to `.tsx`

2. **Missing vitest imports**
   - Error: `Cannot find name 'vi'`
   - Solution: Import from vitest: `import { vi } from 'vitest'`

3. **React/Provider not found**
   - Error: `Cannot find name 'Provider'`
   - Solution: Import React and Provider explicitly

4. **Module resolution in tsconfig.node.json**
   - Error: `Unknown compiler option 'bundlerModuleResolution'`
   - Solution: Use `"moduleResolution": "bundler"`

### File Creation Guidelines
- Always add a newline at the end of every file
- Use proper file extensions (.ts, .tsx, .json, etc.)
- Follow the established directory structure

### Build and Test Commands
```bash
# Always run these before committing:
yarn build       # Verify TypeScript compilation (run this FIRST)
yarn lint        # Check code style
yarn test        # Run tests

# IMPORTANT: Always run `yarn build` after making changes and before committing
# This ensures no TypeScript errors or build issues
```

### My Collaboration Preferences
- I prefer step-by-step problem analysis with todo tracking
- Always show file locations (file:line) when referencing code
- When debugging, explain both the problem and the solution approach
- Include testing recommendations with all code changes
- Once Done with changes, Always run yarn build, yarn test, update TODO.md and TODO_DETAILED.md

### Testing Data Loading
When implementing data loading features, always test with:

1. **File Upload Testing**:
   ```javascript
   // Test CSV files
   - Small CSV file (<1MB)
   - Large CSV file (>10MB)
   - CSV with special characters in headers
   
   // Test GeoJSON files  
   - Valid FeatureCollection
   - Single Feature (should error)
   - Invalid JSON (should error)
   
   // Test Parquet files
   - Standard parquet file
   - Compressed parquet
   ```

2. **URL Loading Testing**:
   ```javascript
   // Test URLs
   - https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson
   - https://raw.githubusercontent.com/datasets/covid-19/main/data/countries-aggregated.csv
   - Invalid URL (should error)
   - Non-existent file (should error)
   ```

3. **DuckDB File Handling**:
   - Always call `db.open()` before using the database
   - For CSV/Parquet: Use `registerFileHandle()` to register with DuckDB
   - For GeoJSON: Parse file content and create table with flattened properties:
     ```sql
     -- Analyze features to determine property fields
     -- Create table with _geojson, individual properties, and geometry
     CREATE TABLE tablename (_geojson JSON, "name" VARCHAR, "population" DOUBLE, geom GEOMETRY);
     -- Insert with all fields populated
     INSERT INTO tablename VALUES 
       ('{"type":"Feature",...}'::JSON, 'Tokyo', 37000000, ST_GeomFromGeoJSON('{"type":"Point",...}'));
     ```
   - For remote files: Ensure httpfs extension is loaded
   - Never use ST_Read with file handles for GeoJSON - it causes GDAL errors
   - Always validate GeoJSON is a FeatureCollection before processing
   - Preserve all GeoJSON properties as individual columns for full compatibility

4. **Error Handling**:
   - Always wrap file operations in try-catch
   - Provide user-friendly error messages
   - Clean up resources (e.g., revokeObjectURL) even on error

### Anthropic API Browser Access
When using the Anthropic API from the browser, always include the special header:
```typescript
const anthropic = createAnthropic({
  apiKey: apiKey,
  headers: {
    'anthropic-dangerous-direct-browser-access': 'true',
  },
});
```
This header is required for browser-based applications to access the Anthropic API directly.

## Testing Requirements

- After implementing any new feature or making significant changes, add unit tests
- Keep tests simple and focused - just a few test cases per component/function
- Run `yarn test` to ensure all tests pass before completing work
- Tests should be placed in `__tests__` folders next to the code they test
- Use Vitest for testing with React Testing Library for component tests
- Always run `yarn build` after making changes to ensure TypeScript compilation succeeds

## Documentation Updates

- Keep TODO.md and TODO_DETAILED.md updated with project progress
- Mark completed items and add new ones as features are implemented
- Update the "Recent Updates" section when making significant changes

## Recent Updates (2025-07-08)

### Data Loading Enhancement
- Implemented comprehensive GeoJSON property preservation
- Tables now have individual columns for each property (flattened structure)
- Preserves complete feature in `_geojson` column for reference
- Automatic field type detection (string, number, boolean, json)
- Added dataProcessing utilities with comprehensive tests

### AI Tools Implementation
- Created base tool framework for AI interactions
- Implemented core tools:
  - `describeData` - Get table schemas and metadata
  - `executeQuery` - Run SQL queries with automatic visualization detection
  - `createMap` - Generate map visualizations from spatial data
- Integrated tools with Claude AI using Vercel AI SDK
- Updated system prompt with tool usage guidelines
- Added comprehensive tool tests

### Testing Improvements
- Fixed all test failures
- Added comprehensive tests for data processing and AI tools
- Updated AI chat tests to work with mock models
- Excluded tmp directory from test runs
- Created integration tests for AI tools with DuckDB

### CI/CD Fixes
- Configured Yarn 4.3.1 with proper packageManager field
- Fixed Redux serialization issues with BigInt values
- Ensured all builds and tests pass

### AI Tools Integration Complete
- AI tools now properly execute when users ask questions like "What data is available?"
- Added error handling for DuckDB initialization state
- Created comprehensive tests for tool execution flow
- Tools integrate seamlessly with the chat interface via `useAIChatWithTools` hook
