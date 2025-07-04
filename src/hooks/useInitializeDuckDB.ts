import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { setConnection, setError } from '../store/slices/duckdbSlice';
import { getGlobalDB } from '../lib/duckdb/globalDB';
import { initializeDBStateManager } from '../lib/duckdb/dbStateManagerSingleton';

export function useInitializeDuckDB() {
  const dispatch = useAppDispatch();
  const { connection, isInitialized } = useAppSelector(state => state.duckdb);

  useEffect(() => {
    if (!isInitialized) {
      initDB();
    }

    async function initDB() {
      try {
        console.log('useInitializeDuckDB: Initializing DuckDB');
        const db = await getGlobalDB();
        
        // Initialize the dbStateManager singleton
        initializeDBStateManager(db);
        
        dispatch(setConnection(db));
        console.log('useInitializeDuckDB: DuckDB initialized successfully');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to initialize DuckDB';
        dispatch(setError(errorMessage));
        console.error('useInitializeDuckDB: Error initializing DuckDB:', err);
      }
    }
  }, [dispatch, isInitialized]);

  return { db: connection, isInitialized };
}