import { DataProcessor } from './base/DataProcessor';
import { CSVProcessor } from './formats/CSVProcessor';
import { ParquetProcessor } from './formats/ParquetProcessor';
import { GeoJSONProcessor } from './formats/GeoJSONProcessor';
import { JSONProcessor } from './formats/JSONProcessor';

/**
 * Registry for data processors
 */
export class ProcessorRegistry {
  private processors: Map<string, DataProcessor> = new Map();
  
  constructor() {
    // Register default processors
    this.registerProcessor(new CSVProcessor());
    this.registerProcessor(new ParquetProcessor());
    this.registerProcessor(new GeoJSONProcessor());
    this.registerProcessor(new JSONProcessor());
  }
  
  /**
   * Register a new processor
   */
  registerProcessor(processor: DataProcessor): void {
    this.processors.set(processor.name, processor);
    console.log(`Registered processor: ${processor.name}`);
  }
  
  /**
   * Get processor by name
   */
  getProcessor(name: string): DataProcessor | undefined {
    return this.processors.get(name);
  }
  
  /**
   * Get all registered processors
   */
  getAllProcessors(): DataProcessor[] {
    return Array.from(this.processors.values());
  }
  
  /**
   * Find processor that can handle the given data
   */
  findProcessor(data: string | File | Blob | ArrayBuffer): DataProcessor | undefined {
    for (const processor of this.processors.values()) {
      if (processor.canProcess(data)) {
        return processor;
      }
    }
    return undefined;
  }
  
  /**
   * Get processor for file extension
   */
  getProcessorForExtension(extension: string): DataProcessor | undefined {
    const normalizedExt = extension.toLowerCase();
    
    for (const processor of this.processors.values()) {
      if (processor.supportedExtensions.includes(normalizedExt)) {
        return processor;
      }
    }
    return undefined;
  }
  
  /**
   * Get processor for MIME type
   */
  getProcessorForMimeType(mimeType: string): DataProcessor | undefined {
    const normalizedType = mimeType.toLowerCase();
    
    for (const processor of this.processors.values()) {
      if (processor.supportedMimeTypes.some(type => normalizedType.includes(type))) {
        return processor;
      }
    }
    return undefined;
  }
  
  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    const extensions = new Set<string>();
    
    for (const processor of this.processors.values()) {
      processor.supportedExtensions.forEach(ext => extensions.add(ext));
    }
    
    return Array.from(extensions);
  }
  
  /**
   * Get supported MIME types
   */
  getSupportedMimeTypes(): string[] {
    const mimeTypes = new Set<string>();
    
    for (const processor of this.processors.values()) {
      processor.supportedMimeTypes.forEach(type => mimeTypes.add(type));
    }
    
    return Array.from(mimeTypes);
  }
}

// Global instance
export const processorRegistry = new ProcessorRegistry();