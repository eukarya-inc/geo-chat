import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { BaseDataProcessor, ProcessorOptions, ProcessorResult } from '../base/DataProcessor';

export class ParquetProcessor extends BaseDataProcessor {
  name = 'Parquet';
  supportedExtensions = ['.parquet', '.pq'];
  supportedMimeTypes = ['application/x-parquet', 'application/octet-stream'];
  
  async process(
    db: AsyncDuckDB,
    data: string | File | Blob | ArrayBuffer,
    options?: ProcessorOptions
  ): Promise<ProcessorResult> {
    const startTime = performance.now();
    const conn = await db.connect();
    
    try {
      let tableName: string;
      
      if (typeof data === 'string') {
        // URL or file path
        tableName = this.generateTableName(data, options);
        await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${data}'`);
      } else if (data instanceof File || data instanceof Blob) {
        // For File/Blob objects, we need to convert to data URL
        tableName = this.generateTableName(
          data instanceof File ? data.name : 'parquet_data',
          options
        );
        
        // Convert to base64 data URL
        const buffer = await data.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
        const dataUrl = `data:application/octet-stream;base64,${base64}`;
        
        // Create table from data URL
        await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${dataUrl}'`);
      } else if (data instanceof ArrayBuffer) {
        tableName = this.generateTableName('parquet_data', options);
        
        // Convert ArrayBuffer to base64 data URL
        const base64 = btoa(String.fromCharCode(...new Uint8Array(data)));
        const dataUrl = `data:application/octet-stream;base64,${base64}`;
        
        await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM '${dataUrl}'`);
      } else {
        throw new Error('Unsupported data type for Parquet processor');
      }
      
      // Get table info
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
      
      const processingTime = performance.now() - startTime;
      
      return {
        tableName,
        rowCount,
        columns,
        processingTime
      };
    } finally {
      await conn.close();
    }
  }
  
  async validate(data: string | File | Blob | ArrayBuffer): Promise<{ valid: boolean; errors?: string[] }> {
    const errors: string[] = [];
    
    if (typeof data === 'string') {
      // For URLs, check extension
      if (!this.canProcess(data)) {
        errors.push('File extension not supported');
      }
    } else if (data instanceof File || data instanceof Blob) {
      const blob = data instanceof File ? data : (data as Blob);
      
      // Check file size
      if (blob.size === 0) {
        errors.push('File is empty');
      }
      
      // Check magic bytes for Parquet
      try {
        const header = await blob.slice(0, 4).arrayBuffer();
        const magic = new Uint8Array(header);
        // Parquet files start with "PAR1"
        if (magic[0] !== 0x50 || magic[1] !== 0x41 || magic[2] !== 0x52 || magic[3] !== 0x31) {
          errors.push('Invalid Parquet file format (missing PAR1 magic bytes)');
        }
      } catch {
        errors.push('Failed to read file header');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}