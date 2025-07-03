import React, { useState } from 'react';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { useEnhancedDB } from '../hooks/useEnhancedDB';
import { executeArrowQuery, exportTable, loadTableStats } from '../store/thunks/arrowThunks';
import { tableFromIPC } from 'apache-arrow';

export function ArrowDemo() {
  const dispatch = useAppDispatch();
  const enhancedDB = useEnhancedDB();
  const { queryResults, activeQuery, exportStatus, tableStats } = useAppSelector(state => state.arrow);
  const { selectedTable } = useAppSelector(state => state.data);
  const [customQuery, setCustomQuery] = useState('');

  const handleExecuteQuery = () => {
    if (enhancedDB && customQuery) {
      dispatch(executeArrowQuery({ query: customQuery, dbManager: enhancedDB }));
    }
  };

  const handleExport = (format: 'arrow' | 'csv') => {
    if (enhancedDB && selectedTable) {
      dispatch(exportTable({ 
        tableName: selectedTable, 
        format, 
        dbManager: enhancedDB 
      })).then((result) => {
        if (exportTable.fulfilled.match(result)) {
          // Download the file
          const blob = new Blob([result.payload]);
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${selectedTable}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      });
    }
  };

  const handleLoadStats = () => {
    if (enhancedDB && selectedTable) {
      dispatch(loadTableStats({ tableName: selectedTable, dbManager: enhancedDB }));
    }
  };

  const getLatestQueryResult = () => {
    if (!customQuery || !queryResults[customQuery]) return null;
    
    const result = queryResults[customQuery];
    // Convert serialized data back to Arrow table
    const table = tableFromIPC(new Uint8Array(result.data));
    return { table, metadata: result.metadata };
  };

  const latestResult = getLatestQueryResult();
  const stats = selectedTable ? tableStats[selectedTable] : null;

  return (
    <div style={{ padding: '20px' }}>
      <h3>Arrow Integration Demo</h3>
      
      {/* Query Execution */}
      <div style={{ marginBottom: '20px' }}>
        <h4>Execute Arrow Query</h4>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="text"
            value={customQuery}
            onChange={(e) => setCustomQuery(e.target.value)}
            placeholder="Enter SQL query..."
            style={{ flex: 1, padding: '8px' }}
          />
          <button 
            onClick={handleExecuteQuery} 
            disabled={!enhancedDB || !customQuery || activeQuery?.isExecuting}
          >
            Execute
          </button>
        </div>
        
        {activeQuery?.error && (
          <div style={{ color: 'red', marginTop: '10px' }}>
            Error: {activeQuery.error}
          </div>
        )}
        
        {latestResult && (
          <div style={{ marginTop: '10px' }}>
            <strong>Results:</strong>
            <div>Rows: {latestResult.metadata.rowCount}</div>
            <div>Execution Time: {latestResult.metadata.executionTime.toFixed(2)}ms</div>
            <div>Columns: {latestResult.metadata.columns.map(c => c.name).join(', ')}</div>
          </div>
        )}
      </div>

      {/* Export Options */}
      {selectedTable && (
        <div style={{ marginBottom: '20px' }}>
          <h4>Export Table: {selectedTable}</h4>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button 
              onClick={() => handleExport('arrow')}
              disabled={!enhancedDB || exportStatus.isExporting}
            >
              Export as Arrow
            </button>
            <button 
              onClick={() => handleExport('csv')}
              disabled={!enhancedDB || exportStatus.isExporting}
            >
              Export as CSV
            </button>
          </div>
          
          {exportStatus.isExporting && (
            <div>Exporting {exportStatus.format}...</div>
          )}
          
          {exportStatus.error && (
            <div style={{ color: 'red' }}>Export Error: {exportStatus.error}</div>
          )}
        </div>
      )}

      {/* Table Statistics */}
      {selectedTable && (
        <div>
          <h4>Table Statistics: {selectedTable}</h4>
          <button onClick={handleLoadStats} disabled={!enhancedDB}>
            Load Statistics
          </button>
          
          {stats && (
            <div style={{ marginTop: '10px' }}>
              <div>Row Count: {stats.rowCount.toLocaleString()}</div>
              <div>Estimated Size: {(stats.sizeInBytes / 1024 / 1024).toFixed(2)} MB</div>
              <h5>Column Statistics:</h5>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '5px', borderBottom: '1px solid #ddd' }}>Column</th>
                    <th style={{ textAlign: 'left', padding: '5px', borderBottom: '1px solid #ddd' }}>Type</th>
                    <th style={{ textAlign: 'right', padding: '5px', borderBottom: '1px solid #ddd' }}>Null Count</th>
                    <th style={{ textAlign: 'right', padding: '5px', borderBottom: '1px solid #ddd' }}>Distinct Count</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.columns.map((col, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '5px' }}>{col.name}</td>
                      <td style={{ padding: '5px' }}>{col.type}</td>
                      <td style={{ padding: '5px', textAlign: 'right' }}>{col.nullCount.toLocaleString()}</td>
                      <td style={{ padding: '5px', textAlign: 'right' }}>{col.distinctCount.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}