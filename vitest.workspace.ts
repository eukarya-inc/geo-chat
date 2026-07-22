import { fileURLToPath, URL } from 'node:url';
import { defineWorkspace } from 'vitest/config';

const alias = { '@': fileURLToPath(new URL('./src', import.meta.url)) };

export default defineWorkspace([
    {
        resolve: { alias },
        test: {
            name: 'unit',
            globals: true,
            environment: 'jsdom',
            setupFiles: ['./src/test/setup.ts', 'vitest-localstorage-mock'],
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: [
                'node_modules',
                'dist',
                'tmp',
                'legacy-src',
                '.idea',
                '.git',
                '.cache',
                'src/**/*.browser.test.{ts,tsx}',
            ],
        },
    },
    {
        resolve: { alias },
        test: {
            name: 'browser',
            globals: true,
            browser: {
                enabled: true,
                name: 'webkit',
                provider: 'playwright',
                headless: true,
                screenshotFailures: false,
            },
            include: ['src/**/*.browser.test.{ts,tsx}'],
            exclude: [
                'node_modules',
                'dist',
                'tmp',
                'legacy-src',
                '.idea',
                '.git',
                '.cache',
                'src/**/benchmark.browser.test.{ts,tsx}',
            ],
        },
    },
    {
        resolve: { alias },
        test: {
            name: 'benchmark',
            globals: true,
            browser: {
                enabled: true,
                name: 'webkit',
                provider: 'playwright',
                headless: true,
                screenshotFailures: false,
            },
            include: ['src/**/benchmark.browser.test.{ts,tsx}'],
            exclude: ['node_modules', 'dist', 'tmp', 'legacy-src', '.idea', '.git', '.cache'],
        },
    },
]);
