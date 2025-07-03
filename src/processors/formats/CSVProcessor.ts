import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { BaseDataProcessor, ProcessorOptions, ProcessorResult } from '../base/DataProcessor';

export class CSVProcessor extends BaseDataProcessor {
  name = 'CSV';
  supportedExtensions = ['.csv', '.tsv'];
  supportedMimeTypes = ['text/csv', 'text/tab-separated-values'];
  
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
        const delimiter = data.toLowerCase().endsWith('.tsv') ? '\t' : ',';
        const query = `
          CREATE TABLE ${tableName} AS 
          SELECT * FROM read_csv_auto('${data}', delim='${delimiter}')
        `;
        await conn.query(query);
      } else if (data instanceof File) {
        // File object - need to read content and save to temp file
        tableName = this.generateTableName(data.name, options);
        const content = await data.text();
        const delimiter = data.name.toLowerCase().endsWith('.tsv') ? '\t' : ',';
        
        // For now, we'll parse CSV manually and insert
        // In a real implementation, we'd use DuckDB's file system API
        const lines = content.split('\n').filter(line => line.trim());
        if (lines.length === 0) {
          throw new Error('Empty CSV file');
        }
        
        // Parse header
        const headers = lines[0].split(delimiter).map(h => h.trim().replace(/"/g, ''));
        const columnDefs = headers.map(h => `"${h}" VARCHAR`).join(', ');
        
        // Create table
        await conn.query(`CREATE TABLE ${tableName} (${columnDefs})`);
        
        // Insert data in batches
        const batchSize = options?.batchSize || 100;
        for (let i = 1; i < lines.length; i += batchSize) {
          const batch = lines.slice(i, Math.min(i + batchSize, lines.length));
          
          for (const line of batch) {
            const values = line.split(delimiter).map(v => {
              v = v.trim().replace(/^"/, '').replace(/"$/, '');
              return v === '' ? 'NULL' : `'${v.replace(/'/g, "''")}'`;
            }).join(', ');
            
            if (values) {
              await conn.query(`INSERT INTO ${tableName} VALUES (${values})`);
            }
          }
          
          this.reportProgress(i + batch.length - 1, lines.length - 1, options);
        }
      } else {
        throw new Error('Unsupported data type for CSV processor');
      }
      
      // Get table info
      const infoResult = await conn.query(`
        SELECT COUNT(*) as row_count FROM ${tableName}
      `);
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
      // For URLs, we assume they're valid if they have the right extension
      if (!this.canProcess(data)) {
        errors.push('File extension not supported');
      }
    } else if (data instanceof File) {
      // Check file size
      if (data.size === 0) {
        errors.push('File is empty');
      }
      if (data.size > 500 * 1024 * 1024) { // 500MB limit
        errors.push('File size exceeds 500MB limit');
      }
      
      // Try to read first few lines
      try {
        const text = await data.slice(0, 1024).text();
        if (!text.includes(',') && !text.includes('\t')) {
          errors.push('No delimiter (comma or tab) found in file');
        }
      } catch {
        errors.push('Failed to read file content');
      }
    }
    
    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }
}