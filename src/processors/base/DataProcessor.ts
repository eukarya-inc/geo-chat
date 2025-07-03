import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { Table } from 'apache-arrow';

export interface ProcessorOptions {
  tableName?: string;
  schema?: Record<string, string>;
  batchSize?: number;
  onProgress?: (progress: number) => void;
}

export interface ProcessorResult {
  tableName: string;
  rowCount: number;
  columns: Array<{ name: string; type: string }>;
  processingTime: number;
  warnings?: string[];
}

export interface DataProcessor {
  /**
   * Name of the processor
   */
  name: string;
  
  /**
   * Supported file extensions
   */
  supportedExtensions: string[];
  
  /**
   * Supported MIME types
   */
  supportedMimeTypes: string[];
  
  /**
   * Check if this processor can handle the given data
   */
  canProcess(data: string | File | Blob | ArrayBuffer): boolean;
  
  /**
   * Process the data and load it into DuckDB
   */
  process(
    db: AsyncDuckDB,
    data: string | File | Blob | ArrayBuffer,
    options?: ProcessorOptions
  ): Promise<ProcessorResult>;
  
  /**
   * Validate data before processing
   */
  validate(data: string | File | Blob | ArrayBuffer): Promise<{ valid: boolean; errors?: string[] }>;
  
  /**
   * Preview data without loading into database
   */
  preview?(data: string | File | Blob | ArrayBuffer, limit?: number): Promise<Table>;
}

/**
 * Base class for data processors
 */
export abstract class BaseDataProcessor implements DataProcessor {
  abstract name: string;
  abstract supportedExtensions: string[];
  abstract supportedMimeTypes: string[];
  
  canProcess(data: string | File | Blob | ArrayBuffer): boolean {
    if (typeof data === 'string') {
      // Check if URL or file path matches extensions
      const lowerData = data.toLowerCase();
      return this.supportedExtensions.some(ext => lowerData.endsWith(ext));
    } else if (data instanceof File) {
      // Check file extension and MIME type
      const fileName = data.name.toLowerCase();
      const mimeType = data.type.toLowerCase();
      return (
        this.supportedExtensions.some(ext => fileName.endsWith(ext)) ||
        this.supportedMimeTypes.some(mime => mimeType.includes(mime))
      );
    }
    return false;
  }
  
  abstract process(
    db: AsyncDuckDB,
    data: string | File | Blob | ArrayBuffer,
    options?: ProcessorOptions
  ): Promise<ProcessorResult>;
  
  abstract validate(data: string | File | Blob | ArrayBuffer): Promise<{ valid: boolean; errors?: string[] }>;
  
  /**
   * Generate a valid table name from file name or URL
   */
  protected generateTableName(source: string, options?: ProcessorOptions): string {
    if (options?.tableName) {
      return options.tableName;
    }
    
    // Extract file name from URL or path
    const fileName = source.split('/').pop() || 'table';
    const baseName = fileName.split('.')[0];
    
    // Clean up name to be SQL-safe
    const cleanName = baseName.replace(/[^a-zA-Z0-9_]/g, '_');
    
    // Ensure it doesn't start with a number
    return /^\d/.test(cleanName) ? `t_${cleanName}` : cleanName;
  }
  
  /**
   * Report progress
   */
  protected reportProgress(current: number, total: number, options?: ProcessorOptions): void {
    if (options?.onProgress) {
      const progress = Math.round((current / total) * 100);
      options.onProgress(progress);
    }
  }
}