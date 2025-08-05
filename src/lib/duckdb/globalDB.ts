import * as duckdb from "@duckdb/duckdb-wasm";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";

// Interface to extend AsyncDuckDB with debugging properties
interface DebuggableAsyncDuckDB extends duckdb.AsyncDuckDB {
    __instanceId?: string;
}

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};

// Global singleton database instance and connection
let globalDB: duckdb.AsyncDuckDB | null = null;
let initPromise: Promise<duckdb.AsyncDuckDB> | null = null;

export async function getGlobalDB(): Promise<duckdb.AsyncDuckDB> {
    if (globalDB) {
        console.log('GlobalDB: Returning existing global database instance');
        return globalDB;
    }

    if (initPromise) {
        console.log('GlobalDB: Waiting for database initialization to complete');
        const db = await initPromise;
        globalDB = db;
        return db;
    }

    console.log('GlobalDB: Creating new global database instance');
    initPromise = initializeDB();
    globalDB = await initPromise;
    console.log('GlobalDB: Global database instance created and cached');
    return globalDB;
}

async function initializeDB(): Promise<duckdb.AsyncDuckDB> {
    console.log('GlobalDB: Initializing single database instance');

    const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
    const worker = new Worker(bundle.mainWorker!);
    const logger = new duckdb.VoidLogger();
    // const logger = new duckdb.ConsoleLogger();
    const db = new duckdb.AsyncDuckDB(logger, worker);
    await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

    await db.open({
        accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
    });

    // Add unique identifier for debugging
    (db as DebuggableAsyncDuckDB).__instanceId = Math.random().toString(36).substring(2, 15);
    console.log('GlobalDB: Created database with unique ID:', (db as DebuggableAsyncDuckDB).__instanceId);

    // Install and load the spatial extension and configure database
    const conn = await db.connect();
    try {
        await conn.query("INSTALL spatial;");
        await conn.query("LOAD spatial;");

        // Force single-threaded consistent mode
        await conn.query("PRAGMA threads=1;");
        await conn.query("SET memory_limit='1GB';");

        console.log("GlobalDB: Database initialized with spatial extension and single-thread mode");
    } finally {
        await conn.close();
    }

    return db;
}

export function terminateGlobalDB(): void {
    if (globalDB) {
        globalDB.terminate();
        globalDB = null;
        initPromise = null;
    }
}
