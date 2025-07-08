import { MockLanguageModelV1 } from 'ai/test';
import { convertArrayToReadableStream } from 'ai/test';

// GIS-specific mock responses
export const GIS_MOCK_RESPONSES = {
  loadData: {
    patterns: [/load|import|upload|open/i, /geojson|parquet|csv/i],
    response: {
      text: "I'll help you load that data file into the system.",
      tool: {
        name: 'loadData',
        args: { 
          source: 'data.geojson', 
          type: 'geojson',
          tableName: 'imported_data'
        }
      },
      result: {
        success: true,
        message: 'Data loaded successfully',
        rowCount: 1000,
        columns: ['id', 'name', 'geometry', 'value']
      }
    }
  },
  
  spatialQuery: {
    patterns: [/spatial join|within|intersect|buffer|near/i],
    response: {
      text: "Let me perform that spatial analysis for you.",
      tool: {
        name: 'spatialJoin',
        args: { 
          leftTable: 'points',
          rightTable: 'polygons',
          predicate: 'within',
          joinType: 'inner'
        }
      },
      result: {
        success: true,
        rowCount: 42,
        message: 'Spatial join completed'
      }
    }
  },
  
  createMap: {
    patterns: [/map|choropleth|heatmap|visualize.*map/i],
    response: {
      text: "I'll create a map visualization for you.",
      tool: {
        name: 'createMap',
        args: { 
          table: 'data',
          type: 'choropleth',
          colorBy: 'value',
          colorScheme: 'Blues'
        }
      },
      result: {
        success: true,
        layerId: 'choropleth-layer-1',
        featureCount: 50
      }
    }
  },
  
  createChart: {
    patterns: [/chart|graph|plot|histogram|bar.*chart/i],
    response: {
      text: "I'll create a chart to visualize that data.",
      tool: {
        name: 'createChart',
        args: { 
          table: 'data',
          type: 'bar',
          x: 'category',
          y: 'count'
        }
      },
      result: {
        success: true,
        chartId: 'chart-1',
        dataPoints: 10
      }
    }
  },
  
  executeQuery: {
    patterns: [/select|query|sql|count|group by/i],
    response: {
      text: "Let me run that query for you.",
      tool: {
        name: 'executeQuery',
        args: { 
          sql: 'SELECT COUNT(*) as total FROM data',
          explain: false
        }
      },
      result: {
        success: true,
        data: [{ total: 1000 }],
        rowCount: 1,
        columns: ['total']
      }
    }
  }
};

// Helper to create mock stream responses
export function createMockStream(events: any[]) {
  return convertArrayToReadableStream(events);
}

// Create a GIS-aware mock model
export function createGISMockModel(options?: {
  delay?: number;
  errorRate?: number;
}) {
  const { delay = 0, errorRate = 0 } = options || {};

  return new MockLanguageModelV1({
    defaultObjectGenerationMode: 'tool',
    doStream: async (options) => {
      const messages = options.prompt;
      const lastMessageContent = messages[messages.length - 1].content;
      const lastMessage = typeof lastMessageContent === 'string' 
        ? lastMessageContent 
        : lastMessageContent.map((part: any) => part.text || '').join(' ');
      
      // Simulate errors randomly
      if (Math.random() < errorRate) {
        return {
          stream: createMockStream([
            { type: 'text', content: 'I encountered an error processing your request.' },
            { type: 'error', error: new Error('Simulated error for testing') }
          ]),
          rawCall: { rawPrompt: null, rawSettings: {} }
        };
      }
      
      // Find matching response pattern
      for (const [, config] of Object.entries(GIS_MOCK_RESPONSES)) {
        const matchesPattern = config.patterns.some(pattern => 
          pattern.test(lastMessage)
        );
        
        if (matchesPattern) {
          const events = [
            { type: 'text-delta', textDelta: config.response.text },
            { 
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: `call-${Date.now()}`,
              toolName: config.response.tool.name,
              args: config.response.tool.args
            },
            {
              type: 'tool-result',
              toolCallId: `call-${Date.now()}`,
              toolName: config.response.tool.name,
              result: config.response.result
            }
          ];
          
          // Add delay if specified
          if (delay > 0) {
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          return {
            stream: createMockStream(events),
            rawCall: { rawPrompt: null, rawSettings: {} }
          };
        }
      }
      
      // Default response
      return {
        stream: createMockStream([
          { 
            type: 'text-delta', 
            textDelta: 'How can I help you analyze your geospatial data?' 
          }
        ]),
        rawCall: { rawPrompt: null, rawSettings: {} }
      };
    }
  });
}

// Mock specific scenarios
export const mockScenarios = {
  // Successful data loading and visualization
  successfulWorkflow: () => createGISMockModel(),
  
  // Simulate slow responses
  slowResponses: () => createGISMockModel({ delay: 1000 }),
  
  // Simulate errors
  errorProne: () => createGISMockModel({ errorRate: 0.3 }),
  
  // Empty results
  emptyResults: () => new MockLanguageModelV1({
    doStream: async () => ({
      stream: createMockStream([
        { type: 'text-delta', textDelta: 'No results found for your query.' },
        { 
          type: 'tool-call',
          toolName: 'executeQuery',
          args: { sql: 'SELECT * FROM data WHERE 1=0' }
        },
        {
          type: 'tool-result',
          toolName: 'executeQuery',
          result: { success: true, data: [], rowCount: 0 }
        }
      ]),
      rawCall: { rawPrompt: null, rawSettings: {} }
    })
  })
};
