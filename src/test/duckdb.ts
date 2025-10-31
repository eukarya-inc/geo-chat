import * as duckdb from '@duckdb/duckdb-wasm';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

/**
 * DuckDB-WASM test utilities
 *
 * Provides helper functions for initializing DuckDB-WASM in browser tests.
 * This ensures consistent configuration across all browser tests.
 *
 * @example
 * ```typescript
 * import { initializeDuckDB } from '../../test/duckdb';
 *
 * describe('My Test Suite', () => {
 *   let db: AsyncDuckDB;
 *
 *   beforeAll(async () => {
 *     db = await initializeDuckDB();
 *   });
 *
 *   afterAll(async () => {
 *     if (db) {
 *       await db.terminate();
 *     }
 *   });
 * });
 * ```
 */

/**
 * Initialize DuckDB-WASM for browser tests
 *
 * Creates an in-memory DuckDB instance with the appropriate bundles
 * for browser environments. Uses manual bundle configuration to ensure
 * compatibility with Vitest browser mode.
 *
 * @returns Promise resolving to initialized AsyncDuckDB instance
 */
export async function initializeDuckDB(): Promise<AsyncDuckDB> {
    const MANUAL_BUNDLES = {
        mvp: {
            mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm',
            mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js',
        },
        eh: {
            mainModule: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-eh.wasm',
            mainWorker: '/node_modules/@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js',
        },
    } as const;

    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.VoidLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    // Open database in memory with read-write access
    await db.open({ path: ':memory:', accessMode: duckdb.DuckDBAccessMode.READ_WRITE });

    return db;
}
