import * as duckdb from '@duckdb/duckdb-wasm';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';

// Manual bundle config: Vite resolves the worker/wasm assets via `?url` imports.
const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: { mainModule: duckdb_wasm, mainWorker: mvp_worker },
    eh: { mainModule: duckdb_wasm_eh, mainWorker: eh_worker },
};

let globalDB: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

/** Returns the process-wide singleton DuckDB instance, initializing it once. */
export async function getGlobalDB(): Promise<duckdb.AsyncDuckDB> {
    if (globalDB) return globalDB;
    if (!initPromise) initPromise = initializeDB();
    globalDB = await initPromise;
    return globalDB;
}

async function initializeDB(): Promise<duckdb.AsyncDuckDB> {
    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const db = new duckdb.AsyncDuckDB(new duckdb.VoidLogger(), worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);
    await db.open({ accessMode: duckdb.DuckDBAccessMode.READ_WRITE });

    const conn = await db.connect();
    try {
        await conn.query('INSTALL spatial;');
        await conn.query('LOAD spatial;');
        // Force deterministic single-thread mode; 4GB is the wasm 32-bit ceiling.
        await conn.query('PRAGMA threads=1;');
        await conn.query("SET memory_limit='4GB';");
    } finally {
        await conn.close();
    }
    return db;
}

/** Terminates and clears the singleton (used by tests / teardown). */
export function terminateGlobalDB(): void {
    if (globalDB) {
        globalDB.terminate();
        globalDB = null;
        initPromise = null;
    }
}
