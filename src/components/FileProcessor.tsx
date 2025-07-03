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
  const activeJobs = jobList.filter(job => job.status === 'processing');
  const recentJobs = jobList.filter(job => job.status !== 'processing').slice(0, 3);

  return (
    <div style={{ fontSize: '13px' }}>
      {/* Compact single-line input section */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        {/* Compact file drop/select button */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            position: 'relative',
            display: 'inline-block'
          }}
        >
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
              display: 'inline-block',
              padding: '6px 12px',
              backgroundColor: dragActive ? '#0056b3' : '#007bff',
              color: 'white',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              transition: 'background-color 0.2s'
            }}
          >
            📁 {dragActive ? 'Drop here' : 'Choose files'}
          </label>
        </div>

        {/* URL Input - inline and compact */}
        <form onSubmit={handleURLSubmit} style={{ 
          display: 'flex', 
          gap: '5px',
          flex: 1
        }}>
          <input
            type="url"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            placeholder="Or paste URL..."
            style={{
              flex: 1,
              padding: '6px 10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '13px'
            }}
          />
          <button
            type="submit"
            disabled={!db || !urlInput}
            style={{
              padding: '6px 12px',
              backgroundColor: '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '13px',
              opacity: !db || !urlInput ? 0.6 : 1
            }}
          >
            Load
          </button>
        </form>
      </div>

      {/* Active Jobs - only show if processing */}
      {activeJobs.length > 0 && (
        <div style={{ marginBottom: '8px' }}>
          {activeJobs.map(job => (
            <div key={job.id} style={{ marginBottom: '4px' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '12px'
              }}>
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  🔄 {job.fileName}
                </span>
                <div style={{
                  width: '80px',
                  height: '4px',
                  backgroundColor: '#e0e0e0',
                  borderRadius: '2px',
                  overflow: 'hidden'
                }}>
                  <div
                    style={{
                      width: `${job.progress}%`,
                      height: '100%',
                      backgroundColor: '#007bff',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
                <span style={{ fontSize: '11px', color: '#666', minWidth: '35px' }}>
                  {job.progress}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent completed/failed jobs - very compact */}
      {recentJobs.length > 0 && (
        <div style={{ fontSize: '12px', color: '#666' }}>
          {recentJobs.map(job => (
            <div 
              key={job.id} 
              style={{ 
                display: 'flex', 
                alignItems: 'center',
                gap: '8px',
                marginBottom: '2px'
              }}
            >
              <span style={{ minWidth: '14px' }}>
                {job.status === 'completed' ? '✓' : '✗'}
              </span>
              <span style={{
                flex: 1,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: job.status === 'completed' ? '#28a745' : '#dc3545'
              }}>
                {job.fileName}
                {job.status === 'completed' && job.result && (
                  <span style={{ color: '#666', marginLeft: '5px' }}>
                    ({job.result.rowCount} rows)
                  </span>
                )}
              </span>
              <button
                onClick={() => handleRemoveJob(job.id)}
                style={{
                  padding: '0 4px',
                  fontSize: '11px',
                  backgroundColor: 'transparent',
                  color: '#999',
                  border: 'none',
                  cursor: 'pointer'
                }}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}