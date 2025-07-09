# DuckDB-WASM Geospatial Visualization Platform

## 📋 Table of Contents

1. [Overview](#overview)
2. [Current Architecture](#current-architecture)
3. [Core Features](#core-features)
4. [Technical Implementation](#technical-implementation)
5. [Data Flow](#data-flow)
6. [Recent Enhancements](#recent-enhancements)
7. [Future Features & Roadmap](#future-features--roadmap)
8. [Testing Strategy](#testing-strategy)
9. [Known Issues & Limitations](#known-issues--limitations)
10. [Development Guidelines](#development-guidelines)

---

## 🎯 Overview

A modern web application that combines DuckDB-WASM's powerful analytical capabilities with MapLibre GL's geospatial visualization features. The platform enables users to load, analyze, and visualize large geospatial datasets directly in the browser without requiring server-side processing.

### Key Technologies
- **Frontend**: React 18 + TypeScript
- **Database**: DuckDB-WASM with Spatial Extension
- **Maps**: MapLibre GL
- **Charts**: Vega-Lite
- **Build**: Vite
- **State Management**: Redux Toolkit
- **AI Integration**: Claude AI Assistant

---

## 🏗️ Current Architecture

### Component Hierarchy

```
App.tsx
├── RemoteFile.tsx        # Data loading interface
├── TableList.tsx         # Table & column selection
├── Map.tsx              # MapLibre visualization
├── AIAssistant.tsx      # Claude AI integration
└── VegaLiteChart.tsx    # Data charts
```

### Core Systems

#### 1. **DuckDB Integration** (`src/hooks/useDuckDB.ts`)
- Initializes DuckDB-WASM with manual bundles configuration
- Automatically loads spatial extension
- Provides singleton database instance
- Handles worker initialization (MVP/EH)

#### 2. **Vector Tile Protocol** (`src/components/Map.tsx`)
- Custom protocol handler: `duckdb-vector://`
- Real-time SQL to MVT conversion
- Tile caching for performance
- Automatic JSON property extraction

#### 3. **State Management** (`src/store/`)
- Redux slices for:
  - `mapSlice`: Selected table, columns, map settings
  - `aiSlice`: AI chat history and context
- DBStateManager for database operations

#### 4. **AI Integration** (`src/lib/ai/`)
- System prompt with platform-specific guidance
- Tool definitions for SQL, charts, and map styling
- Automatic style property correction

---

## 🚀 Core Features

### ✅ Currently Working Features

#### 1. **Data Loading & Management**
- ✅ **URL-based data import**: Load GeoJSON, CSV, Parquet, Shapefile from any public URL
- ✅ **Automatic table creation**: Uses ST_Read() for spatial data, direct import for tabular data
- ✅ **Multi-format support**: Handles various geospatial and tabular formats
- ✅ **Table listing**: Shows all loaded tables with row counts
- ✅ **Column selection**: Choose which columns to display on map popups
- ✅ **Properties column auto-selection**: JSON columns automatically selected

**Example Usage:**
```
URL: https://example.com/data.geojson
→ Creates table "data" with geometry and properties
→ Automatically selects 'properties' column if present
```

#### 2. **Map Visualization**
- ✅ **Real-time vector tiles**: SQL queries converted to MVT format on-the-fly
- ✅ **All geometry types**: Points, lines, polygons rendered correctly
- ✅ **Dynamic styling**: Change colors, sizes, opacity through style editor
- ✅ **JSON property extraction**: Nested JSON fields accessible for styling
- ✅ **Interactive popups**: Click features to see selected column data
- ✅ **Zoom-based queries**: Only loads data for current viewport
- ✅ **Tile caching**: Improves performance for repeated views

**Working Example:**
```json
// Style with extracted JSON property
{
  "circle-color": ["match", ["get", "都道府県名"], 
    "東京都", "#FF0000",
    "大阪府", "#00FF00",
    "#CCCCCC"
  ]
}
```

#### 3. **Data Analysis & Queries**
- ✅ **SQL query execution**: Run any DuckDB SQL through AI chat
- ✅ **Automatic table creation**: CREATE TABLE statements work seamlessly
- ✅ **Spatial queries**: Full DuckDB Spatial extension support
- ✅ **JSON extraction**: Use `properties->>'field'` syntax
- ✅ **Aggregations**: GROUP BY, COUNT, SUM, etc. all functional
- ✅ **Temporary tables**: Hidden from UI but accessible in queries

**Working Queries:**
```sql
-- Extract and count by prefecture
SELECT properties->>'都道府県名' as prefecture, COUNT(*) 
FROM uc16_01_uav_accident 
GROUP BY properties->>'都道府県名';

-- Create analysis table (hidden from UI)
CREATE TABLE temp_monthly_stats AS 
SELECT date_trunc('month', date_col) as month, COUNT(*) as incidents
FROM main_table GROUP BY month;
```

#### 4. **Charts & Visualization**
- ✅ **Vega-Lite integration**: Interactive charts from SQL data
- ✅ **Multiple chart types**: Bar, line, scatter, pie, heatmap
- ✅ **Interactive configuration**: Change chart settings in UI
- ✅ **Access to all tables**: Including temporary/hidden tables
- ✅ **Auto-retry for new tables**: Handles timing issues

**Working Chart Example:**
```javascript
// AI can generate charts like:
{
  chart_type: "bar",
  table: "prefecture_accidents",
  x_field: "prefecture",
  y_field: "count",
  title: "Accidents by Prefecture"
}
```

#### 5. **AI Assistant Capabilities**
- ✅ **Natural language SQL**: "Show me accidents by prefecture"
- ✅ **Chart generation**: "Create a bar chart of incidents over time"
- ✅ **Map styling**: "Color points by prefecture"
- ✅ **Data exploration**: "What columns are in this table?"
- ✅ **Complex analysis**: Multi-step analysis with temp tables
- ✅ **Style correction**: Automatically fixes incorrect property patterns

**Working AI Commands:**
- "Load data from [URL]"
- "Show me the first 10 rows"
- "Color the map points by [property]"
- "Create a line chart of incidents over time"
- "Which prefecture has the most accidents?"

#### 6. **UI/UX Features**
- ✅ **Responsive layout**: Works on desktop and tablet
- ✅ **Export functionality**: Download map as image
- ✅ **Style editor**: Full MapLibre style JSON editing
- ✅ **Table refresh**: Updates when new data is loaded
- ✅ **Error handling**: Clear error messages for failed operations
- ✅ **Loading states**: Visual feedback during operations

#### 7. **Performance Optimizations**
- ✅ **Tile caching**: Reduces redundant queries
- ✅ **Viewport filtering**: Only queries visible area
- ✅ **Efficient JSON parsing**: Handles large property objects
- ✅ **Worker-based DuckDB**: Non-blocking database operations
- ✅ **Debounced updates**: Prevents excessive re-rendering

### 🎯 Real-World Use Cases Working Today

1. **Incident Mapping**
   - Load UC Data
   - Color
   - Click for details
   - Chart by time/location

2. **Geospatial Analysis**
   - Import Shapefile boundaries
   - Join with CSV data
   - Visualize on map
   - Export results

3. **Data Exploration**
   - Load unknown dataset
   - AI explores structure
   - Generate visualizations
   - Create insights

4. **Custom Styling**
   - Load point data
   - Apply categorical colors
   - Add labels
   - Adjust sizes by attribute

---

## 🔧 Technical Implementation

### JSON Property Extraction

```typescript
// Automatic extraction when 'properties' column is selected
if (column === 'properties' && row[column]) {
    const jsonProps = JSON.parse(row[column]);
    Object.assign(properties, jsonProps);
}
```

### Style Property Reference Fixing

```typescript
// Fixes incorrect patterns like ["get", "properties", ["get", "fieldName"]]
// Converts to correct pattern: ["get", "fieldName"]
const fixPropertyReferences = (expr: unknown): unknown => {
    // Multiple pattern fixes implemented
};
```

### Temporary Table Filtering

```typescript
const isTemporaryTable = (name: string): boolean => {
    return name.startsWith('temp_') || 
           name.endsWith('_timeline') ||
           name.endsWith('_analysis');
};
```

---

## 📊 Data Flow

1. **Data Input** → User provides URL
2. **Table Creation** → DuckDB loads data via ST_Read() or direct import
3. **Schema Detection** → Columns and types identified
4. **UI Updates** → TableList shows available tables (filtered)
5. **Selection** → User selects table and columns
6. **Query Generation** → SQL with spatial filters for current viewport
7. **Vector Tiles** → DuckDB results converted to MVT format
8. **Rendering** → MapLibre displays styled features
9. **Interaction** → Click handlers show popup data

---

## 🆕 Recent Enhancements

### 1. **Generic JSON Property Support** (Latest)
- Works with any JSON column named 'properties'
- Automatic extraction for all geometry types
- No dataset-specific code

### 2. **AI Style Generation Fix**
- Updated system prompt for correct property access
- Prevents nested property reference patterns
- Clear examples in documentation

### 3. **Automatic Properties Selection**
- Pre-selects 'properties' column when available
- Ensures JSON data is accessible for styling
- Maintains user selection preferences

### 4. **Temporary Table Management**
- Hides analysis tables from UI
- Keeps them accessible for queries
- Reduces UI clutter

---

## 🔮 Future Features Improvements

### Phase 1: Performance & Scalability
- [ ] **Spatial Indexing**: Implement R-tree indexes for faster queries
- [ ] **Progressive Loading**: Stream large datasets
- [ ] **Web Workers**: Offload heavy computations
- [ ] **Query Optimization**: Automatic query plan analysis

### Phase 2: Advanced Visualization
- [ ] **3D Terrain Support**: Integrate MapLibre 3D capabilities
- [ ] **Time Animation**: Temporal data playback
- [ ] **Heatmaps**: Density visualization
- [ ] **Clustering**: Point clustering for large datasets
- [ ] **Custom Symbology**: Upload SVG/image markers

### Phase 3: Analysis Enhancement
- [ ] **Spatial Joins**: UI for geographic relationships
- [ ] **Buffer Analysis**: Distance-based operations
- [ ] **Routing**: Network analysis capabilities
- [ ] **Statistical Analysis**: Spatial statistics tools
- [ ] **ML Integration**: Spatial prediction models

### Phase 4: Collaboration Features
- [ ] **Save/Load Projects**: Persist analysis state
- [ ] **Share Maps**: Public URL generation
- [ ] **Export Options**: PNG, PDF, GeoPackage
- [ ] **Annotations**: Drawing tools
- [ ] **Comments**: Collaborative notes

### Phase 5: Data Sources
- [ ] **WMS/WFS Support**: OGC web services
- [ ] **Database Connections**: PostGIS, MySQL Spatial
- [ ] **Cloud Storage**: S3, Azure Blob, GCS
- [ ] **Real-time Feeds**: WebSocket data streams
- [ ] **API Integration**: REST/GraphQL endpoints

---

## 🧪 Testing Strategy

### Current Tests
- Unit tests for tile utilities
- Build verification
- ESLint code quality checks

### Needed Test Coverage

#### 1. **Component Tests**
```typescript
// Test JSON property extraction
test('extracts nested JSON properties', () => {
    const properties = extractProperties({
        properties: '{"name": "Tokyo", "population": 14000000}'
    });
    expect(properties.name).toBe("Tokyo");
});
```

#### 2. **Integration Tests**
- Data loading workflows
- Map interaction scenarios
- AI command processing
- Style application

#### 3. **Performance Tests**
- Large dataset handling (1M+ features)
- Tile generation speed
- Memory usage monitoring
- Query optimization validation

#### 4. **Browser Compatibility**
- Chrome/Edge (Chromium)
- Firefox
- Safari (with limitations)
- Mobile browsers

---

## ⚠️ Known Issues & Limitations

### Current Limitations
1. **SharedArrayBuffer Requirement**: Requires secure context (HTTPS)
2. **Browser Support**: Limited to modern browsers with WASM support
3. **Memory Constraints**: Large datasets limited by browser memory
4. **Safari Issues**: Potential WebGL performance issues

### Technical Debt
1. **useCallback Dependencies**: Some functions need memoization
2. **Error Boundaries**: Need comprehensive error handling
3. **Type Safety**: Some any types need proper typing
4. **Test Coverage**: Currently only 10 tests

---

## 📝 Development Guidelines

### Code Style Principles
1. **Generic Over Specific**: Avoid dataset-specific implementations
2. **Composition**: Break large functions into smaller units
3. **Type Safety**: Use TypeScript strictly
4. **Performance**: Consider tile caching and query optimization

### PR Checklist
- [ ] Run `npm run build && npm test`
- [ ] Update CLAUDE.md if adding new patterns
- [ ] Add tests for new features
- [ ] Document API changes
- [ ] Consider mobile responsiveness

### Debugging Tips
1. **Check Console**: Extensive logging for tile generation
2. **Redux DevTools**: Monitor state changes
3. **Network Tab**: Verify tile requests
4. **Click Handler**: Logs feature properties

---

## 🔗 Related Documentation

- [CLAUDE.md](./CLAUDE.md) - AI assistant guidance
- [README.md](./README.md) - Getting started guide
- [DuckDB Spatial Docs](https://duckdb.org/docs/extensions/spatial)
- [MapLibre Style Spec](https://maplibre.org/maplibre-style-spec/)

---
