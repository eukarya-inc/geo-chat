import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useAIChatWithTools } from '../useAIChatWithTools';
import chatReducer from '@/store/slices/chatSlice';
import dataReducer from '@/store/slices/dataSlice';
import duckdbReducer from '@/store/slices/duckdbSlice';

// Mock the AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(),
}));

// Mock Anthropic
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => () => 'mock-model'),
}));

// Mock DuckDB hook
const mockExecuteQuery = vi.fn();
vi.mock('@/hooks/useDuckDB', () => ({
  useDuckDB: () => ({
    executeQuery: mockExecuteQuery,
    isInitialized: true,
  }),
}));

// Mock tools
const mockDescribeDataExecute = vi.fn();
const mockExecuteQueryExecute = vi.fn();

vi.mock('@/lib/ai/tools', () => ({
  getAITools: vi.fn((context: any) => {
    // Store context for later verification
    mockDescribeDataExecute.mockImplementation(async () => {
      const tables = await context.duckdb.getTableNames();
      return { tables, datasetCount: context.state.datasets.length };
    });
    
    mockExecuteQueryExecute.mockImplementation(async (params: any) => {
      const results = await context.duckdb.executeQuery(params.sql);
      return { results, rowCount: results.length };
    });
    
    return {
      describeData: {
        description: 'Get information about available data',
        parameters: {},
        execute: mockDescribeDataExecute,
      },
      executeQuery: {
        description: 'Execute SQL query',
        parameters: {},
        execute: mockExecuteQueryExecute,
      },
    };
  }),
}));

describe('useAIChatWithTools', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockDescribeDataExecute.mockClear();
    mockExecuteQueryExecute.mockClear();
    
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
              name: 'test_table',
              type: 'geojson' as const,
              columns: [
                { name: 'id', type: 'INTEGER' },
                { name: 'geom', type: 'GEOMETRY', isGeometry: true },
              ],
              rowCount: 100,
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

  it('should pass dataset context to system prompt', async () => {
    const { streamText } = await import('ai');
    const mockStreamText = vi.mocked(streamText);
    
    // Setup mock response - AI uses context instead of tools
    mockStreamText.mockResolvedValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', textDelta: 'You have test data available with geometry information.' };
      })(),
      text: Promise.resolve('You have test data available with geometry information.'),
      toolResults: Promise.resolve([]),
    } as any);

    const { result } = renderHook(() => useAIChatWithTools(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('What data is available?');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Verify that streamText was called with system prompt containing dataset context
    expect(mockStreamText).toHaveBeenCalled();
    const streamTextCall = mockStreamText.mock.calls[0][0];
    expect(streamTextCall.system).toContain('test_table');
    expect(streamTextCall.system).toContain('GeoJSON');
    expect(streamTextCall.system).toContain('The following datasets are loaded and available for analysis:');
    
    // Verify message was added
    const assistantMessage = result.current.messages[1];
    expect(assistantMessage.role).toBe('assistant');
    expect(assistantMessage.content).toContain('test data available');
  });

  it('should handle tool execution errors gracefully', async () => {
    const { streamText } = await import('ai');
    const mockStreamText = vi.mocked(streamText);
    
    // Mock DuckDB error
    mockExecuteQuery.mockRejectedValue(new Error('Database not initialized'));

    mockStreamText.mockResolvedValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', textDelta: 'Let me check...' };
        yield { type: 'tool-call', toolName: 'describeData', args: {} };
      })(),
      text: Promise.resolve('I encountered an error accessing the database.'),
      toolResults: Promise.resolve([]),
    } as any);

    const { result } = renderHook(() => useAIChatWithTools(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Show me the data');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Should still add a message even if tool fails
    expect(result.current.messages[1].content).toBeTruthy();
  });

  it('should pass tool results to onToolCall callback', async () => {
    const { streamText } = await import('ai');
    const mockStreamText = vi.mocked(streamText);
    const onToolCall = vi.fn();
    
    mockStreamText.mockResolvedValue({
      fullStream: (async function* () {
        yield { type: 'tool-call', toolName: 'executeQuery', args: { sql: 'SELECT 1' } };
      })(),
      text: Promise.resolve('Query executed successfully.'),
      toolResults: Promise.resolve([{ results: [{ '1': 1 }], rowCount: 1 }]),
    } as any);

    mockExecuteQuery.mockResolvedValue([{ '1': 1 }]);

    const { result } = renderHook(() => useAIChatWithTools(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Run SELECT 1', { onToolCall });
    });

    await waitFor(() => {
      expect(onToolCall).toHaveBeenCalled();
    });

    expect(onToolCall).toHaveBeenCalledWith(
      'executeQuery',
      { sql: 'SELECT 1' },
      { results: [{ '1': 1 }], rowCount: 1 }
    );
  });

  it('should handle messages without tools', async () => {
    const { streamText } = await import('ai');
    const mockStreamText = vi.mocked(streamText);
    
    mockStreamText.mockResolvedValue({
      fullStream: (async function* () {
        yield { type: 'text-delta', textDelta: 'Hello! How can I help you?' };
      })(),
      text: Promise.resolve('Hello! How can I help you?'),
      toolResults: Promise.resolve([]),
    } as any);

    const { result } = renderHook(() => useAIChatWithTools(), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Hi');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    expect(result.current.messages[1].content).toBe('Hello! How can I help you?');
    expect(result.current.messages[1].toolCalls).toBeUndefined();
  });
});
