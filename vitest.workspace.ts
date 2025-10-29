import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
    {
        test: {
            name: 'unit',
            globals: true,
            environment: 'jsdom',
            setupFiles: [],
            include: ['src/**/*.test.{ts,tsx}'],
            exclude: ['node_modules', 'dist', 'tmp', '.idea', '.git', '.cache', 'src/**/*.browser.test.{ts,tsx}'],
        },
    },
    {
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
                '.idea',
                '.git',
                '.cache',
                'src/**/benchmark.browser.test.{ts,tsx}',
            ],
        },
    },
    {
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
            exclude: ['node_modules', 'dist', 'tmp', '.idea', '.git', '.cache'],
        },
    },
]);
