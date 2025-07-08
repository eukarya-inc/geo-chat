import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render as rtlRender } from '@testing-library/react';
import type { ReactElement } from 'react';
import { vi } from 'vitest';

// Import our reducers
import duckdbReducer from '../../src/store/slices/duckdbSlice';
import chatReducer from '../../src/store/slices/chatSlice';
import mapReducer from '../../src/store/slices/mapSlice';
import dataReducer from '../../src/store/slices/dataSlice';
import type { RootState } from '../../src/store';

// Create a test store with optional preloaded state
export function setupStore(preloadedState?: Partial<RootState>) {
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

// Custom render function that includes providers
interface RenderOptions {
  preloadedState?: Partial<RootState>;
  store?: ReturnType<typeof setupStore>;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    preloadedState,
    store = setupStore(preloadedState),
    ...renderOptions
  }: RenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return <Provider store={store}>{children}</Provider>;
  }

  return { store, ...rtlRender(ui, { wrapper: Wrapper, ...renderOptions }) };
}

// Mock DuckDB instance for testing
export function createMockDuckDB() {
  const tables = new Map<string, any[]>();
  
  return {
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockImplementation(async (sql: string) => {
        // Simple SQL parsing for tests
        const selectMatch = sql.match(/FROM\s+["']?(\w+)["']?/i);
        if (selectMatch) {
          const tableName = selectMatch[1];
          const data = tables.get(tableName) || [];
          return {
            toArray: () => data,
            numRows: data.length,
            numCols: data.length > 0 ? Object.keys(data[0]).length : 0
          };
        }
        return { toArray: () => [], numRows: 0, numCols: 0 };
      }),
      close: vi.fn().mockResolvedValue(undefined),
      exec: vi.fn().mockResolvedValue(undefined)
    }),
    registerFileHandle: vi.fn().mockResolvedValue(undefined),
    registerTable: (name: string, data: any[]) => {
      tables.set(name, data);
    }
  };
}

// Mock MapLibre instance for testing
export function createMockMap() {
  const sources = new Map();
  const layers = new Map();
  
  return {
    addSource: vi.fn((id: string, source: any) => sources.set(id, source)),
    removeSource: vi.fn((id: string) => sources.delete(id)),
    getSource: vi.fn((id: string) => sources.get(id)),
    addLayer: vi.fn((layer: any) => layers.set(layer.id, layer)),
    removeLayer: vi.fn((id: string) => layers.delete(id)),
    getLayer: vi.fn((id: string) => layers.get(id)),
    on: vi.fn(),
    off: vi.fn(),
    fire: vi.fn(),
    getStyle: vi.fn(() => ({ layers: Array.from(layers.values()) })),
    flyTo: vi.fn(),
    fitBounds: vi.fn(),
    project: vi.fn((lngLat: any) => ({ x: lngLat[0] * 100, y: lngLat[1] * 100 })),
    unproject: vi.fn((point: any) => ({ lng: point.x / 100, lat: point.y / 100 }))
  };
}

// Sample GeoJSON data for testing
export const sampleGeoJSON = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: { id: 1, name: 'Feature 1', value: 10 },
      geometry: {
        type: 'Point',
        coordinates: [139.7, 35.6]
      }
    },
    {
      type: 'Feature',
      properties: { id: 2, name: 'Feature 2', value: 20 },
      geometry: {
        type: 'Point',
        coordinates: [139.8, 35.7]
      }
    }
  ]
};

// Wait for async updates
export const waitForAsync = (ms = 0) => 
  new Promise(resolve => setTimeout(resolve, ms));

// Assert that an element eventually appears
export async function waitForElement(
  getElement: () => HTMLElement | null,
  timeout = 3000
): Promise<HTMLElement> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const element = getElement();
    if (element) return element;
    await waitForAsync(50);
  }
  
  throw new Error('Element not found within timeout');
}
