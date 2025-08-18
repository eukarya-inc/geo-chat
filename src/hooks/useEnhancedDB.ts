import { useEffect, useState } from 'react';
import { useAppSelector } from '../store/hooks';
import { EnhancedDBManager } from '../services/duckdb/enhancedDBManager';

/**
 * Hook to get the enhanced DuckDB manager with Arrow support
 */
export function useEnhancedDB() {
  const { connection: db, dbContext } = useAppSelector(state => state.duckdb);
  const [enhancedDB, setEnhancedDB] = useState<EnhancedDBManager | null>(null);

  useEffect(() => {
    if (db && dbContext) {
      const manager = new EnhancedDBManager(db, dbContext);
      setEnhancedDB(manager);
    } else {
      setEnhancedDB(null);
    }
  }, [db, dbContext]);

  return enhancedDB;
}