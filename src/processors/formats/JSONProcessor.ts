import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { BaseDataProcessor, ProcessorOptions, ProcessorResult } from '../base/DataProcessor';

export class JSONProcessor extends BaseDataProcessor {
  name = 'JSON';
  supportedExtensions = ['.json'];
  supportedMimeTypes = ['application/json'];
  
  async process(
    db: AsyncDuckDB,
    data: string | File | Blob | ArrayBuffer,
    options?: ProcessorOptions
  ): Promise<ProcessorResult> {
    const startTime = performance.now();
    const conn = await db.connect();
    
    try {
      let jsonData: unknown;
      let tableName: string;
      
      if (typeof data === 'string') {
        // URL or JSON string
        tableName = this.generateTableName(data, options);
        
        if (data.startsWith('http://') || data.startsWith('https://')) {
          // It's a URL
          const response = await fetch(data);
          if (!response.ok) {
            throw new Error(`Failed to fetch JSON: ${response.status} ${response.statusText}`);
          }
          jsonData = await response.json();
        } else {
          // Try to parse as JSON directly
          try {
            jsonData = JSON.parse(data);
          } catch {
            // Assume it's a file path
            await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM read_json_auto('${data}')`);
            
            // Get table info and return
            const infoResult = await conn.query(`SELECT COUNT(*) as row_count FROM ${tableName}`);
            const rowCount = infoResult.toArray()[0].row_count;
            
            const columnsResult = await conn.query(`
              SELECT column_name, data_type
              FROM information_schema.columns
              WHERE table_name = '${tableName}'
            `);
            
            const columns = columnsResult.toArray().map((col: { column_name: string; data_type: string }) => ({
              name: col.column_name,
              type: col.data_type
            }));
            
            return {
              tableName,
              rowCount,
              columns,
              processingTime: performance.now() - startTime
            };
          }
        }
      } else if (data instanceof File || data instanceof Blob) {
        tableName = this.generateTableName(
          data instanceof File ? data.name : 'json_data',
          options
        );
        const text = await data.text();
        jsonData = JSON.parse(text);
      } else {
        throw new Error('Unsupported data type for JSON processor');
      }
      
      // Determine if it's an array or object
      const isArray = Array.isArray(jsonData);
      let records: Record<string, unknown>[];
      
      if (isArray) {
        records = jsonData as Record<string, unknown>[];
      } else {
        // Single object - wrap in array
        records = [jsonData as Record<string, unknown>];
      }
      
      if (records.length === 0) {
        throw new Error('No data found in JSON');
      }
      
      // Infer schema from first record
      const firstRecord = records[0];
      const columns = Object.keys(firstRecord).map(key => {
        const value = firstRecord[key];
        let type = 'VARCHAR';
        
        if (typeof value === 'number') {
          type = Number.isInteger(value) ? 'INTEGER' : 'DOUBLE';
        } else if (typeof value === 'boolean') {
          type = 'BOOLEAN';
        } else if (value instanceof Date) {
          type = 'TIMESTAMP';
        } else if (typeof value === 'object' && value !== null) {
          type = 'JSON';
        }
        
        return { name: key, type };
      });
      
      // Create table
      const columnDefs = columns.map(col => `"${col.name}" ${col.type}`).join(', ');
      await conn.query(`CREATE TABLE ${tableName} (${columnDefs})`);
      
      // Insert data in batches
      const batchSize = options?.batchSize || 100;
      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        for (const record of batch) {
          const values = columns.map(col => {
            const value = record[col.name];
            
            if (value === null || value === undefined) {
              return 'NULL';
            } else if (col.type === 'JSON' || typeof value === 'object') {
              return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
            } else if (typeof value === 'string') {
              return `'${value.replace(/'/g, "''")}'`;
            } else {
              return value;
            }
          }).join(', ');
          
          await conn.query(`INSERT INTO ${tableName} VALUES (${values})`);
        }
        
        this.reportProgress(Math.min(i + batchSize, records.length), records.length, options);
      }
      
      const processingTime = performance.now() - startTime;
      
      return {
        tableName,
        rowCount: records.length,
        columns,
        processingTime
      };
    } finally {
      await conn.close();
    }
  }
  
  async validate(data: string | File | Blob | ArrayBuffer): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    
    try {
      if (typeof data === 'string') {
        // Check if it's a URL
        if (data.startsWith('http://') || data.startsWith('https://')) {
          // Can't validate URL without fetching
          return { valid: true };
        }
        
        // Try to parse as JSON
        try {
          JSON.parse(data);
        } catch {
          // Might be a file path, which is okay
          if (!data.endsWith('.json')) {
            errors.push('String is not valid JSON and does not have .json extension');
          }
        }
      } else if (data instanceof File || data instanceof Blob) {
        const text = await data.text();
        try {
          const parsed = JSON.parse(text);
          
          // Check if it's array or object
          if (Array.isArray(parsed)) {
            if (parsed.length === 0) {
              errors.push('JSON array is empty');
            } else if (typeof parsed[0] !== 'object') {
              errors.push('JSON array must contain objects');
            }
          } else if (typeof parsed !== 'object' || parsed === null) {
            errors.push('JSON must be an object or array of objects');
          }
        } catch (e) {
          errors.push('Invalid JSON format: ' + (e instanceof Error ? e.message : String(e)));
        }
      } else {
        errors.push('Unsupported data type');
      }
    } catch (e) {
      errors.push('Validation error: ' + (e instanceof Error ? e.message : String(e)));
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}