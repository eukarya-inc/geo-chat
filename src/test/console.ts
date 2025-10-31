import { vi } from 'vitest';

/**
 * Console suppression utility for tests
 *
 * Provides functions to suppress and restore console output during tests.
 * This is useful for reducing noise in test output from libraries like DuckDB-WASM.
 *
 * @example
 * ```typescript
 * import { suppressConsole, restoreConsole } from '@/test/console';
 *
 * describe('My Test Suite', () => {
 *   let restoreFn: (() => void) | undefined;
 *
 *   beforeAll(() => {
 *     restoreFn = suppressConsole();
 *   });
 *
 *   afterAll(() => {
 *     restoreFn?.();
 *   });
 * });
 * ```
 */

/**
 * Suppress console output (log, warn, error) during tests
 *
 * @returns A function to restore the original console functions
 */
export function suppressConsole(): () => void {
    const originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };

    console.log = vi.fn();
    console.warn = vi.fn();
    console.error = vi.fn();

    return () => {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
    };
}

/**
 * Restore console output to original functions
 *
 * @deprecated Use the restore function returned by suppressConsole() instead
 */
export function restoreConsole(originalConsole: {
    log: typeof console.log;
    warn: typeof console.warn;
    error: typeof console.error;
}): void {
    console.log = originalConsole.log;
    console.warn = originalConsole.warn;
    console.error = originalConsole.error;
}
