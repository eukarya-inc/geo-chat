import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import '@testing-library/jest-dom';
import DataPanel from '../DataPanel';
import duckdbReducer from '../../store/slices/duckdbSlice';
import dataReducer from '../../store/slices/dataSlice';
import chatReducer from '../../store/slices/chatSlice';
import mapReducer from '../../store/slices/mapSlice';
import type { RootState } from '../../store';

// Mock the useDuckDB hook
const mockExecuteQuery = vi.fn();
const mockRegisterFileHandle = vi.fn();

vi.mock('../../hooks/useDuckDB', () => ({
  useDuckDB: () => ({
    isInitialized: true,
    executeQuery: mockExecuteQuery,
    registerFileHandle: mockRegisterFileHandle
  })
}));

function setupStore(preloadedState?: Partial<RootState>) {
  return configureStore({
    reducer: {
      duckdb: duckdbReducer as any,
      chat: chatReducer as any,
      map: mapReducer as any,
      data: dataReducer as any,
    },
    preloadedState,
    middleware: (getDefaultMiddleware) =>
      getDefaultMiddleware({
        serializableCheck: {
          ignoredActions: ['duckdb/initializeDuckDB/fulfilled'],
          ignoredPaths: ['duckdb.instance', 'duckdb.connection'],
        },
      }),
  });
}

describe('DataPanel', () => {
  let store: ReturnType<typeof setupStore>;
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup default mock responses
    mockExecuteQuery.mockImplementation((query: string) => {
      if (query.includes('DESCRIBE')) {
        return Promise.resolve([
          { column_name: 'col1', column_type: 'VARCHAR' },
          { column_name: 'col2', column_type: 'VARCHAR' }
        ]);
      }
      if (query.includes('COUNT(*)')) {
        return Promise.resolve([{ count: 1 }]);
      }
      return Promise.resolve([]);
    });
    
    mockRegisterFileHandle.mockResolvedValue(undefined);
    
    store = setupStore({
      duckdb: {
        instance: null,
        connection: null,
        isInitialized: true,
        isLoading: false,
        error: null
      },
      data: {
        datasets: [],
        activeDatasetId: null,
        isLoading: false,
        error: null
      }
    });
  });

  it('should render without warnings', () => {
    const { container } = render(
      <Provider store={store}>
        <DataPanel onClose={mockOnClose} />
      </Provider>
    );

    expect(screen.getByText('Data Management')).toBeInTheDocument();
    expect(container.querySelector('.data-panel')).toBeInTheDocument();
  });

  it('should have controlled URL input', () => {
    render(
      <Provider store={store}>
        <DataPanel onClose={mockOnClose} />
      </Provider>
    );

    // Get URL input (no longer need to switch tabs)
    const urlInput = screen.getByPlaceholderText('https://example.com/data.csv') as HTMLInputElement;
    
    // Verify initial value is empty string (controlled)
    expect(urlInput.value).toBe('');

    // Type in the input
    fireEvent.change(urlInput, { target: { value: 'https://example.com/test.csv' } });
    
    // Verify value updates (controlled behavior)
    expect(urlInput.value).toBe('https://example.com/test.csv');
  });

  it('should show both upload and URL options together', () => {
    render(
      <Provider store={store}>
        <DataPanel onClose={mockOnClose} />
      </Provider>
    );

    // Both upload area and URL input should be visible
    expect(screen.getByLabelText(/Drop files here or click to browse/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://example.com/data.csv')).toBeInTheDocument();
    expect(screen.getByText('OR')).toBeInTheDocument();
  });

  it('should handle file upload', async () => {
    render(
      <Provider store={store}>
        <DataPanel onClose={mockOnClose} />
      </Provider>
    );

    const file = new File(['col1,col2\nval1,val2'], 'test.csv', { type: 'text/csv' });
    const input = screen.getByLabelText(/Drop files here or click to browse/i).closest('input') as HTMLInputElement;

    Object.defineProperty(input, 'files', {
      value: [file],
      writable: false,
    });

    fireEvent.change(input);

    await waitFor(() => {
      expect(mockRegisterFileHandle).toHaveBeenCalledWith('test.csv', file);
      expect(mockExecuteQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'));
    });
  });

  it('should validate URLs before loading', async () => {
    render(
      <Provider store={store}>
        <DataPanel onClose={mockOnClose} />
      </Provider>
    );

    const urlInput = screen.getByPlaceholderText('https://example.com/data.csv') as HTMLInputElement;
    const loadButton = screen.getByText('Load from URL');

    // Try invalid URL
    fireEvent.change(urlInput, { target: { value: 'not-a-url' } });
    fireEvent.click(loadButton);

    await waitFor(() => {
      expect(screen.getByText(/Invalid URL/i)).toBeInTheDocument();
    });
  });
});
