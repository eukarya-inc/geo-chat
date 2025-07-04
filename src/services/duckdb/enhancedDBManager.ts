import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { Table, tableToIPC } from 'apache-arrow';
import { ArrowService } from './arrowService';
import { GeoArrowService } from './geoArrowService';
import { getDBStateManager } from '../../lib/duckdb/dbStateManagerSingleton';
import type { DBStateManager } from '../../lib/duckdb/dbStateManager';

export interface QueryResult {
  arrow: Table;
  rowCount: number;
  columns: Array<{ name: string; type: string }>;
  executionTime: number;
}

/**
 * Enhanced DuckDB manager with Arrow integration
 */
export class EnhancedDBManager {
  private db: AsyncDuckDB;
  private arrowService: ArrowService;
  private geoArrowService: GeoArrowService;
  private stateManager: DBStateManager;
  private queryCache: Map<string, QueryResult>;

  constructor(db: AsyncDuckDB, stateManager?: DBStateManager) {
    this.db = db;
    this.stateManager = stateManager || getDBStateManager()!;
    this.arrowService = new ArrowService(db);
    this.geoArrowService = new GeoArrowService(db);
    this.queryCache = new Map();
  }

  /**
   * Execute query with caching and Arrow support
   */
  async executeQuery(query: string, useCache: boolean = true): Promise<QueryResult> {
    const cacheKey = query.trim().toLowerCase();
    
    // Check cache
    if (useCache && this.queryCache.has(cacheKey)) {
      console.log('Returning cached query result');
      return this.queryCache.get(cacheKey)!;
    }

    const startTime = performance.now();
    
    try {
      const arrow = await this.arrowService.queryAsArrow(query);
      const executionTime = performance.now() - startTime;

      const result: QueryResult = {
        arrow,
        rowCount: arrow.numRows,
        columns: arrow.schema.fields.map(field => ({
          name: field.name,
          type: field.type.toString()
        })),
        executionTime
      };

      // Cache the result
      if (useCache) {
        this.queryCache.set(cacheKey, result);
      }

      return result;
    } catch (error) {
      console.error('Query execution failed:', error);
      throw error;
    }
  }

  /**
   * Execute spatial query with GeoArrow support
   */
  async executeSpatialQuery(query: string): Promise<QueryResult> {
    const startTime = performance.now();
    const arrow = await this.geoArrowService.querySpatialAsGeoArrow(query);
    const executionTime = performance.now() - startTime;

    return {
      arrow,
      rowCount: arrow.numRows,
      columns: arrow.schema.fields.map(field => ({
        name: field.name,
        type: field.type.toString()
      })),
      executionTime
    };
  }

  /**
   * Load data from various sources with Arrow optimization
   */
  async loadData(source: string | File | Table, tableName: string): Promise<void> {
    if (source instanceof Table) {
      // Direct Arrow table load
      await this.arrowService.loadArrowTable(tableName, source);
    } else if (typeof source === 'string') {
      // URL or file path
      if (source.endsWith('.arrow') || source.endsWith('.ipc')) {
        // Load Arrow IPC file
        const response = await fetch(source);
        const buffer = await response.arrayBuffer();
        await this.arrowService.importArrowIPC(tableName, new Uint8Array(buffer));
      } else {
        // Use existing loading logic from thunks
        const conn = await this.db.connect();
        try {
          if (source.endsWith('.parquet')) {
            await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${source}'`);
          } else if (source.endsWith('.csv')) {
            await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${source}')`);
          }
        } finally {
          await conn.close();
        }
      }
    }

    // Notify state change
    this.stateManager.notifyTableChange();
    this.clearCache();
  }

  /**
   * Export table in various formats
   */
  async exportTable(tableName: string, format: 'arrow' | 'parquet' | 'csv'): Promise<Uint8Array> {
    switch (format) {
      case 'arrow':
        return this.arrowService.exportTableAsArrowIPC(tableName);
      
      case 'parquet': {
        const conn = await this.db.connect();
        try {
          await conn.query(`COPY ${tableName} TO 'export.parquet' (FORMAT PARQUET)`);
          // Note: In browser environment, we'd need to use DuckDB's export functionality
          // This is a simplified example
          throw new Error('Parquet export not yet implemented for browser');
        } finally {
          await conn.close();
        }
      }
      
      case 'csv': {
        const conn = await this.db.connect();
        try {
          const result = await conn.query(`SELECT * FROM ${tableName}`);
          // Convert to CSV (simplified)
          const csv = result.toArray().map(row => 
            Object.values(row).join(',')
          ).join('\n');
          return new TextEncoder().encode(csv);
        } finally {
          await conn.close();
        }
      }
      
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  /**
   * Get table statistics with Arrow
   */
  async getTableStats(tableName: string): Promise<{
    rowCount: number;
    sizeInBytes: number;
    columns: Array<{
      name: string;
      type: string;
      nullCount: number;
      distinctCount: number;
    }>;
  }> {
    const conn = await this.db.connect();
    try {
      // Get basic stats
      const statsResult = await conn.query(`
        SELECT COUNT(*) as row_count
        FROM ${tableName}
      `);
      const rowCount = statsResult.toArray()[0].row_count;

      // Get column stats
      const columnsResult = await conn.query(`
        SELECT 
          column_name,
          data_type
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
      `);

      const columns = await Promise.all(
        columnsResult.toArray().map(async (col: { column_name: string; data_type: string }) => {
          const nullResult = await conn.query(`
            SELECT COUNT(*) as null_count
            FROM ${tableName}
            WHERE ${col.column_name} IS NULL
          `);

          const distinctResult = await conn.query(`
            SELECT COUNT(DISTINCT ${col.column_name}) as distinct_count
            FROM ${tableName}
          `);

          return {
            name: col.column_name,
            type: col.data_type,
            nullCount: nullResult.toArray()[0].null_count,
            distinctCount: distinctResult.toArray()[0].distinct_count
          };
        })
      );

      // Estimate size (simplified)
      const arrow = await this.arrowService.queryAsArrow(`SELECT * FROM ${tableName} LIMIT 1000`);
      const arrowIPC = tableToIPC(arrow);
      const avgRowSize = arrowIPC.byteLength / Math.min(1000, rowCount);
      const estimatedSize = Math.round(avgRowSize * rowCount);

      return {
        rowCount,
        sizeInBytes: estimatedSize,
        columns
      };
    } finally {
      await conn.close();
    }
  }

  /**
   * Clear query cache
   */
  clearCache(): void {
    this.queryCache.clear();
  }

  /**
   * Get Arrow service for direct access
   */
  getArrowService(): ArrowService {
    return this.arrowService;
  }

  /**
   * Get GeoArrow service for spatial operations
   */
  getGeoArrowService(): GeoArrowService {
    return this.geoArrowService;
  }
}