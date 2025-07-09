import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAIChatWithTools } from '../useAIChatWithTools';
import chatReducer from '@/store/slices/chatSlice';
import dataReducer from '@/store/slices/dataSlice';
import duckdbReducer from '@/store/slices/duckdbSlice';

// Mock the actual tools to test integration
vi.mock('@/lib/ai/tools', async () => {
  const actual = await vi.importActual('@/lib/ai/tools');
  return actual;
});

// Mock DuckDB hook with actual implementation behavior
const mockExecuteQuery = vi.fn();
const mockIsInitialized = { current: true };

vi.mock('@/hooks/useDuckDB', () => ({
  useDuckDB: () => ({
    executeQuery: mockExecuteQuery,
    isInitialized: mockIsInitialized.current,
  }),
}));

// Mock AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => 'mock-model'),
}));

describe('AI Tools Integration', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockIsInitialized.current = true;
    
    store = configureStore({
      reducer: {
        chat: chatReducer,
        data: dataReducer,
        duckdb: duckdbReducer,
      },
      preloadedState: {
        data: {
          datasets: [
            {
              id: '1',
              name: 'cities',
              type: 'geojson' as const,
              columns: [
                { name: 'city_name', type: 'VARCHAR' },
                { name: 'population', type: 'INTEGER' },
                { name: 'geom', type: 'GEOMETRY', isGeometry: true },
              ],
              rowCount: 50,
              source: 'file' as const,
            },
          ],
          activeDatasetId: '1',
          isLoading: false,
          error: null,
        },
      },
    });

    // Setup localStorage mock
    global.localStorage = {
      getItem: vi.fn().mockReturnValue('test-api-key'),
      setItem: vi.fn(),
      removeItem: vi.fn(),
      clear: vi.fn(),
      length: 0,
      key: vi.fn(),
    } as any;
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('should handle "What data is available?" question', async () => {
    const { streamText } = await import('ai');
    const mockStreamText = vi.mocked(streamText);

    // Mock DuckDB responses
    mockExecuteQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('information_schema.tables')) {
        return [{ table_name: 'cities' }];
      }
      if (sql.includes('DESCRIBE cities')) {
        return [
          { column_name: 'city_name', column_type: 'VARCHAR' },
          { column_name: 'population', column_type: 'INTEGER' },
          { column_name: 'geom', column_type: 'GEOMETRY' },
        ];
      }
      if (sql.includes('COUNT(*)')) {
        return [{ count: 50 }];
      }
      return [];
    });

    // Mock the AI response - the AI should now use context from system prompt
    mockStreamText.mockResolvedValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', textDelta: `You have the following data available:

**Cities Dataset** (Table: \`cities\`)
- 50 rows of city data
- Contains city names, population data, and geographic locations
- The geometry column allows for spatial analysis and mapping

This is a geospatial dataset that can be used for creating maps, analyzing city distributions, or performing spatial queries.` };
      })(),
      text: Promise.resolve(`You have the following data available:

**Cities Dataset** (Table: \`cities\`)
- 50 rows of city data
- Contains city names, population data, and geographic locations
- The geometry column allows for spatial analysis and mapping

This is a geospatial dataset that can be used for creating maps, analyzing city distributions, or performing spatial queries.`),
      toolResults: Promise.resolve([]),
    } as any);

    const { result } = renderHook(() => useAIChatWithTools(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('What data is available?');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Verify the user message was added
    expect(result.current.messages[0].role).toBe('user');
    expect(result.current.messages[0].content).toBe('What data is available?');

    // Verify the assistant response
    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toContain('Cities Dataset');
    expect(assistantMessage.content).toContain('cities');
    expect(assistantMessage.content).toContain('50 rows');
    expect(assistantMessage.content).toContain('geometry');

    // With the new approach, DuckDB shouldn't be called for basic "what data is available" questions
    // The AI uses the dataset context from the system prompt instead
    expect(mockExecuteQuery).not.toHaveBeenCalled();
  });

  it('should handle database not initialized state', async () => {
    mockIsInitialized.current = false;

    const { result } = renderHook(() => useAIChatWithTools(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('What data is available?');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Should get a message about database initialization
    expect(result.current.messages[1].content).toContain('database is still initializing');
  });
});
