import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import React from 'react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { useDuckDB } from '../useDuckDB';
import duckdbReducer, { initializeDuckDB } from '../../store/slices/duckdbSlice';

// Mock DuckDB module
vi.mock('@duckdb/duckdb-wasm', () => ({
  AsyncDuckDB: vi.fn().mockImplementation(() => ({
    instantiate: vi.fn(),
    open: vi.fn(),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn(),
      close: vi.fn(),
      insertCSVFromPath: vi.fn(),
      insertJSONFromPath: vi.fn(),
    }),
    registerFileHandle: vi.fn(),
    registerFileURL: vi.fn(),
    dropFile: vi.fn(),
    close: vi.fn(),
  })),
  ConsoleLogger: vi.fn(),
  selectBundle: vi.fn().mockResolvedValue({
    mainModule: 'mock-module',
    mainWorker: 'mock-worker',
  }),
  DuckDBAccessMode: {
    READ_WRITE: 'READ_WRITE',
  },
}));

// Mock Worker
class MockWorker {
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}
global.Worker = MockWorker as any;

describe('useDuckDB', () => {
  let store: ReturnType<typeof configureStore>;

  beforeEach(() => {
    vi.clearAllMocks();
    store = configureStore({
      reducer: {
        duckdb: duckdbReducer,
      },
    });
  });

  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  it('should initialize with correct state', () => {
    const { result } = renderHook(() => useDuckDB(), { wrapper });

    expect(result.current.isInitialized).toBe(false);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.error).toBe(null);
  });

  it('should execute queries when DuckDB is initialized', async () => {
    const mockQuery = vi.fn().mockResolvedValue([{ count: 42 }]);
    const mockConnection = { query: mockQuery, close: vi.fn() };
    
    // Set up initialized state
    store.dispatch(initializeDuckDB.fulfilled(
      {
        db: {
          connect: vi.fn().mockResolvedValue(mockConnection),
        } as any,
        connection: mockConnection as any,
      },
      '',
      undefined
    ));

    const { result } = renderHook(() => useDuckDB(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    const queryResult = await result.current.executeQuery('SELECT COUNT(*) as count FROM test');
    
    expect(mockQuery).toHaveBeenCalledWith('SELECT COUNT(*) as count FROM test');
    expect(queryResult).toEqual([{ count: 42 }]);
  });

  it('should handle query errors gracefully', async () => {
    const mockError = new Error('Query failed');
    const mockQuery = vi.fn().mockRejectedValue(mockError);
    const mockConnection = { query: mockQuery, close: vi.fn() };
    
    store.dispatch(initializeDuckDB.fulfilled(
      {
        db: {
          connect: vi.fn().mockResolvedValue(mockConnection),
        } as any,
        connection: mockConnection as any,
      },
      '',
      undefined
    ));

    const { result } = renderHook(() => useDuckDB(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    await expect(
      result.current.executeQuery('INVALID SQL')
    ).rejects.toThrow('Query failed');
  });

  it('should register file handles', async () => {
    const mockRegisterFileHandle = vi.fn();
    const mockDB = {
      registerFileHandle: mockRegisterFileHandle,
      connect: vi.fn().mockResolvedValue({ query: vi.fn(), close: vi.fn() }),
    };
    
    store.dispatch(initializeDuckDB.fulfilled(
      {
        db: mockDB as any,
        connection: { query: vi.fn(), close: vi.fn() } as any,
      },
      '',
      undefined
    ));

    const { result } = renderHook(() => useDuckDB(), { wrapper });

    await waitFor(() => {
      expect(result.current.isInitialized).toBe(true);
    });

    const file = new File(['test'], 'test.csv', { type: 'text/csv' });
    await result.current.registerFileHandle('test.csv', file);

    expect(mockRegisterFileHandle).toHaveBeenCalledWith('test.csv', file);
  });
});