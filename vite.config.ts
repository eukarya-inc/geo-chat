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
    test: {
        globals: true,
        environment: 'jsdom',
        setupFiles: [],
    },
});
