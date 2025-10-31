import { useEffect, useRef, useState } from 'react';
import { createDBContext, type DBContext } from './dbContext';
import { getGlobalDB } from './globalDB';

export function useDuckDB() {
    const [dbContext, setDbContext] = useState<DBContext | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const [isInitializing, setIsInitializing] = useState(true);
    const isInitialized = useRef(false);

    useEffect(() => {
        async function initDB() {
            try {
                const db = await getGlobalDB();
                setDbContext(createDBContext(db));
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to initialize DuckDB'));
            } finally {
                setIsInitializing(false);
            }
        }

        if (!isInitialized.current) {
            initDB();
            isInitialized.current = true;
        }
    }, []);

    return { dbContext, error, isInitializing };
}

/**
 * Custom hook to create a dedicated DBContext for Map component with higher connection pool
 */
export function useMapDuckDB(maxConnections = 20) {
    const [mapDbContext, setMapDbContext] = useState<DBContext | null>(null);
    const [error, setError] = useState<Error | null>(null);
    const isInitialized = useRef(false);

    useEffect(() => {
        async function initMapDB() {
            try {
                const db = await getGlobalDB();
                // Create separate DBContext with larger connection pool for Map
                const ctx = createDBContext(db, true, maxConnections);
                setMapDbContext(ctx);
            } catch (err) {
                setError(err instanceof Error ? err : new Error('Failed to initialize Map DuckDB context'));
            }
        }

        if (!isInitialized.current) {
            initMapDB();
            isInitialized.current = true;
        }
    }, [maxConnections]);

    return { mapDbContext, error };
}
