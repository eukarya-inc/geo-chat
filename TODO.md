# AI Chat-Based BI Tool for GIS Data - TODO

## Project Overview
Build an AI-powered BI tool that processes GIS data (GeoJSON, Parquet) using DuckDB, Claude AI, MapLibre GL for map visualizations, and ECharts for charts/plots. The system should allow users to interact with geospatial data through natural language queries.

## Core Technologies
- **Database**: DuckDB WASM for in-browser SQL processing
- **AI**: Claude (Anthropic) via AI SDK
- **Map Visualization**: MapLibre GL
- **Charts**: ECharts
- **Framework**: React with TypeScript
- **State Management**: Redux
- **Data Formats**: GeoJSON, Parquet (via Arrow)

## Architecture Design
- Redux-based state management with modular reducers
- Layer system for visualizations
- Component factory pattern for extensibility
- Arrow-first data pipeline
- SQL panel with query editor
- Plugin architecture

## TODO List

### Phase 1: Project Setup and Foundation ✅
- [x] Initialize project structure
  - [x] Create package.json with dependencies
  - [x] Setup TypeScript configuration
  - [x] Configure Vite for development
  - [x] Setup ESLint and Prettier
  - [x] Create basic folder structure
- [x] Setup Redux store
  - [x] Create store configuration
  - [x] Define initial state shape
  - [x] Setup Redux DevTools
- [x] Create basic layout components
  - [x] App shell with split view (chat + map)
  - [x] Basic routing structure (single-page app)

### Phase 2: DuckDB Integration ✅
- [x] Setup DuckDB WASM
  - [x] Initialize DuckDB instance
  - [x] Create connection management
  - [x] Implement file registration system
- [x] Create data ingestion pipeline
  - [x] GeoJSON loader
  - [x] Parquet loader (via Arrow)
  - [x] CSV loader
  - [x] URL-based data loading
  - [x] Auto-detect geometry columns
- [x] Build SQL interface
  - [x] Basic query executor
  - [x] Schema explorer (via DESCRIBE)
  - [x] Result formatter

### Phase 3: AI Chat Integration ✅
- [x] Setup Claude AI integration
  - [x] Configure AI SDK with Anthropic
  - [x] Create chat interface component
  - [x] Implement message history
  - [x] API key management with encryption
  - [x] Browser-based API access
  - [x] Collapsible chat panel
- [x] Create AI tools/functions
  - [x] SQL query tool (executeQuery)
  - [x] Data analysis tool (describeData)
  - [x] Visualization creation tool (createMap)
  - [ ] Map styling tool (advanced styling)
- [x] Implement natural language to SQL
  - [x] Context-aware query generation (via tools)
  - [x] Schema understanding (via describeData)
  - [x] Error handling and suggestions

### Phase 4: Map Visualization (MapLibre) ✅
- [x] Setup MapLibre GL
  - [x] Initialize map component
  - [x] Configure base map styles
  - [x] Setup map controls
- [x] Create layer system
  - [x] Point layer
  - [x] Polygon layer
  - [x] Line layer
  - [ ] Heatmap layer
  - [ ] Choropleth layer (using polygon layer for now)
- [x] Implement data-driven styling
  - [x] Color scales
  - [x] Size scales
  - [ ] Categorical styling (partial)
- [ ] Add interaction features
  - [ ] Tooltips
  - [ ] Click handlers
  - [ ] Feature selection
- [ ] Style Expression Support

### Phase 5: Chart Integration (ECharts)
- [ ] Setup ECharts
  - [ ] Create chart wrapper component
  - [ ] Configure responsive sizing
  - [ ] Theme configuration
- [ ] Implement chart types
  - [ ] Bar charts
  - [ ] Line charts
  - [ ] Pie charts
  - [ ] Scatter plots
  - [ ] Histograms
- [ ] Create chart generation from SQL results
  - [ ] Auto-detect chart type
  - [ ] Data transformation pipeline
  - [ ] Chart configuration builder

### Phase 6: Data Processing and Analysis
- [ ] Spatial analysis functions
  - [ ] Spatial joins
  - [ ] Buffer operations
  - [ ] Distance calculations
  - [ ] Aggregations by geometry
- [ ] Time series analysis
  - [ ] Temporal filtering
  - [ ] Time-based animations
  - [ ] Trend analysis
- [ ] Statistical operations
  - [ ] Descriptive statistics
  - [ ] Correlations
  - [ ] Clustering

### Phase 7: Advanced Features
- [ ] Multi-dataset support
  - [ ] Dataset management
  - [ ] Cross-dataset queries
  - [ ] Join operations
- [ ] Export capabilities
  - [ ] Export visualizations as images
  - [ ] Export data as CSV/GeoJSON
  - [ ] Export analysis reports
- [ ] Saved queries and visualizations
  - [ ] Query history
  - [ ] Bookmark system
  - [ ] Share functionality

### Phase 8: Performance Optimization
- [ ] Implement web workers for heavy processing
- [ ] Add data caching layer
- [ ] Optimize rendering for large datasets
- [ ] Implement progressive loading
- [ ] Add query optimization

### Phase 9: Testing and Documentation
- [ ] Unit tests for core functions
- [ ] Integration tests for data pipeline
- [ ] E2E tests for user workflows
- [ ] API documentation
- [ ] User guide
- [ ] Example datasets and queries

### Phase 10: Polish and Deploy
- [ ] Error handling and user feedback
- [ ] Loading states and progress indicators
- [ ] Accessibility improvements
- [ ] Mobile responsiveness
- [ ] Deployment configuration

## Key Design Decisions
1. **State Management**: Lighter Redux implementation
2. **Component Architecture**: Factory pattern for extensibility
3. **Data Pipeline**: Parquet-first approach
4. **AI Integration**: Tool-based implementation
5. **Styling System**: Styled-components (migrate to shadcn later)
6. **Testing Strategy**: Vitest for unit tests, Playwright for E2E
7. **Build System**: Vite with optimized configuration

## Success Criteria
- Users can load GeoJSON/Parquet files via drag-and-drop
- Natural language queries generate appropriate SQL and visualizations
- Map displays data with interactive features
- Charts appear inline in chat with proper context
- System handles datasets with millions of features
- AI provides meaningful insights about the data
- Export functionality works reliably

## Recent Updates (2025-07-09)

### Completed Features
1. **Map Visualization Implementation (Phase 4)**:
   - Integrated MapLibre GL JS with react-map-gl wrapper
   - Created modular layer system inspired by Kepler.gl
   - Implemented BaseLayer class with PointLayer, PolygonLayer, and LineLayer
   - Added LayerFactory for dynamic layer creation
   - Set up Redux integration for map state management
   - Created data loader utility to fetch data from DuckDB
   - Added visual channel system for data-driven styling
   - Implemented automatic layer creation when datasets are loaded (Kepler-inspired)
   - Added auto-zoom to layer bounds on first layer creation
   - Enhanced findDefaultLayers utility with smart layer type detection

2. **AI Tools Enhancement**:
   - Fixed slow describeData tool by optimizing queries
   - Implemented dataset context injection in system prompt (Kepler pattern)
   - Created createMap tool for generating map visualizations from queries
   - Enhanced message formatting with ReactMarkdown support
   - Added ToolResultDisplay component for better result presentation

3. **Documentation Reconciliation**:
   - Updated TODO_DETAILED.md to match TODO.md phase structure
   - Fixed phase numbering and naming inconsistencies

### Previous Updates (2025-07-08)
1. **Project Migration**: Switched from npm to yarn for package management
2. **Data Management UI**: 
   - Combined file upload and URL loading into a single unified interface
   - Added support for CSV, GeoJSON, and Parquet files
   - Implemented client-side fetching for URL-based data to avoid CORS issues
3. **Chat Panel Enhancements**:
   - Made chat panel collapsible to maximize map space
   - Added smooth transitions and responsive behavior
4. **DuckDB Integration**:
   - Fixed WASM loading issues with proper Vite configuration
   - Implemented spatial extension support
   - Added proper error handling for different file types
5. **Testing Infrastructure**:
   - Set up Vitest with proper TypeScript configuration
   - Added tests for critical components
   - Configured AI SDK mock provider for testing

### Current Focus
- Beginning Phase 5: Chart Integration with ECharts
- Adding map interaction features (tooltips, click handlers) later
- Improving data-driven styling with categorical scales

## Next Steps
1. Add map interaction features (tooltips, click handlers, feature selection)
2. Implement ECharts integration for statistical visualizations
3. Create heatmap and choropleth layer types
4. Add categorical styling support for data-driven maps
5. Create example workflows and documentation

