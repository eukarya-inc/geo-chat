import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

export interface DBStateManager {
  forceConsistency(): Promise<void>;
  notifyTableChange(): void;
  onTableChange(callback: () => void): () => void;
  executeWithRefresh<T>(operation: () => Promise<T>, tableName?: string): Promise<T>;
  validateTable(tableName: string, maxRetries?: number): Promise<boolean>;
  getTables(): Promise<string[]>;
  getTableColumns(tableName: string): Promise<Array<{name: string; type: string}>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeQuery(sql: string): Promise<any[]>;
}

class DatabaseStateManager implements DBStateManager {
  private db: AsyncDuckDB;
  private tableChangeCallbacks: Set<() => void> = new Set();
  private refreshDebounceTimeout: NodeJS.Timeout | null = null;

  constructor(db: AsyncDuckDB) {
    this.db = db;
  }

  async forceConsistency(): Promise<void> {
    const conn = await this.db.connect();
    try {
      // Force immediate synchronization across all connections
      await conn.query('CHECKPOINT;');
      
      // Force WAL checkpoint to ensure immediate visibility
      try {
        await conn.query('PRAGMA wal_checkpoint(RESTART);');
      } catch {
        // If WAL checkpoint fails, try alternative
        await conn.query('PRAGMA checkpoint_threshold=0;');
        await conn.query('CHECKPOINT;');
      }
      
      // Brief pause to ensure all operations are flushed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log('DBStateManager: Database consistency enforced');
    } catch (error) {
      console.log('DB consistency checkpoint failed (non-critical):', error);
    } finally {
      await conn.close();
    }
  }

  notifyTableChange(): void {
    // DISABLED DEBOUNCING - Execute immediately to test if debouncing was causing issues
    console.log('DBStateManager: Notifying table change IMMEDIATELY to', this.tableChangeCallbacks.size, 'listeners');
    this.tableChangeCallbacks.forEach(callback => {
      try {
        callback();
      } catch (error) {
        console.error('Table change callback error:', error);
      }
    });
  }

  onTableChange(callback: () => void): () => void {
    this.tableChangeCallbacks.add(callback);
    return () => {
      this.tableChangeCallbacks.delete(callback);
    };
  }

  async executeWithRefresh<T>(operation: () => Promise<T>, tableName?: string): Promise<T> {
    try {
      console.log('DBStateManager: Executing DDL operation');
      const result = await operation();
      
      // Force immediate consistency across all potential connections
      console.log('DBStateManager: DDL operation completed, forcing database sync');
      
      // Force multiple checkpoints to ensure data is visible across connections
      await this.forceConsistency();
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.forceConsistency();
      
      // Validate table if specified with more retries
      if (tableName) {
        console.log(`DBStateManager: Validating table ${tableName} after operation`);
        const isValid = await this.validateTable(tableName, 5);
        if (!isValid) {
          console.error(`DBStateManager: CRITICAL - Table ${tableName} validation failed after creation`);
          // Try one more aggressive sync
          await this.forceConsistency();
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Notify table change with longer delay to ensure propagation
      setTimeout(() => {
        this.notifyTableChange();
      }, 500);
      
      return result;
    } catch (error) {
      console.error('DBStateManager: Operation failed:', error);
      throw error;
    }
  }

  private async refreshSchemaCache(): Promise<void> {
    console.log('DBStateManager: Refreshing schema cache');
    const conn = await this.db.connect();
    try {
      // Force schema refresh in DuckDB
      await conn.query('PRAGMA schema_version;');
      await conn.query('PRAGMA database_list;');
    } catch (error) {
      console.log('DBStateManager: Schema refresh failed (non-critical):', error);
    } finally {
      await conn.close();
    }
  }

  async validateTable(tableName: string, maxRetries: number = 5): Promise<boolean> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Force consistency before each validation attempt
        if (attempt > 0) {
          await this.forceConsistency();
        }
        
        const conn = await this.db.connect();
        try {
          // Try both SHOW TABLES and direct access
          const tablesResult = await conn.query('SHOW TABLES;');
          const tableNames: string[] = [];
          for (let i = 0; i < tablesResult.numRows; i++) {
            tableNames.push(tablesResult.getChildAt(0)?.get(i) as string);
          }
          
          if (!tableNames.includes(tableName)) {
            console.log(`DBStateManager: Table ${tableName} not found in SHOW TABLES on attempt ${attempt + 1}. Found: ${tableNames.join(', ')}`);
            throw new Error(`Table ${tableName} not in SHOW TABLES`);
          }
          
          // Then try to access it
          await conn.query(`SELECT 1 FROM ${tableName} LIMIT 0`);
          console.log(`DBStateManager: Table ${tableName} validated successfully on attempt ${attempt + 1}`);
          return true;
        } finally {
          await conn.close();
        }
      } catch (error) {
        if (attempt < maxRetries - 1) {
          console.log(`DBStateManager: Table ${tableName} validation failed, attempt ${attempt + 1}/${maxRetries}. Retrying in ${300 * (attempt + 1)}ms...`);
          await new Promise(resolve => setTimeout(resolve, 300 * (attempt + 1)));
        } else {
          // Get available tables for better error message
          let availableTables: string[] = [];
          try {
            availableTables = await this.getTables();
          } catch {
            // Ignore error getting tables
          }
          
          const tableList = availableTables.length > 0 ? ` Available tables: ${availableTables.join(', ')}` : '';
          console.error(`DBStateManager: Table ${tableName} validation failed after ${maxRetries} attempts.${tableList} Error:`, error);
        }
      }
    }
    return false;
  }

  async getTables(): Promise<string[]> {
    const conn = await this.db.connect();
    try {
      const result = await conn.query('SHOW TABLES;');
      const tableNames: string[] = [];
      for (let i = 0; i < result.numRows; i++) {
        tableNames.push(result.getChildAt(0)?.get(i) as string);
      }
      
      console.log('DBStateManager: Retrieved tables:', tableNames);
      return tableNames;
    } finally {
      await conn.close();
    }
  }

  async getTableColumns(tableName: string): Promise<Array<{name: string; type: string}>> {
    if (!(await this.validateTable(tableName))) {
      throw new Error(`Table '${tableName}' does not exist or is not accessible`);
    }

    const conn = await this.db.connect();
    try {
      const result = await conn.query(`DESCRIBE ${tableName}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.toArray().map((row: any) => ({
        name: row.column_name as string,
        type: row.column_type as string
      }));
    } finally {
      await conn.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async executeQuery(sql: string): Promise<any[]> {
    console.log('DBStateManager: Executing query:', sql.substring(0, 100));
    
    const conn = await this.db.connect();
    try {
      const result = await conn.query(sql);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = result.toArray().map((row: any) => {
        const obj = Object.fromEntries(row);
        return Object.fromEntries(
          Object.entries(obj).map(([key, value]) => [
            key,
            typeof value === 'bigint' ? Number(value) : value
          ])
        );
      });
      
      console.log(`DBStateManager: Query returned ${data.length} rows`);
      return data;
    } catch (error) {
      console.error('DBStateManager: Query failed:', sql, error);
      throw error;
    } finally {
      await conn.close();
    }
  }
}

export function createDBStateManager(db: AsyncDuckDB): DBStateManager {
  return new DatabaseStateManager(db);
}