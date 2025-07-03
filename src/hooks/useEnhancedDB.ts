import { useEffect, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { EnhancedDBManager } from '../services/duckdb/enhancedDBManager';

/**
 * Hook to get the enhanced DuckDB manager with Arrow support
 */
export function useEnhancedDB() {
  const { connection: db, dbStateManager } = useAppSelector(state => state.duckdb);
  const [enhancedDB, setEnhancedDB] = useState<EnhancedDBManager | null>(null);

  useEffect(() => {
    if (db && dbStateManager) {
      const manager = new EnhancedDBManager(db, dbStateManager);
      setEnhancedDB(manager);
    } else {
      setEnhancedDB(null);
    }
  }, [db, dbStateManager]);

  return enhancedDB;
}