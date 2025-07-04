import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBStateManager, DBStateManager } from './dbStateManager';

/**
 * Singleton for managing the DBStateManager instance
 * This keeps the non-serializable DBStateManager out of Redux state
 */
class DBStateManagerSingleton {
  private static instance: DBStateManagerSingleton;
  private manager: DBStateManager | null = null;

  private constructor() {}

  static getInstance(): DBStateManagerSingleton {
    if (!DBStateManagerSingleton.instance) {
      DBStateManagerSingleton.instance = new DBStateManagerSingleton();
    }
    return DBStateManagerSingleton.instance;
  }

  initialize(db: AsyncDuckDB): DBStateManager {
    if (this.manager) {
      console.warn('DBStateManager already initialized, replacing existing instance');
    }
    this.manager = createDBStateManager(db);
    return this.manager;
  }

  getManager(): DBStateManager | null {
    return this.manager;
  }

  reset(): void {
    this.manager = null;
  }
}

export const dbStateManagerSingleton = DBStateManagerSingleton.getInstance();

// Export convenience functions
export function getDBStateManager(): DBStateManager | null {
  return dbStateManagerSingleton.getManager();
}

export function initializeDBStateManager(db: AsyncDuckDB): DBStateManager {
  return dbStateManagerSingleton.initialize(db);
}