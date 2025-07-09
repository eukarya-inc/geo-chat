# GIS BI Chat Tool - Detailed Implementation Plan

This is our detailed implementation plan for the GIS BI Chat Tool.

## Recent Updates (2025-07-09)

### Completed Features
1. **Map Visualization (Phase 2)** 🚧
   - Integrated MapLibre GL JS with react-map-gl
   - Created modular layer system with BaseLayer architecture
   - Implemented PointLayer, PolygonLayer, and LineLayer
   - Added visual channel system for data-driven styling
   - Set up Redux integration for map state
   - Created data loader to fetch from DuckDB

2. **AI Tools Enhancement** ✅
   - Fixed slow describeData performance
   - Implemented Kepler-style dataset context injection
   - Created createMap tool for map generation
   - Enhanced message formatting with ReactMarkdown
   - Added ToolResultDisplay component

3. **Documentation** ✅
   - Reconciled TODO.md and TODO_DETAILED.md
   - Fixed phase numbering and naming
   - Updated progress tracking

### Previous Updates (2025-07-08)
1. **DuckDB Integration** ✅
   - Full WASM setup with spatial extension
   - File registration for CSV, GeoJSON, Parquet
   - URL-based data loading with client-side fetch
   - Proper error handling for different file types

2. **UI/UX Improvements** ✅
   - Unified data upload interface (file + URL in one view)
   - Collapsible chat panel for more map space
   - Smooth transitions and responsive design
   - DuckDB status indicator (bottom center, transparent)

3. **Development Infrastructure** ✅
   - Migrated from npm to yarn
   - Fixed TypeScript configurations
   - Set up Vitest for testing
   - Added comprehensive error handling

### Current Status
- Phase 1 (Foundation & Core Chat): ✅ Complete
- Phase 2 (Map Visualization): 🚧 In Progress (80% complete)
- Phase 3 (Chart Integration): Not started
- Phase 4 (Data Processing): Not started

### Next Priority
- Complete map interaction features (tooltips, click handlers)
- Implement ECharts for statistical visualizations
- Add heatmap and choropleth layer types
- Improve categorical data styling

## Phase 1: Foundation & Core Chat

### 1.1 Complete DuckDB Integration ✅
- [x] Basic DuckDB initialization with spatial extension
- [x] Connection management (single persistent connection)
- [x] File registration system
  ```typescript
  // Implemented in useDuckDB hook
  registerFileHandle(fileName: string, file: File): Promise<void>
  ```
- [x] Support for:
  - [x] GeoJSON files (manual table creation)
  - [x] Parquet files (via read_parquet)
  - [x] CSV files (via read_csv_auto)
  - [x] URL-based loading (client-side fetch)
- [x] Geometry type detection (checks for 'geom', 'geometry' columns)
- [ ] Automatic spatial indexing
- [x] Dataset metadata extraction (row count, columns)

### 1.2 AI Chat with Claude 🚧
- [x] Basic AI integration with Vercel AI SDK
- [x] Chat interface with message history
- [x] API key management with browser encryption
- [x] Collapsible chat panel
- [x] Loading states and message streaming
- [ ] Implement AI service with tool calling
  ```typescript
  interface AIService {
    chat(message: string, context: ChatContext): Promise<AIResponse>;
    tools: Map<string, AITool>;
  }
  ```
- [ ] Create base AI tools:
  - [ ] `loadData` - Load files into DuckDB
  - [ ] `executeSQL` - Run SQL queries
  - [ ] `describeData` - Get data summary
  - [ ] `suggestVisualization` - Recommend viz type
- [x] Context management (conversation history via useChat hook)

### 1.3 File Upload System ✅
- [x] Drag-and-drop component (unified with URL input)
- [x] File type detection and validation
- [x] Loading states for file processing
- [x] Metadata extraction (row count, columns, geometry type)
- [x] Dataset list showing loaded files
- [x] Support for CSV, GeoJSON, and Parquet
- [ ] Progress indicators for large files (using loading state currently)
- [ ] Preview of the Dataset

## Phase 2: Map Visualization (MapLibre) ✅

### 2.1 Setup MapLibre GL ✅
- [x] Initialize map component
  - [x] Create MapView component with MapLibre GL JS
  - [x] Configure CORS headers for map tiles
  - [x] Set up map container with proper sizing
- [x] Configure base map styles
  - [x] Add OpenStreetMap or other free tile sources
  - [x] Create light/dark theme options
  - [x] Configure initial viewport (center, zoom)
- [x] Setup map controls
  - [x] Navigation controls (zoom in/out, compass)
  - [x] Scale bar
  - [x] Attribution

### 2.2 Create Layer System ✅
```typescript
interface Layer {
  id: string;
  type: 'point' | 'polygon' | 'line' | 'heatmap' | 'choropleth';
  source: string;
  datasetId: string;
  paint: Record<string, any>;
  layout: Record<string, any>;
  visible: boolean;
}
```
- [x] Point layer
  - [x] Basic markers
  - [ ] Clustering support
  - [ ] Custom icons
- [x] Polygon layer
  - [x] Fill and outline styling
  - [x] Transparency control
- [x] Line layer
  - [x] Variable width based on data
  - [ ] Dashed lines support
- [ ] Heatmap layer
  - [ ] Density-based visualization
  - [ ] Radius and intensity controls
- [ ] Choropleth layer
  - [ ] Data-driven polygon colors
  - [ ] Classification methods

### 2.3 Implement Data-Driven Styling 🚧
- [x] Color scales
  - [x] Sequential (Blues, Greens, Reds)
  - [ ] Diverging (RdBu, RdYlGn)
  - [ ] Categorical (Set1, Set2)
  - [ ] Custom color palettes
- [x] Size scales
  - [x] Linear scaling
  - [ ] Square root scaling
  - [ ] Quantile scaling
- [ ] Categorical styling
  - [ ] Unique values
  - [ ] Pattern matching

### 2.4 Add Interaction Features
- [ ] Tooltips
  - [ ] Hover tooltips with feature properties
  - [ ] Customizable tooltip templates
- [ ] Click handlers
  - [ ] Feature selection
  - [ ] Show detailed info panel
- [ ] Feature selection
  - [ ] Highlight selected features
  - [ ] Multi-select support

### 2.5 Style Expression Support
- [ ] MapLibre style expressions
- [ ] Data-driven property functions
- [ ] Zoom-based styling

## Phase 3: Chart Integration (ECharts)

### 3.1 Setup ECharts
- [ ] Create chart wrapper component
  - [ ] React component with proper lifecycle management
  - [ ] Handle chart disposal on unmount
  - [ ] Implement resize observer for responsive charts
- [ ] Configure responsive sizing
  - [ ] Auto-resize with container
  - [ ] Maintain aspect ratios
  - [ ] Handle chat panel width changes
- [ ] Theme configuration
  - [ ] Light/dark theme support
  - [ ] Consistent colors with map visualization
  - [ ] Custom theme based on app design

### 3.2 Implement Chart Types
- [ ] Bar charts
  - [ ] Vertical and horizontal bars
  - [ ] Grouped and stacked options
  - [ ] Data labels and animations
- [ ] Line charts
  - [ ] Multiple series support
  - [ ] Area charts option
  - [ ] Smooth curves vs straight lines
- [ ] Pie charts
  - [ ] Donut chart variant
  - [ ] Label positioning
  - [ ] Interactive legends
- [ ] Scatter plots
  - [ ] Size and color mapping
  - [ ] Regression lines
  - [ ] Bubble chart variant
- [ ] Histograms
  - [ ] Automatic binning
  - [ ] Custom bin sizes
  - [ ] Distribution curves

### 3.3 Create Chart Generation from SQL Results
- [ ] Auto-detect chart type
  - [ ] Analyze query structure and data types
  - [ ] Suggest appropriate visualizations
  - [ ] Handle temporal data specially
- [ ] Data transformation pipeline
  - [ ] Convert SQL results to ECharts format
  - [ ] Handle null values
  - [ ] Aggregate data when needed
- [ ] Chart configuration builder
  - [ ] Dynamic axis configuration
  - [ ] Automatic scale detection
  - [ ] Legend and tooltip setup

### 3.4 Inline Charts in Chat
- [ ] Chart rendering in messages
  - [ ] Embed charts in AI responses
  - [ ] Proper sizing within chat bubbles
  - [ ] Loading states
- [ ] Interactive features
  - [ ] Zoom and pan
  - [ ] Data point hover
  - [ ] Click interactions
- [ ] Export functionality
  - [ ] Download as PNG/SVG
  - [ ] Copy chart data
  - [ ] Share chart config

## Phase 4: Data Processing and Analysis

### 4.1 Spatial Analysis Functions
- [ ] Spatial joins
  - [ ] Point in polygon
  - [ ] Polygon intersections
  - [ ] Nearest neighbor joins
- [ ] Buffer operations
  - [ ] Fixed distance buffers
  - [ ] Variable buffers
  - [ ] Multi-ring buffers
- [ ] Distance calculations
  - [ ] Point-to-point distances
  - [ ] Point-to-line distances
  - [ ] Geodesic calculations
- [ ] Aggregations by geometry
  - [ ] Count points in polygons
  - [ ] Sum/average by area
  - [ ] Spatial grouping

### 4.2 Time Series Analysis
- [ ] Temporal filtering
  - [ ] Date range selection
  - [ ] Time-based queries
  - [ ] Relative time filters
- [ ] Time-based animations
  - [ ] Animated map layers
  - [ ] Playback controls
  - [ ] Speed adjustment
- [ ] Trend analysis
  - [ ] Moving averages
  - [ ] Seasonal decomposition
  - [ ] Growth rates

### 4.3 Statistical Operations
- [ ] Descriptive statistics
  - [ ] Mean, median, mode
  - [ ] Standard deviation
  - [ ] Percentiles and quartiles
- [ ] Correlations
  - [ ] Pearson correlation
  - [ ] Spatial autocorrelation
  - [ ] Cross-correlations
- [ ] Clustering
  - [ ] K-means clustering
  - [ ] DBSCAN for spatial data
  - [ ] Hierarchical clustering

## Phase 5: Advanced Features

### 5.1 Multi-Agent System
- [ ] Implement specialized agents:
  ```typescript
  interface Agents {
    orchestrator: Agent;     // Routes to other agents
    sql: SQLAgent;          // SQL generation
    spatial: SpatialAgent;  // GIS operations
    viz: VizAgent;          // Visualization creation
    explain: ExplainAgent;  // Result explanation
  }
  ```
- [ ] Agent communication protocol
- [ ] Context sharing between agents
- [ ] Error recovery and retry logic

### 4.2 Advanced Visualizations
- [ ] Heatmap layer with customization
- [ ] Hexbin aggregation
- [ ] Flow maps (origin-destination)
- [ ] 3D extrusion for polygons
- [ ] Cluster visualization

### 4.3 Query Builder UI
- [ ] Visual query builder
- [ ] Drag-drop column selection
- [ ] Filter UI components
- [ ] Join visualization
- [ ] Query history

## Phase 5: Polish & Performance

### 5.1 Performance Optimizations
- [ ] Implement data sampling for large datasets
- [ ] Query result caching
- [ ] Progressive data loading
- [ ] WebWorker for heavy computations
- [ ] Virtual scrolling for tables

### 5.2 Export Capabilities
- [ ] Export formats:
  - [ ] GeoJSON with styles
  - [ ] CSV with WKT geometries
  - [ ] PNG/SVG for maps
  - [ ] Interactive HTML
  - [ ] Python/R code generation
- [ ] Batch export functionality
- [ ] Style preservation

### 5.3 User Experience
- [ ] Undo/redo functionality
- [ ] Keyboard shortcuts
- [ ] Help system with examples
- [ ] Error messages with solutions
- [ ] Loading skeletons

## Phase 6: Advanced Integration

### 6.1 Data Connectors
- [x] URL data loading (implemented with client-side fetch)
- [ ] API connectors (Overture Maps, OSM)
- [ ] Database connections (PostGIS)
- [ ] Cloud storage (S3, Azure)
- [ ] Real-time data streams

### 6.2 ML Integration
- [ ] Clustering algorithms
- [ ] Hotspot detection
- [ ] Trend analysis
- [ ] Predictive modeling
- [ ] Anomaly detection

### 6.3 Collaboration Features
- [ ] Shareable links
- [ ] Export conversation history
- [ ] Annotation system
- [ ] Version control for analyses
- [ ] Team workspaces

## Technical Implementation Details

### State Management Structure
```typescript
interface AppState {
  visState: {
    layers: Layer[];
    datasets: Dataset[];
    filters: Filter[];
    interactions: Interaction[];
  };
  mapState: {
    viewport: Viewport;
    mapStyle: MapStyle;
  };
  uiState: {
    activeTool: string;
    modals: Modal[];
    panels: Panel[];
  };
  chatState: {
    messages: Message[];
    context: Context;
    activeAgents: Agent[];
  };
}
```

### Tool Implementation Pattern
```typescript
abstract class BaseTool implements AITool {
  abstract name: string;
  abstract description: string;
  abstract parameters: z.ZodSchema;
  
  async execute(params: any, context: ToolContext): Promise<ToolResult> {
    // Validate parameters
    const validated = this.parameters.parse(params);
    
    // Execute tool logic
    const result = await this.run(validated, context);
    
    // Format response
    return this.formatResult(result);
  }
  
  abstract run(params: any, context: ToolContext): Promise<any>;
  abstract formatResult(result: any): ToolResult;
}
```

### Performance Targets
- Initial load: < 3 seconds
- File processing: 100MB in < 5 seconds
- Query execution: < 1 second for most queries
- Map rendering: 60 FPS with 100k points
- Chat response: < 2 seconds for first token

## Success Metrics
1. **Usability**: Users can go from file to insight in < 5 interactions
2. **Performance**: Handle 1M point datasets smoothly
3. **Accuracy**: AI generates correct SQL 90%+ of the time
4. **Adoption**: Positive feedback from target user groups
5. **Extensibility**: Community plugins within 6 months

## Risk Mitigation
1. **Large Data**: Implement progressive loading and sampling
2. **AI Hallucination**: Show generated SQL for verification
3. **Browser Limits**: Use streaming and chunking
4. **Complex Queries**: Provide query templates
5. **Learning Curve**: Interactive tutorials

This detailed plan incorporates the best practices from the analyzed tools while maintaining focus on our unique conversational interface approach.

## Recent Updates (2025-07-09)

### Phase 2 (Map Visualization) Completion
1. **Auto-layer Creation (Kepler-inspired)**
   - Automatically creates appropriate layers when datasets are loaded
   - Smart layer type detection based on geometry and dataset characteristics
   - Supports lat/lng field pair detection for CSV files
   - Auto-zoom to layer bounds on first layer creation

2. **Enhanced Layer System**
   - BaseLayer abstract class with consistent interface
   - PointLayer, PolygonLayer, LineLayer implementations
   - LayerFactory for dynamic layer creation
   - Visual channels system for data-driven styling

3. **Map-Redux Integration**
   - Viewport state management
   - Layer configuration in Redux
   - Automatic data loading from DuckDB
