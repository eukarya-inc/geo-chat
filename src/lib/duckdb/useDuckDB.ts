import * as duckdb from "@duckdb/duckdb-wasm";
import { useEffect, useRef, useState } from "react";
import { createDBStateManager, type DBStateManager } from "./dbStateManager";
import { getGlobalDB } from "./globalDB";

export function useDuckDB() {
    console.log('useDuckDB: Hook called');
    const [db, setDb] = useState<duckdb.AsyncDuckDB | null>(null);
    const [dbStateManager, setDbStateManager] = useState<DBStateManager | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const isInitialized = useRef(false); // 初期化されたかどうかを追跡するref

    useEffect(() => {
        async function initDB() {
            try {
                console.log('useDuckDB: Requesting global database instance');
                const db = await getGlobalDB();
                console.log('useDuckDB: Got global database instance');
                
                console.log('useDuckDB: Setting database state');
                setDb(db);
                setDbStateManager(createDBStateManager(db));
                console.log('useDuckDB: Database state set successfully');
            } catch (err) {
                setError(
                    err instanceof Error
                        ? err
                        : new Error("Failed to initialize DuckDB")
                );
            }
        }

        if (!isInitialized.current) {
            initDB();
            isInitialized.current = true;
        }

        return () => {
            // Don't terminate the global DB here - it's shared
            // Only terminate on app shutdown
        };
    }, []);

    return { db, dbStateManager, error };
}
