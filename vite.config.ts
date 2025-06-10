/// <reference types="vitest" />
import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
    base: '/duckdb-wasm-prototype/',
    plugins: [react()],
    optimizeDeps: {
        exclude: ["@duckdb/duckdb-wasm"],
    },
    server: {
        headers: {
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp",
        },
    },
    //@ts-expect-error vitest config is not typed
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
    },
});
