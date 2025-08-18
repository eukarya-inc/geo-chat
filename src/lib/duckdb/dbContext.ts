import type { AsyncDuckDB, AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import { SQLHistoryManager } from './sqlHistoryManager';

export interface DBContext {
  connect(): Promise<AsyncDuckDBConnection>;
  forceConsistency(): Promise<void>;
  notifyTableChange(tableName?: string): void;
  onTableChange(callback: (tableName?: string) => void): () => void;
  executeWithRefresh<T>(operation: () => Promise<T>, tableName?: string): Promise<T>;
  validateTable(tableName: string, maxRetries?: number): Promise<boolean>;
  getTables(): Promise<string[]>;
  getTableColumns(tableName: string): Promise<Array<{name: string; type: string}>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  executeQuery(sql: string): Promise<any[]>;
  getSQLHistory(): SQLHistoryManager;
  setCurrentSchema(schema: string | null): void;
  getCurrentSchema(): string | null;
  connectWithSchema(): Promise<AsyncDuckDBConnection>;
  dropTable(tableName: string): Promise<void>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  describeTable(tableName: string): Promise<Array<{column_name: string; column_type: string; [key: string]: any}>>;
}

class DatabaseContext implements DBContext {
  private db: AsyncDuckDB;
  private tableChangeCallbacks: Set<(tableName?: string) => void> = new Set();
  private refreshDebounceTimeout: NodeJS.Timeout | null = null;
  private sqlHistory: SQLHistoryManager;
  private currentSchema: string | null = null;
  private activeConnections: Set<AsyncDuckDBConnection> = new Set();
  private connectionMutex: Promise<void> = Promise.resolve();

  constructor(db: AsyncDuckDB) {
    this.db = db;
    this.sqlHistory = new SQLHistoryManager();
  }

  async connect(): Promise<AsyncDuckDBConnection> {
    return this.db.connect();
  }

  setCurrentSchema(schema: string | null): void {
    // If schema is changing, close all active connections
    if (this.currentSchema !== schema) {
      this.closeAllConnections();
    }
    this.currentSchema = schema;
  }
  
  private async closeAllConnections(): Promise<void> {
    const connections = Array.from(this.activeConnections);
    for (const conn of connections) {
      try {
        await conn.close();
      } catch {
        // Ignore errors when closing connections
      }
    }
    this.activeConnections.clear();
  }

  getCurrentSchema(): string | null {
    return this.currentSchema;
  }

  async connectWithSchema(): Promise<AsyncDuckDBConnection> {
    // Use mutex to prevent concurrent connection creation
    await this.connectionMutex;
    
    const connectionPromise = (async () => {
      try {
        // Close old connections if we have too many
        if (this.activeConnections.size > 5) {
          const connectionsToClose = Array.from(this.activeConnections).slice(0, 2);
          for (const oldConn of connectionsToClose) {
            try {
              await oldConn.close();
              this.activeConnections.delete(oldConn);
            } catch {
              // Ignore errors when closing old connections
            }
          }
        }

        const conn = await this.db.connect();
        this.activeConnections.add(conn);
        
        if (this.currentSchema) {
          try {
            await conn.query(`SET search_path = '${this.currentSchema}'`);
          } catch (error) {
            // If setting search_path fails, close connection and throw
            await conn.close();
            this.activeConnections.delete(conn);
            throw new Error(`Failed to set schema ${this.currentSchema}: ${error}`);
          }
        }
        
        // Wrap the connection to track when it's closed
        const originalClose = conn.close.bind(conn);
        conn.close = async () => {
          this.activeConnections.delete(conn);
          return originalClose();
        };
        
        return conn;
      } catch (error) {
        console.error('DBContext: Failed to create schema-aware connection:', error);
        throw error;
      }
    })();
    
    // Update mutex for next call
    this.connectionMutex = connectionPromise.then(() => {}, () => {});
    
    return connectionPromise;
  }

  async forceConsistency(): Promise<void> {
    const conn = await this.connectWithSchema();
    try {
      // Force immediate synchronization across all connections
      await conn.query('CHECKPOINT;');
      
      // Use force_checkpoint which is available in DuckDB-WASM
      try {
        await conn.query('PRAGMA force_checkpoint;');
      } catch {
        // If force_checkpoint fails, just use regular CHECKPOINT
        await conn.query('CHECKPOINT;');
      }
      
      // Brief pause to ensure all operations are flushed
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Database consistency enforced
    } catch {
      // DB consistency checkpoint failed (non-critical)
    } finally {
      await conn.close();
    }
  }

  notifyTableChange(tableName?: string): void {
    // DISABLED DEBOUNCING - Execute immediately to test if debouncing was causing issues
    // Notifying table change to listeners
    this.tableChangeCallbacks.forEach(callback => {
      try {
        callback(tableName);
      } catch (error) {
        console.error('Table change callback error:', error);
      }
    });
  }

  onTableChange(callback: (tableName?: string) => void): () => void {
    this.tableChangeCallbacks.add(callback);
    return () => {
      this.tableChangeCallbacks.delete(callback);
    };
  }

  async executeWithRefresh<T>(operation: () => Promise<T>, tableName?: string): Promise<T> {
    try {
      // Executing DDL operation
      const result = await operation();
      
      // Force immediate consistency across all potential connections
      // DDL operation completed, forcing database sync
      
      // Force multiple checkpoints to ensure data is visible across connections
      await this.forceConsistency();
      await new Promise(resolve => setTimeout(resolve, 200));
      await this.forceConsistency();
      
      // Validate table if specified with more retries
      if (tableName) {
        // Validating table after operation
        const isValid = await this.validateTable(tableName, 5);
        if (!isValid) {
          console.error(`DBContext: CRITICAL - Table ${tableName} validation failed after creation`);
          // Try one more aggressive sync
          await this.forceConsistency();
          await new Promise(resolve => setTimeout(resolve, 300));
        }
      }
      
      // Notify table change with longer delay to ensure propagation
      setTimeout(() => {
        this.notifyTableChange(tableName);
      }, 500);
      
      return result;
    } catch (error) {
      console.error('DBContext: Operation failed:', error);
      throw error;
    }
  }

  private async refreshSchemaCache(): Promise<void> {
    // Refreshing schema cache
    const conn = await this.db.connect();
    try {
      // Force schema refresh in DuckDB
      await conn.query('PRAGMA schema_version;');
      await conn.query('PRAGMA database_list;');
    } catch {
      // Schema refresh failed (non-critical)
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
        
        const conn = await this.connectWithSchema();
        try {
          // Query tables from the current schema only
          const schemaName = this.currentSchema || 'main';
          const tablesResult = await conn.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = '${schemaName}'
              AND table_type = 'BASE TABLE'
          `);
          const tableNames: string[] = [];
          for (let i = 0; i < tablesResult.numRows; i++) {
            tableNames.push(tablesResult.getChildAt(0)?.get(i) as string);
          }
          
          if (!tableNames.includes(tableName)) {
            // Table not found in SHOW TABLES, retrying...
            throw new Error(`Table ${tableName} not in SHOW TABLES`);
          }
          
          // Then try to access it
          await conn.query(`SELECT 1 FROM ${tableName} LIMIT 0`);
          // Table validated successfully
          return true;
        } finally {
          await conn.close();
        }
      } catch (error) {
        // Check if this is a memory access error
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (errorMessage.includes('memory access out of bounds')) {
          console.error(`DBContext: Memory access error when validating table ${tableName}. Aborting validation.`);
          return false; // Don't retry on memory errors
        }
        
        if (attempt < maxRetries - 1) {
          // Table validation failed, retrying...
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
          console.error(`DBContext: Table ${tableName} validation failed after ${maxRetries} attempts.${tableList} Error:`, error);
        }
      }
    }
    return false;
  }

  async getTables(): Promise<string[]> {
    const conn = await this.connectWithSchema();
    try {
      // Query tables from the current schema only
      const schemaName = this.currentSchema || 'main';
      const result = await conn.query(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = '${schemaName}'
          AND table_type = 'BASE TABLE'
        ORDER BY table_name
      `);
      const tableNames: string[] = [];
      for (let i = 0; i < result.numRows; i++) {
        tableNames.push(result.getChildAt(0)?.get(i) as string);
      }
      
      // Retrieved tables from current schema
      return tableNames;
    } catch (error) {
      // Check if this is a memory access error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('memory access out of bounds')) {
        console.error('DBContext: Memory access error when retrieving tables');
        return []; // Return empty array on memory error
      }
      throw error;
    } finally {
      await conn.close();
    }
  }

  async getTableColumns(tableName: string): Promise<Array<{name: string; type: string}>> {
    if (!(await this.validateTable(tableName))) {
      throw new Error(`Table '${tableName}' does not exist or is not accessible`);
    }

    const conn = await this.connectWithSchema();
    try {
      const result = await conn.query(`DESCRIBE ${tableName}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return result.toArray().map((row: any) => ({
        name: row.column_name as string,
        type: row.column_type as string
      }));
    } catch (error) {
      // Check if this is a memory access error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('memory access out of bounds')) {
        console.error(`DBContext: Memory access error when describing table ${tableName}`);
        throw new Error(`Memory access error when accessing table '${tableName}'. The schema context may be corrupted.`);
      }
      throw error;
    } finally {
      await conn.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async executeQuery(sql: string): Promise<any[]> {
    // Executing query
    
    const conn = await this.connectWithSchema();
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
      
      // Query execution completed
      return data;
    } catch (error) {
      // Check if this is a memory access error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('memory access out of bounds')) {
        console.error('DBContext: Memory access error during query execution');
        throw new Error('Memory access error during query execution. The schema context may be corrupted.');
      }
      console.error('DBContext: Query failed:', sql, error);
      throw error;
    } finally {
      await conn.close();
    }
  }

  getSQLHistory(): SQLHistoryManager {
    return this.sqlHistory;
  }

  async dropTable(tableName: string): Promise<void> {
    const conn = await this.connectWithSchema();
    try {
      await conn.query(`DROP TABLE IF EXISTS "${tableName}"`);
      this.notifyTableChange();
    } finally {
      await conn.close();
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async describeTable(tableName: string): Promise<Array<{column_name: string; column_type: string; [key: string]: any}>> {
    const conn = await this.connectWithSchema();
    try {
      const result = await conn.query(`DESCRIBE "${tableName}"`);
      return result.toArray();
    } finally {
      await conn.close();
    }
  }
}

export function createDBContext(db: AsyncDuckDB): DBContext {
  return new DatabaseContext(db);
}