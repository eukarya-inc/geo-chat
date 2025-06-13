import * as duckdb from "@duckdb/duckdb-wasm";
import eh_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url";
import mvp_worker from "@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url";
import duckdb_wasm_eh from "@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url";
import duckdb_wasm from "@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url";
import { useEffect, useRef, useState } from "react";

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

export function useDuckDB() {
    const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const isInitialized = useRef(false); // 初期化されたかどうかを追跡するref

    useEffect(() => {
        async function initDB() {
            try {
                // Select a bundle based on browser checks
                const bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
                // Instantiate the asynchronous version of DuckDB-wasm
                const worker = new Worker(bundle.mainWorker!);
                const logger = new duckdb.ConsoleLogger();
                const db = new duckdb.AsyncDuckDB(logger, worker);
                await db.instantiate(bundle.mainModule, bundle.pthreadWorker);

                // OPFSにデータベースを配置
                await db.open({
                    // path: "opfs://data.duckdb",
                    // accessMode: duckdb.DuckDBAccessMode.READ_WRITE,
                });
                console.log("Database opened successfully.");

                // Install and load the spatial extension
                const conn = await db.connect();
                try {
                    await conn.query("INSTALL spatial;");
                    await conn.query("LOAD spatial;");
                } catch (extensionError) {
                    console.error(
                        "Error installing spatial extension:",
                        extensionError
                    );
                    throw extensionError;
                } finally {
                    await conn.close();
                }

                setDb(db);
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err
                        : new Error("Failed to initialize DuckDB")
                );
            }
        }

        // 初期化されていない場合のみinitDBを実行
        if (!isInitialized.current) {
            console.log("Initializing DuckDB...");
            initDB();
            isInitialized.current = true; // 初期化フラグを設定
        }

        return () => {
            // クリーンアップ
            if (db) {
                db.terminate();
            }
        };
    }, [db]);

    return { db, error };
}
