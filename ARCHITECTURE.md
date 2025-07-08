# GIS BI Chat Tool - Architecture Document

## Overview
This document outlines the architecture for our GIS BI Chat Tool that combines conversational AI with powerful geospatial analysis capabilities.

## Core Architecture Principles

### 1. **Blended Interaction Model**
- Primary chat interface for natural language queries
- Visual widgets for direct manipulation
- Map interactions for spatial selections
- Inline charts and visualizations in chat

### 2. **Agent-Based AI System**
Multiple specialized agents working together:

```typescript
interface AIAgentSystem {
  orchestrator: OrchestratorAgent;      // Routes requests to appropriate agents
  agents: {
    sql: SQLGenerationAgent;           // DuckDB SQL queries
    spatial: SpatialAnalysisAgent;     // Geospatial operations
    visualization: VizCreationAgent;   // Chart/map generation
    data: DataProcessingAgent;         // Cleaning, transformation
    explanation: ExplanationAgent;     // Explains results
  };
}
```

### 3. **Data Processing Pipeline**

```
User Input → File/URL
    ↓
Data Ingestion (GeoJSON, Parquet, CSV)
    ↓
DuckDB Registration
    ↓
Schema Analysis & Geometry Detection
    ↓
Spatial Indexing (if applicable)
    ↓
Ready for Queries
```

## System Components

### Frontend Architecture

```
src/
├── features/
│   ├── chat/
│   │   ├── components/
│   │   │   ├── ChatMessage.tsx
│   │   │   ├── ChatInput.tsx
│   │   │   ├── InlineChart.tsx      # ECharts in chat
│   │   │   └── InlineMap.tsx        # Mini maps in chat
│   │   ├── hooks/
│   │   │   └── useAIChat.ts
│   │   └── services/
│   │       └── aiService.ts
│   ├── map/
│   │   ├── components/
│   │   │   ├── MapView.tsx
│   │   │   ├── LayerControl.tsx
│   │   │   └── FeaturePopup.tsx
│   │   ├── layers/                   # Layer implementations
│   │   │   ├── PointLayer.ts
│   │   │   ├── PolygonLayer.ts
│   │   │   ├── HeatmapLayer.ts
│   │   │   └── ChoroplethLayer.ts
│   │   └── services/
│   │       └── mapService.ts
│   ├── data/
│   │   ├── components/
│   │   │   ├── DataUploader.tsx
│   │   │   ├── DatasetList.tsx
│   │   │   └── QueryEditor.tsx      # SQL editor
│   │   └── services/
│   │       ├── duckdbService.ts
│   │       └── fileService.ts
│   └── analysis/
│       ├── spatial/                  # Spatial analysis tools
│       ├── statistical/              # Stats functions
│       └── temporal/                 # Time-series analysis
```

### State Management (Redux)

```typescript
interface RootState {
  // Core
  duckdb: DuckDBState;
  chat: ChatState;
  map: MapState;
  
  // Data
  datasets: DatasetState;
  queries: QueryState;
  
  // Visualization
  layers: LayerState;
  charts: ChartState;
  
  // UI
  ui: UIState;
  
  // Analysis
  analysis: AnalysisState;
}
```

### AI Integration with Vercel AI SDK

```typescript
import { createAI, createStreamableUI } from 'ai/rsc';
import { CoreMessage, streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';

// Tool definitions using Vercel AI SDK
const tools = {
  // Data Operations
  loadData: {
    description: "Load GeoJSON or Parquet file into DuckDB",
    parameters: z.object({
      source: z.string(),
      tableName: z.string().optional(),
      type: z.enum(['geojson', 'parquet', 'csv'])
    }),
    execute: async (params) => {
      // Implementation
    }
  },
  
  // SQL Operations
  executeQuery: {
    description: "Execute SQL query on loaded data",
    parameters: z.object({
      sql: z.string(),
      explain: z.boolean().optional()
    }),
    execute: async (params) => {
      // Implementation
    }
  },
  
  // Spatial Analysis
  spatialJoin: {
    description: "Join two datasets based on spatial relationship",
    parameters: z.object({
      leftTable: z.string(),
      rightTable: z.string(),
      predicate: z.enum(['intersects', 'contains', 'within', 'touches']),
      joinType: z.enum(['inner', 'left', 'right'])
    }),
    execute: async (params) => {
      // Implementation
    }
  },
  
  // Visualization
  createMap: {
    description: "Create a map visualization",
    parameters: z.object({
      table: z.string(),
      type: z.enum(['points', 'polygons', 'choropleth', 'heatmap']),
      colorBy: z.string().optional(),
      sizeBy: z.string().optional()
    }),
    execute: async (params) => {
      // Implementation
    }
  }
};

// Using Vercel AI SDK for streaming responses
export async function chatWithAI(messages: CoreMessage[]) {
  const anthropic = createAnthropic({
    apiKey: process.env.ANTHROPIC_API_KEY
  });

  const result = await streamText({
    model: anthropic('claude-3-5-sonnet-20241022'),
    messages,
    tools,
    toolChoice: 'auto',
    system: 'You are a GIS analysis assistant...'
  });

  return result;
}
```

## Data Flow Architecture

### 1. File Upload Flow
```
User drops file → Frontend validation → Parse metadata
    ↓
Upload to browser memory → Register with DuckDB
    ↓
Auto-detect geometry columns → Create spatial index
    ↓
Notify Redux → Update UI → Ready for queries
```

### 2. Query Execution Flow
```
User asks question → AI determines intent
    ↓
AI generates SQL → Show SQL to user (editable)
    ↓
Execute in DuckDB → Process results
    ↓
AI determines viz type → Generate visualization
    ↓
Display in chat/map → Allow interactions
```

### 3. Visualization Flow
```
Query results → Analyze data type & structure
    ↓
Determine best viz → Configure layers/charts
    ↓
Render with MapLibre/ECharts → Add interactions
    ↓
Update Redux state → Enable export
```

## Performance Optimizations

### 1. **Data Handling**
- Use Arrow format internally for efficiency
- Implement data sampling for previews
- Progressive loading for large datasets
- Spatial indexing for geometry queries

### 2. **Rendering**
- WebGL-based map rendering
- Virtual scrolling for tables
- Lazy loading of chart data
- Debounced map updates

### 3. **Query Optimization**
- Query result caching
- Prepared statements for common patterns
- Incremental spatial indexing
- Background query execution

## Security Considerations

### 1. **API Keys**
- Encrypted storage in browser
- Never sent to external servers
- Optional environment variables

### 2. **Data Privacy**
- All processing in-browser
- No data leaves the client
- Optional local storage with encryption

### 3. **SQL Injection**
- Parameterized queries only
- Schema validation
- Read-only DuckDB access

## Extensibility

### 1. **Plugin System**
```typescript
interface Plugin {
  id: string;
  name: string;
  
  // Hook into various parts of the system
  tools?: AITool[];
  layers?: LayerType[];
  charts?: ChartType[];
  dataSources?: DataSource[];
  
  // UI extensions
  panels?: PanelComponent[];
  menuItems?: MenuItem[];
}
```

### 2. **Custom Layers**
Users can define custom layer types:
```typescript
class CustomLayer extends BaseLayer {
  render(data: any[], map: maplibregl.Map): void {
    // Custom rendering logic
  }
}
```

### 3. **Analysis Extensions**
Add new analysis functions:
```typescript
registerAnalysis({
  name: 'viewshed',
  description: 'Calculate viewshed from point',
  execute: async (params) => {
    // Custom analysis logic
  }
});
```

## Deployment Architecture

### Development
```
Vite Dev Server
    ↓
Hot Module Replacement
    ↓
Local DuckDB Instance
```

### Production
```
Static Files (CDN)
    ↓
Browser Loading
    ↓
DuckDB WASM Initialization
    ↓
Ready for Use
```

## Technology Stack Summary

- **Frontend**: React 18, TypeScript, Redux Toolkit
- **Styling**: CSS Modules + Styled Components
- **Maps**: MapLibre GL + deck.gl (future)
- **Charts**: ECharts
- **Database**: DuckDB WASM + Spatial Extension
- **AI**: Claude via Vercel AI SDK (@ai-sdk/anthropic)
- **Build**: Vite
- **Testing**: Vitest + React Testing Library + Vercel AI SDK Mock Provider

## Testing Strategy

We use Vercel AI SDK's Mock Provider for comprehensive AI testing:

```typescript
import { MockLanguageModelV1 } from 'ai/test';

// Create predictable mock responses for GIS operations
const mockModel = new MockLanguageModelV1({
  doStream: async ({ messages }) => {
    // Return appropriate tool calls based on user input
    if (messages[0].content.includes('spatial join')) {
      return mockSpatialJoinResponse();
    }
    // ... more patterns
  }
});
```

This approach enables:
- Fast, deterministic unit tests
- No API calls during testing
- Complete control over AI responses
- Testing of error scenarios
- Stream simulation for UX testing

See TESTING_STRATEGY.md for detailed testing patterns.

This architecture focuses on simplicity, performance, and extensibility while providing a powerful geospatial analysis platform.
