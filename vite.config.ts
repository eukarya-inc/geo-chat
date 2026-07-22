/// <reference types="vitest" />
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
    base: '/geo-chat/',
    plugins: [react(), tailwindcss()],
    optimizeDeps: {
        exclude: ['@duckdb/duckdb-wasm'],
    },
    server: {
        headers: {
            'Cross-Origin-Opener-Policy': 'same-origin',
            'Cross-Origin-Embedder-Policy': 'require-corp',
        },
    },
    build: {
        rollupOptions: {
            output: {
                // Ensure proper headers for WASM files
                assetFileNames: assetInfo => {
                    if (assetInfo.name && assetInfo.name.endsWith('.wasm')) {
                        return 'assets/[name]-[hash][extname]';
                    }
                    return 'assets/[name]-[hash][extname]';
                },
            },
        },
    },
});
