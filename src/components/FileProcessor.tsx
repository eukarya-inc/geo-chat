import React, { useState, useCallback, useEffect } from 'react';
import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { processFile, processURL, processBatch } from '../store/thunks/processorThunks';
import { processorRegistry } from '../processors/ProcessorRegistry';
import { removeJob } from '../store/slices/processorSlice';

interface FileProcessorProps {
  db?: AsyncDuckDB;
  onTableCreated?: (tableName: string) => void;
}

export function FileProcessor({ db: propDb, onTableCreated }: FileProcessorProps = {}) {
  const dispatch = useAppDispatch();
  const { connection: storeDb } = useAppSelector(state => state.duckdb);
  const db = propDb || storeDb; // Use prop db if provided, otherwise use store db
  const { jobs } = useAppSelector(state => state.processor);
  const [urlInput, setUrlInput] = useState('');
  const [dragActive, setDragActive] = useState(false);

  const supportedExtensions = processorRegistry.getSupportedExtensions().join(', ');

  // Monitor jobs for completion and call onTableCreated
  useEffect(() => {
    if (!onTableCreated) return;

    const completedJobs = Object.values(jobs).filter(job => job.status === 'completed');
    const latestCompletedJob = completedJobs[completedJobs.length - 1];
    
    if (latestCompletedJob?.result?.tableName) {
      onTableCreated(latestCompletedJob.result.tableName);
    }
  }, [jobs, onTableCreated]);

  const handleFiles = useCallback((files: FileList) => {
    if (!db) return;
    
    const fileArray = Array.from(files);
    
    if (fileArray.length === 1) {
      dispatch(processFile({ file: fileArray[0], db }));
    } else {
      dispatch(processBatch({ files: fileArray, db }));
    }
  }, [db, dispatch]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  }, [handleFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files);
    }
  }, [handleFiles]);

  const handleURLSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!db || !urlInput) return;
    
    dispatch(processURL({ url: urlInput, db }));
    setUrlInput('');
  }, [db, urlInput, dispatch]);

  const handleRemoveJob = useCallback((jobId: string) => {
    dispatch(removeJob(jobId));
  }, [dispatch]);

  const jobList = Object.values(jobs).sort((a, b) => b.startTime - a.startTime);

  return (
    <div style={{ padding: '20px' }}>
      <h3>File Processor</h3>
      
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        style={{
          border: `2px dashed ${dragActive ? '#007bff' : '#ccc'}`,
          borderRadius: '8px',
          padding: '40px',
          textAlign: 'center',
          marginBottom: '20px',
          backgroundColor: dragActive ? '#f0f8ff' : '#f9f9f9',
          transition: 'all 0.3s ease'
        }}
      >
        <p>Drag and drop files here or click to browse</p>
        <p style={{ fontSize: '12px', color: '#666' }}>
          Supported formats: {supportedExtensions}
        </p>
        <input
          type="file"
          multiple
          accept={supportedExtensions}
          onChange={handleFileInput}
          style={{ display: 'none' }}
          id="file-input"
        />
        <label
          htmlFor="file-input"
          style={{
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'inline-block',
            marginTop: '10px'
          }}
        >
          Choose Files
        </label>
      </div>

      {/* URL Input */}
      <form onSubmit={handleURLSubmit} style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Enter file URL..."
            style={{
              flex: 1,
              padding: '8px',
              border: '1px solid #ddd',
              borderRadius: '4px'
            }}
          />
          <button
            type="submit"
            disabled={!db || !urlInput}
            style={{
              padding: '8px 16px',
              backgroundColor: '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Process URL
          </button>
        </div>
      </form>

      {/* Processing Jobs */}
      <div>
        <h4>Processing Jobs</h4>
        {jobList.length === 0 ? (
          <p style={{ color: '#666' }}>No processing jobs yet</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {jobList.map(job => (
              <div
                key={job.id}
                style={{
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  padding: '15px',
                  backgroundColor: '#f9f9f9'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{job.fileName}</strong>
                    <span style={{ marginLeft: '10px', color: '#666' }}>
                      ({job.processor})
                    </span>
                  </div>
                  <button
                    onClick={() => handleRemoveJob(job.id)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '12px',
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '3px',
                      cursor: 'pointer'
                    }}
                  >
                    Remove
                  </button>
                </div>
                
                <div style={{ marginTop: '10px' }}>
                  {job.status === 'processing' && (
                    <div>
                      <div style={{
                        width: '100%',
                        backgroundColor: '#e0e0e0',
                        borderRadius: '4px',
                        overflow: 'hidden'
                      }}>
                        <div
                          style={{
                            width: `${job.progress}%`,
                            height: '20px',
                            backgroundColor: '#007bff',
                            transition: 'width 0.3s ease'
                          }}
                        />
                      </div>
                      <span style={{ fontSize: '12px', color: '#666' }}>
                        {job.progress}% complete
                      </span>
                    </div>
                  )}
                  
                  {job.status === 'completed' && job.result && (
                    <div style={{ color: '#28a745' }}>
                      ✓ Completed in {job.result.processingTime.toFixed(0)}ms
                      <br />
                      Table: {job.result.tableName} ({job.result.rowCount} rows, {job.result.columns.length} columns)
                    </div>
                  )}
                  
                  {job.status === 'failed' && (
                    <div style={{ color: '#dc3545' }}>
                      ✗ Failed: {job.error}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}