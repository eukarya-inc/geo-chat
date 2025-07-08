import '@testing-library/jest-dom';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Cleanup after each test
afterEach(() => {
  cleanup();
});

// Mock DuckDB WASM
vi.mock('@duckdb/duckdb-wasm', () => ({
  selectBundle: vi.fn().mockResolvedValue({
    mainModule: 'mock-main-module',
    mainWorker: 'mock-main-worker',
    pthreadWorker: 'mock-pthread-worker'
  }),
  getJsDelivrBundles: vi.fn().mockReturnValue([]),
  AsyncDuckDB: vi.fn().mockImplementation(() => ({
    instantiate: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue({
      query: vi.fn().mockResolvedValue({ toArray: () => [] }),
      close: vi.fn().mockResolvedValue(undefined)
    })
  })),
  ConsoleLogger: vi.fn()
}));

// Mock MapLibre GL
vi.mock('maplibre-gl', () => ({
  Map: vi.fn().mockImplementation(() => ({
    on: vi.fn(),
    off: vi.fn(),
    remove: vi.fn(),
    addControl: vi.fn(),
    addSource: vi.fn(),
    addLayer: vi.fn(),
    removeLayer: vi.fn(),
    removeSource: vi.fn(),
    getStyle: vi.fn().mockReturnValue({ layers: [] }),
    setStyle: vi.fn(),
    resize: vi.fn(),
    project: vi.fn(),
    unproject: vi.fn(),
    getBounds: vi.fn(),
    getZoom: vi.fn(),
    setZoom: vi.fn(),
    getCenter: vi.fn(),
    setCenter: vi.fn(),
    flyTo: vi.fn()
  })),
  NavigationControl: vi.fn(),
  Popup: vi.fn().mockImplementation(() => ({
    setLngLat: vi.fn().mockReturnThis(),
    setHTML: vi.fn().mockReturnThis(),
    addTo: vi.fn().mockReturnThis(),
    remove: vi.fn()
  }))
}));

// Mock window.Worker
class MockWorker {
  postMessage = vi.fn();
  terminate = vi.fn();
  addEventListener = vi.fn();
  removeEventListener = vi.fn();
}

global.Worker = MockWorker as any;
