import { createAsyncThunk } from '@reduxjs/toolkit';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { processorRegistry } from '../../processors/ProcessorRegistry';
import type { ProcessorOptions } from '../../processors/base/DataProcessor';
import {
  startProcessing,
  updateProgress,
  completeProcessing,
  failProcessing
} from '../slices/processorSlice';
import { loadTables } from './dataThunks';

/**
 * Process a file using the appropriate processor
 */
export const processFile = createAsyncThunk<
  void,
  {
    file: File;
    db: AsyncDuckDB;
    options?: ProcessorOptions;
  },
  { rejectValue: string }
>(
  'processor/processFile',
  async ({ file, db, options }, { dispatch, rejectWithValue }) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Find appropriate processor
    const processor = processorRegistry.findProcessor(file);
    if (!processor) {
      return rejectWithValue(`No processor found for file: ${file.name}`);
    }
    
    dispatch(startProcessing({
      id: jobId,
      fileName: file.name,
      processor: processor.name
    }));
    
    try {
      // Validate file first
      const validation = await processor.validate(file);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors?.join(', ')}`);
      }
      
      // Process with progress tracking
      const processingOptions: ProcessorOptions = {
        ...options,
        onProgress: (progress) => {
          dispatch(updateProgress({ id: jobId, progress }));
        }
      };
      
      const result = await processor.process(db, file, processingOptions);
      
      dispatch(completeProcessing({ id: jobId, result }));
      
      // Refresh table list
      dispatch(loadTables({ db }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      dispatch(failProcessing({ id: jobId, error: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Process a URL using the appropriate processor
 */
export const processURL = createAsyncThunk<
  void,
  {
    url: string;
    db: AsyncDuckDB;
    options?: ProcessorOptions;
  },
  { rejectValue: string }
>(
  'processor/processURL',
  async ({ url, db, options }, { dispatch, rejectWithValue }) => {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const fileName = url.split('/').pop() || 'remote_file';
    
    // Find appropriate processor
    const processor = processorRegistry.findProcessor(url);
    if (!processor) {
      return rejectWithValue(`No processor found for URL: ${url}`);
    }
    
    dispatch(startProcessing({
      id: jobId,
      fileName,
      processor: processor.name
    }));
    
    try {
      // Process with progress tracking
      const processingOptions: ProcessorOptions = {
        ...options,
        onProgress: (progress) => {
          dispatch(updateProgress({ id: jobId, progress }));
        }
      };
      
      const result = await processor.process(db, url, processingOptions);
      
      dispatch(completeProcessing({ id: jobId, result }));
      
      // Refresh table list
      dispatch(loadTables({ db }));
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Processing failed';
      dispatch(failProcessing({ id: jobId, error: errorMessage }));
      return rejectWithValue(errorMessage);
    }
  }
);

/**
 * Process multiple files in parallel
 */
export const processBatch = createAsyncThunk<
  void,
  {
    files: File[];
    db: AsyncDuckDB;
    options?: ProcessorOptions;
  },
  { rejectValue: string }
>(
  'processor/processBatch',
  async ({ files, db, options }, { dispatch }) => {
    const promises = files.map(file => 
      dispatch(processFile({ file, db, options }))
    );
    
    await Promise.allSettled(promises);
  }
);

/**
 * Validate a file without processing
 */
export const validateFile = createAsyncThunk<
  { valid: boolean; errors?: string[] },
  { file: File },
  { rejectValue: string }
>(
  'processor/validateFile',
  async ({ file }, { rejectWithValue }) => {
    const processor = processorRegistry.findProcessor(file);
    if (!processor) {
      return rejectWithValue(`No processor found for file: ${file.name}`);
    }
    
    try {
      return await processor.validate(file);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return rejectWithValue(errorMessage);
    }
  }
);