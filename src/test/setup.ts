import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock matchMedia for tests that might use it
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock ResizeObserver for tests that might need it
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock URL APIs
Object.defineProperty(URL, 'createObjectURL', {
  value: vi.fn(() => 'blob:fake-url'),
});

Object.defineProperty(URL, 'revokeObjectURL', {
  value: vi.fn(),
});