import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { Table, tableFromArrays, tableToIPC, tableFromIPC } from 'apache-arrow';

/**
 * Service for efficient data transfer between DuckDB and JavaScript using Apache Arrow
 */
export class ArrowService {
  private db: AsyncDuckDB;

  constructor(db: AsyncDuckDB) {
    this.db = db;
  }

  /**
   * Execute a query and return results as an Arrow Table
   */
  async queryAsArrow(query: string): Promise<Table> {
    const conn = await this.db.connect();
    try {
      const result = await conn.query(query);
      const data = result.toArray();
      
      // Convert to Arrow table
      if (data.length === 0) {
        return new Table();
      }
      
      // Extract columns and types
      const columns: Record<string, unknown[]> = {};
      const firstRow = data[0];
      
      for (const key of Object.keys(firstRow)) {
        columns[key] = data.map(row => row[key]);
      }
      
      return tableFromArrays(columns);
    } finally {
      await conn.close();
    }
  }

  /**
   * Execute a query with parameters and return results as an Arrow Table
   */
  async queryAsArrowWithParams(query: string, params: unknown[]): Promise<Table> {
    const conn = await this.db.connect();
    try {
      const stmt = await conn.prepare(query);
      const result = await stmt.query(...params);
      const data = result.toArray();
      
      // Convert to Arrow table
      if (data.length === 0) {
        return new Table();
      }
      
      // Extract columns and types
      const columns: Record<string, unknown[]> = {};
      const firstRow = data[0];
      
      for (const key of Object.keys(firstRow)) {
        columns[key] = data.map(row => row[key]);
      }
      
      return tableFromArrays(columns);
    } finally {
      await conn.close();
    }
  }

  /**
   * Load an Arrow Table into DuckDB
   */
  async loadArrowTable(tableName: string, arrowTable: Table): Promise<void> {
    const conn = await this.db.connect();
    try {
      // Convert Arrow table to JSON for DuckDB
      const data = arrowTable.toArray();
      const jsonData = data.map(row => row.toJSON());
      
      // Create table from JSON data
      if (jsonData.length > 0) {
        // Create table with first batch of data
        const columns = Object.keys(jsonData[0]);
        const values = jsonData.map(row => 
          `(${columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            return val;
          }).join(', ')})`
        ).join(', ');
        
        const columnDefs = columns.map(col => `${col} VARCHAR`).join(', ');
        
        await conn.query(`CREATE TABLE ${tableName} (${columnDefs})`);
        
        if (values) {
          await conn.query(`INSERT INTO ${tableName} VALUES ${values}`);
        }
      }
    } finally {
      await conn.close();
    }
  }

  /**
   * Stream large query results using Arrow
   */
  async *streamQueryResults(query: string, batchSize: number = 10000): AsyncGenerator<Table> {
    const conn = await this.db.connect();
    try {
      // Get total count
      const countQuery = `SELECT COUNT(*) as count FROM (${query}) t`;
      const countResult = await conn.query(countQuery);
      const totalRows = countResult.toArray()[0].count;

      // Stream in batches
      for (let offset = 0; offset < totalRows; offset += batchSize) {
        const batchQuery = `${query} LIMIT ${batchSize} OFFSET ${offset}`;
        const result = await conn.query(batchQuery);
        const data = result.toArray();
        
        if (data.length > 0) {
          const columns: Record<string, unknown[]> = {};
          const firstRow = data[0];
          
          for (const key of Object.keys(firstRow)) {
            columns[key] = data.map(row => row[key]);
          }
          
          yield tableFromArrays(columns);
        }
      }
    } finally {
      await conn.close();
    }
  }

  /**
   * Get table schema as Arrow schema
   */
  async getTableSchema(tableName: string): Promise<import('apache-arrow').Schema> {
    const conn = await this.db.connect();
    try {
      // Query just one row to get schema
      const result = await conn.query(`SELECT * FROM ${tableName} LIMIT 1`);
      const data = result.toArray();
      
      if (data.length === 0) {
        // Empty table, get schema from information_schema
        const schemaResult = await conn.query(`
          SELECT column_name, data_type 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}'
        `);
        const schemaData = schemaResult.toArray();
        const columns: Record<string, unknown[]> = {};
        
        for (const col of schemaData as { column_name: string }[]) {
          columns[col.column_name] = [];
        }
        
        return tableFromArrays(columns).schema;
      }
      
      const columns: Record<string, unknown[]> = {};
      const firstRow = data[0];
      
      for (const key of Object.keys(firstRow)) {
        columns[key] = [firstRow[key]];
      }
      
      return tableFromArrays(columns).schema;
    } finally {
      await conn.close();
    }
  }

  /**
   * Export table to Arrow IPC file format
   */
  async exportTableAsArrowIPC(tableName: string): Promise<Uint8Array> {
    const table = await this.queryAsArrow(`SELECT * FROM ${tableName}`);
    return new Uint8Array(tableToIPC(table));
  }

  /**
   * Import Arrow IPC file into DuckDB
   */
  async importArrowIPC(tableName: string, ipcData: Uint8Array): Promise<void> {
    const table = tableFromIPC(ipcData);
    await this.loadArrowTable(tableName, table);
  }
}