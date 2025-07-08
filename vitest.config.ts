import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './test/setup.ts',
    css: {
      modules: {
        classNameStrategy: 'non-scoped'
      }
    },
    exclude: [
      'node_modules/**',
      'dist/**',
      'tmp/**',
    ],
    coverage: {
      reporter: ['text', 'json', 'html', 'json-summary'],
      exclude: [
        'node_modules/',
        'test/',
        '*.config.ts',
        'src/vite-env.d.ts',
        'tmp/',
        'dist/'
      ],
      thresholds: {
        branches: 60,
        functions: 60,
        lines: 70,
        statements: 70
      }
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
