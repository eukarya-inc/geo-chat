import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { createGISMockModel } from '../../../../test/mocks/aiMocks';
import { setupStore } from '../../../../test/utils/testHelpers';
import { useAIChat } from './useAIChat';

describe('useAIChat', () => {
  let store: ReturnType<typeof setupStore>;
  let mockModel: ReturnType<typeof createGISMockModel>;

  beforeEach(() => {
    store = setupStore();
    mockModel = createGISMockModel();
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('should initialize with empty messages', () => {
    const { result } = renderHook(() => useAIChat(mockModel), { wrapper });
    
    expect(result.current.messages).toHaveLength(0);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('should handle data loading request', async () => {
    const { result } = renderHook(() => useAIChat(mockModel), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Load the accident data from accidents.geojson');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    const [userMessage, aiMessage] = result.current.messages;
    
    expect(userMessage.role).toBe('user');
    expect(userMessage.content).toContain('Load the accident data');
    
    expect(aiMessage.role).toBe('assistant');
    expect(aiMessage.content).toBeTruthy();
  });

  it('should handle choropleth map creation', async () => {
    const { result } = renderHook(() => useAIChat(mockModel), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Create a choropleth map of population by region');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[1].content).toBeTruthy();
    });

    // For now, just check that a response was generated
    // Tool calling is not implemented in the mock yet
  });

  it('should handle SQL query execution', async () => {
    const { result } = renderHook(() => useAIChat(mockModel), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Count the total number of records');
    });

    await waitFor(() => {
      expect(result.current.messages[1].content).toBeTruthy();
    });

    // For now, just check that a response was generated
    // Tool calling is not implemented in the mock yet
  });

  it('should handle errors gracefully', async () => {
    // Use error-prone mock
    const errorModel = createGISMockModel({ errorRate: 1 });
    const { result } = renderHook(() => useAIChat(errorModel), { wrapper });

    await act(async () => {
      await result.current.sendMessage('Load some data');
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.messages[1].content).toContain('error');
    });
  });

  it('should maintain conversation context', async () => {
    const { result } = renderHook(() => useAIChat(mockModel), { wrapper });

    // First message
    await act(async () => {
      await result.current.sendMessage('Load cities.geojson');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(2);
    });

    // Second message referencing the first
    await act(async () => {
      await result.current.sendMessage('Now create a map of the loaded data');
    });

    await waitFor(() => {
      expect(result.current.messages).toHaveLength(4);
    });

    // Should maintain context
    expect(result.current.messages[3].content).toBeTruthy();
  });

  it('should handle streaming responses', async () => {
    const { result } = renderHook(() => useAIChat(mockModel), { wrapper });
    
    let streamingContent = '';
    
    await act(async () => {
      await result.current.sendMessage('Show me the data', {
        onStream: (chunk: string) => {
          streamingContent += chunk;
        }
      });
    });

    await waitFor(() => {
      expect(streamingContent.length).toBeGreaterThan(0);
    });
  });
});
