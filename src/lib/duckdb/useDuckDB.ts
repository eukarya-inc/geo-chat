import { useEffect, useRef, useState } from "react";
import { createDBContext, type DBContext } from "./dbContext";
import { getGlobalDB } from "./globalDB";

export function useDuckDB() {
    const [dbContext, setDbContext] = useState<DBContext | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const isInitialized = useRef(false);

    useEffect(() => {
        async function initDB() {
            try {
                console.log('useDuckDB: Requesting global database instance');
                const db = await getGlobalDB();
                console.log('useDuckDB: Got global database instance');

                console.log('useDuckDB: Setting database context');
                setDbContext(createDBContext(db));
                console.log('useDuckDB: Database context set successfully');
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
    }, []);

    return { dbContext, error };
}
