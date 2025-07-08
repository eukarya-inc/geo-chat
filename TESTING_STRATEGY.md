# Testing Strategy for GIS BI Chat Tool

## Overview
This document outlines our testing approach, with a focus on using Vercel AI SDK's mock provider for AI-related unit tests.

## Testing Stack
- **Test Runner**: Vitest
- **React Testing**: React Testing Library
- **AI Mocking**: Vercel AI SDK Mock Provider
- **Database Mocking**: DuckDB in-memory instances
- **Map Testing**: MapLibre GL mock

## AI Testing with Vercel AI SDK Mock Provider

### Setup
```typescript
// test/setup.ts
import { MockLanguageModelV1 } from 'ai/test';
import { createAnthropic } from '@ai-sdk/anthropic';

export function setupMockAI() {
  const mockModel = new MockLanguageModelV1({
    defaultObjectGenerationMode: 'tool',
    doStream: async ({ prompt, messages }) => {
      // Define mock responses based on input
      return {
        stream: mockStreamResponse(messages),
        rawCall: { rawPrompt: null, rawSettings: {} }
      };
    }
  });

  return mockModel;
}
```

### Testing AI Chat Interactions
```typescript
// src/features/chat/hooks/useAIChat.test.ts
import { renderHook, act } from '@testing-library/react';
import { MockLanguageModelV1 } from 'ai/test';
import { useAIChat } from './useAIChat';

describe('useAIChat', () => {
  let mockModel: MockLanguageModelV1;

  beforeEach(() => {
    mockModel = new MockLanguageModelV1({
      defaultObjectGenerationMode: 'tool',
      doStream: async ({ messages }) => {
        // Mock response for GIS queries
        if (messages[messages.length - 1].content.includes('choropleth')) {
          return {
            stream: createMockStream([
              { type: 'text', content: 'I\'ll create a choropleth map for you.' },
              { 
                type: 'tool-call',
                toolName: 'createMap',
                args: {
                  table: 'regions',
                  type: 'choropleth',
                  colorBy: 'population'
                }
              }
            ])
          };
        }
        // Default response
        return {
          stream: createMockStream([
            { type: 'text', content: 'How can I help with your GIS analysis?' }
          ])
        };
      }
    });
  });

  it('should handle choropleth map creation', async () => {
    const { result } = renderHook(() => useAIChat({ model: mockModel }));

    await act(async () => {
      await result.current.sendMessage('Create a choropleth map of population by region');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[1].content).toContain('choropleth map');
    expect(result.current.lastToolCall).toEqual({
      toolName: 'createMap',
      args: {
        table: 'regions',
        type: 'choropleth',
        colorBy: 'population'
      }
    });
  });
});
```

### Testing AI Tools
```typescript
// src/lib/ai/tools/spatialAnalysis.test.ts
import { MockLanguageModelV1 } from 'ai/test';
import { spatialJoinTool } from './spatialAnalysis';

describe('Spatial Analysis Tools', () => {
  let mockDB: MockDuckDB;
  let mockModel: MockLanguageModelV1;

  beforeEach(() => {
    mockDB = createMockDuckDB();
    mockModel = new MockLanguageModelV1({
      defaultObjectGenerationMode: 'tool'
    });
  });

  describe('spatialJoinTool', () => {
    it('should perform spatial join correctly', async () => {
      // Setup mock data
      mockDB.registerTable('points', [
        { id: 1, name: 'Store A', geom: 'POINT(0 0)' },
        { id: 2, name: 'Store B', geom: 'POINT(1 1)' }
      ]);
      
      mockDB.registerTable('regions', [
        { id: 1, name: 'Downtown', geom: 'POLYGON((0 0, 0 2, 2 2, 2 0, 0 0))' }
      ]);

      // Execute tool
      const result = await spatialJoinTool.execute({
        leftTable: 'points',
        rightTable: 'regions',
        predicate: 'within',
        joinType: 'inner'
      }, { db: mockDB });

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).toMatchObject({
        point_name: 'Store A',
        region_name: 'Downtown'
      });
    });
  });
});
```

### Testing Streaming Responses
```typescript
// src/features/chat/services/aiService.test.ts
import { MockLanguageModelV1, mockId } from 'ai/test';
import { streamText } from 'ai';
import { aiService } from './aiService';

describe('AI Service', () => {
  it('should handle streaming responses', async () => {
    const mockModel = new MockLanguageModelV1({
      doStream: async () => ({
        stream: convertArrayToReadableStream([
          { type: 'text-delta', textDelta: 'Let me analyze ' },
          { type: 'text-delta', textDelta: 'your spatial data.' },
          { 
            type: 'tool-call',
            toolCallType: 'function',
            toolCallId: mockId(),
            toolName: 'executeQuery',
            args: { sql: 'SELECT COUNT(*) FROM points' }
          },
          {
            type: 'tool-result',
            toolCallId: mockId(),
            toolName: 'executeQuery',
            result: { count: 42 }
          },
          { type: 'text-delta', textDelta: '\n\nI found 42 points in your dataset.' }
        ])
      })
    });

    const messages = [];
    const stream = await aiService.chat('How many points are there?', { 
      model: mockModel,
      onChunk: (chunk) => messages.push(chunk)
    });

    await stream.complete();

    expect(messages).toContain('Let me analyze');
    expect(messages).toContain('42 points');
  });
});
```

## Testing Patterns

### 1. Mock Provider Configuration
```typescript
// test/mocks/aiMocks.ts
import { MockLanguageModelV1 } from 'ai/test';

export const GIS_MOCK_RESPONSES = {
  loadData: {
    pattern: /load|import|upload/i,
    response: {
      text: 'I\'ll help you load that data.',
      tool: {
        name: 'loadData',
        args: { source: 'data.geojson', type: 'geojson' }
      }
    }
  },
  
  spatialQuery: {
    pattern: /within|intersect|buffer/i,
    response: {
      text: 'Let me perform that spatial analysis.',
      tool: {
        name: 'spatialAnalysis',
        args: { operation: 'intersect', tables: ['a', 'b'] }
      }
    }
  },
  
  visualization: {
    pattern: /map|chart|visualize|show/i,
    response: {
      text: 'I\'ll create a visualization for you.',
      tool: {
        name: 'createVisualization',
        args: { type: 'choropleth', data: 'results' }
      }
    }
  }
};

export function createGISMockModel() {
  return new MockLanguageModelV1({
    doStream: async ({ messages }) => {
      const lastMessage = messages[messages.length - 1].content;
      
      // Find matching response pattern
      for (const [key, config] of Object.entries(GIS_MOCK_RESPONSES)) {
        if (config.pattern.test(lastMessage)) {
          return {
            stream: createMockStream([
              { type: 'text', content: config.response.text },
              { 
                type: 'tool-call',
                toolName: config.response.tool.name,
                args: config.response.tool.args
              }
            ])
          };
        }
      }
      
      // Default response
      return {
        stream: createMockStream([
          { type: 'text', content: 'How can I help with your GIS analysis?' }
        ])
      };
    }
  });
}
```

### 2. Integration Testing
```typescript
// src/features/chat/ChatPanel.test.tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Provider } from 'react-redux';
import { createGISMockModel } from '../../test/mocks/aiMocks';
import { ChatPanel } from './ChatPanel';
import { setupStore } from '../../test/utils';

describe('ChatPanel Integration', () => {
  it('should handle complete GIS workflow', async () => {
    const mockModel = createGISMockModel();
    const store = setupStore({ ai: { model: mockModel } });
    const user = userEvent.setup();

    render(
      <Provider store={store}>
        <ChatPanel />
      </Provider>
    );

    // User loads data
    const input = screen.getByPlaceholderText('Ask about your data...');
    await user.type(input, 'Load the accident data from accidents.geojson');
    await user.click(screen.getByText('Send'));

    // Verify AI response
    await waitFor(() => {
      expect(screen.getByText(/I'll help you load that data/)).toBeInTheDocument();
    });

    // User requests visualization
    await user.clear(input);
    await user.type(input, 'Show me a heatmap of accident locations');
    await user.click(screen.getByText('Send'));

    // Verify visualization created
    await waitFor(() => {
      expect(screen.getByText(/I'll create a visualization/)).toBeInTheDocument();
      expect(screen.getByTestId('inline-map')).toBeInTheDocument();
    });
  });
});
```

### 3. Error Handling Tests
```typescript
// src/lib/ai/errorHandling.test.ts
describe('AI Error Handling', () => {
  it('should handle tool execution failures gracefully', async () => {
    const mockModel = new MockLanguageModelV1({
      doStream: async () => ({
        stream: createMockStream([
          { type: 'text', content: 'Let me query your data.' },
          { 
            type: 'tool-call',
            toolName: 'executeQuery',
            args: { sql: 'SELECT * FROM nonexistent_table' }
          },
          {
            type: 'tool-result',
            toolName: 'executeQuery',
            result: { 
              error: 'Table nonexistent_table does not exist' 
            }
          },
          { 
            type: 'text', 
            content: '\n\nI encountered an error: The table doesn\'t exist. Would you like me to show you available tables?' 
          }
        ])
      })
    });

    const result = await processAIResponse('Show data from my_table', { model: mockModel });
    
    expect(result.error).toBeTruthy();
    expect(result.suggestion).toContain('available tables');
  });
});
```

## Test Structure

```
test/
├── setup.ts                 # Global test setup
├── mocks/
│   ├── aiMocks.ts          # AI mock providers
│   ├── duckdbMocks.ts      # DuckDB mocks
│   └── mapMocks.ts         # MapLibre mocks
├── utils/
│   ├── testHelpers.ts      # Common test utilities
│   └── storeHelpers.ts     # Redux store setup
└── fixtures/
    ├── sampleData.ts       # Test data
    └── responses.ts        # Mock AI responses
```

## Best Practices

### 1. Mock Response Patterns
- Create reusable mock response patterns for common GIS operations
- Use regex patterns to match user intent
- Return consistent tool calls for predictable testing

### 2. Streaming Simulation
- Test both successful and failed tool executions
- Simulate realistic typing delays for better UX testing
- Test partial responses and interruptions

### 3. State Management
- Always test with a fresh Redux store
- Use store snapshots for complex state assertions
- Test state updates from AI responses

### 4. Performance Testing
```typescript
describe('Performance', () => {
  it('should handle large datasets efficiently', async () => {
    const mockModel = createGISMockModel();
    const largeDataset = generatePoints(100000);
    
    const start = performance.now();
    await processWithAI('Create a heatmap', { 
      model: mockModel,
      data: largeDataset 
    });
    const end = performance.now();
    
    expect(end - start).toBeLessThan(1000); // Should complete in < 1s
  });
});
```

## CI/CD Integration

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: yarn install --frozen-lockfile
      - run: yarn test
      - run: yarn test:coverage
      - uses: codecov/codecov-action@v3
```

## Coverage Goals
- Overall: 80%
- AI Tools: 90% (critical path)
- UI Components: 70%
- Utils: 85%

This testing strategy ensures reliable AI interactions while maintaining fast test execution through effective mocking.
