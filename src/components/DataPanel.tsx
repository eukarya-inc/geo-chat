import { useState } from 'react';
import { useAppSelector, useAppDispatch } from '../store/hooks';
import { useDuckDB } from '../hooks/useDuckDB';
import { addDataset } from '../store/slices/dataSlice';
import { 
  analyzeGeoJSONProperties, 
  createGeoJSONTableSQL, 
  createGeoJSONInsertValues 
} from '../utils/dataProcessing';
import './DataPanel.css';

interface DataPanelProps {
  onClose: () => void;
}

function DataPanel({ onClose }: DataPanelProps) {
  const dispatch = useAppDispatch();
  const datasets = useAppSelector(state => state.data.datasets);
  const { isInitialized: duckdbReady, executeQuery, registerFileHandle } = useDuckDB();
  const [urlInput, setUrlInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const fileName = file.name;
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      let tableName = fileName.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      
      // Ensure table name doesn't start with a number
      if (/^\d/.test(tableName)) {
        tableName = `t_${tableName}`;
      }
      
      let query: string | null = '';
      
      if (fileExtension === 'geojson' || fileExtension === 'json') {
        // For GeoJSON, read the content and create table manually
        const text = await file.text();
        const geojsonData = JSON.parse(text);
        
        if (geojsonData.type !== 'FeatureCollection') {
          throw new Error('Invalid GeoJSON: Must be a FeatureCollection');
        }
        
        // Load spatial extension
        await executeQuery('INSTALL spatial; LOAD spatial;');
        
        // Analyze properties to determine fields
        const fields = analyzeGeoJSONProperties(geojsonData.features);
        
        // Create table with flattened properties
        const createTableSQL = createGeoJSONTableSQL(tableName, fields);
        await executeQuery(createTableSQL);
        
        // Insert features in batches
        const batchSize = 50;
        for (let i = 0; i < geojsonData.features.length; i += batchSize) {
          const batch = geojsonData.features.slice(i, i + batchSize);
          const values = createGeoJSONInsertValues(batch, fields);
          
          const columnNames = ['_geojson', ...fields.map((f: { name: string }) => `"${f.name}"`), 'geom'].join(', ');
          await executeQuery(`INSERT INTO ${tableName} (${columnNames}) VALUES ${values};`);
          
          // Log progress for large files
          if (geojsonData.features.length > 100 && i % 100 === 0) {
            console.log(`Inserted ${i + batch.length}/${geojsonData.features.length} features`);
          }
        }
        
        // Don't run the query below since we already created the table
        query = null;
      } else {
        // For CSV and Parquet, register the file
        await registerFileHandle(fileName, file);
        
        if (fileExtension === 'csv') {
          query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${fileName}');`;
        } else if (fileExtension === 'parquet') {
          query = `CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${fileName}');`;
        } else {
          throw new Error(`Unsupported file type: ${fileExtension}`);
        }
      }

      // Execute query only if we have one (not for GeoJSON)
      if (query) {
        await executeQuery(query);
      }
      
      // Get table info
      const columns = await executeQuery(`DESCRIBE ${tableName};`);
      const countResult = await executeQuery(`SELECT COUNT(*) as count FROM ${tableName};`);
      const rowCount = Number(countResult[0].count);

      dispatch(addDataset({
        id: crypto.randomUUID(),
        name: tableName,
        type: fileExtension || 'unknown',
        columns: columns.map((col: any) => ({
          name: col.column_name,
          type: col.column_type,
          isGeometry: col.column_name === 'geom' || col.column_type === 'GEOMETRY'
        })),
        rowCount,
        source: 'file'
      }));

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load file');
      console.error('File upload error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlLoad = async () => {
    if (!urlInput.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      // Validate URL
      try {
        new URL(urlInput);
      } catch {
        throw new Error(`Invalid URL: ${urlInput}`);
      }

      // Extract filename from URL
      const fileName = urlInput.split('/').pop() || 'remote_data';
      const fileExtension = fileName.split('.').pop()?.toLowerCase();
      let tableName = fileName.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');
      
      // Ensure table name doesn't start with a number
      if (/^\d/.test(tableName)) {
        tableName = `t_${tableName}`;
      }

      if (fileExtension === 'geojson' || fileExtension === 'json') {
        // For GeoJSON, fetch and process client-side
        const response = await fetch(urlInput);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        
        const geojsonData = await response.json();
        
        if (geojsonData.type !== 'FeatureCollection') {
          throw new Error('Invalid GeoJSON: Must be a FeatureCollection');
        }
        
        // Load spatial extension
        await executeQuery('INSTALL spatial; LOAD spatial;');
        
        // Analyze properties to determine fields
        const fields = analyzeGeoJSONProperties(geojsonData.features);
        
        // Create table with flattened properties
        const createTableSQL = createGeoJSONTableSQL(tableName, fields);
        await executeQuery(createTableSQL);
        
        // Insert features in batches
        const batchSize = 50;
        for (let i = 0; i < geojsonData.features.length; i += batchSize) {
          const batch = geojsonData.features.slice(i, i + batchSize);
          const values = createGeoJSONInsertValues(batch, fields);
          
          const columnNames = ['_geojson', ...fields.map((f: { name: string }) => `"${f.name}"`), 'geom'].join(', ');
          await executeQuery(`INSERT INTO ${tableName} (${columnNames}) VALUES ${values};`);
        }
      } else {
        // For CSV and Parquet, fetch and register as file
        const response = await fetch(urlInput);
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const file = new File([blob], fileName, { type: blob.type });
        
        // Register the file with DuckDB
        await registerFileHandle(fileName, file);
        
        let query = '';
        if (fileExtension === 'csv') {
          query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${fileName}');`;
        } else if (fileExtension === 'parquet') {
          query = `CREATE TABLE ${tableName} AS SELECT * FROM read_parquet('${fileName}');`;
        } else {
          throw new Error(`Unsupported file type: ${fileExtension}`);
        }
        
        await executeQuery(query);
      }
      
      // Get table info
      const columns = await executeQuery(`DESCRIBE ${tableName};`);
      const countResult = await executeQuery(`SELECT COUNT(*) as count FROM ${tableName};`);
      const rowCount = Number(countResult[0].count);

      dispatch(addDataset({
        id: crypto.randomUUID(),
        name: tableName,
        type: fileExtension || 'unknown',
        columns: columns.map((col: any) => ({
          name: col.column_name,
          type: col.column_type,
          isGeometry: col.column_name === 'geom' || col.column_type === 'GEOMETRY'
        })),
        rowCount,
        source: 'url'
      }));

      setUrlInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load URL');
      console.error('URL load error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="data-panel">
      <div className="data-panel-header">
        <h3>Data Management</h3>
        <button className="close-button" onClick={onClose}>×</button>
      </div>

      <div className="data-panel-content">
        {!duckdbReady ? (
          <div className="loading-message">
            Initializing database...
          </div>
        ) : (
          <>
            {error && (
              <div className="error-message">
                ❌ {error}
              </div>
            )}

            <div className="data-input-section">
              <div className="upload-area">
                <input
                  type="file"
                  id="file-upload"
                  accept=".csv,.geojson,.json,.parquet"
                  onChange={handleFileUpload}
                  disabled={isLoading}
                  className="file-input"
                />
                <label htmlFor="file-upload" className="upload-label">
                  <span>📁</span>
                  <span>{isLoading ? 'Processing...' : 'Drop files here or click to browse'}</span>
                  <span className="file-types">Supports: CSV, GeoJSON, Parquet</span>
                </label>
              </div>

              <div className="divider">
                <span>OR</span>
              </div>

              <div className="url-section">
                <div className="url-input-group">
                  <input
                    type="url"
                    value={urlInput || ''}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://example.com/data.csv"
                    disabled={isLoading}
                    className="url-input"
                    onKeyPress={(e) => e.key === 'Enter' && handleUrlLoad()}
                  />
                  <button 
                    onClick={handleUrlLoad}
                    disabled={isLoading || !urlInput.trim()}
                    className="load-button"
                  >
                    {isLoading ? 'Loading...' : 'Load from URL'}
                  </button>
                </div>
              </div>
            </div>

            <div className="datasets-section">
              <h4>Loaded Datasets</h4>
              {datasets.length === 0 ? (
                <p className="no-data">No datasets loaded yet</p>
              ) : (
                <div className="datasets-list">
                  {datasets.map(dataset => (
                    <div key={dataset.id} className="dataset-item">
                      <div className="dataset-name">{dataset.name}</div>
                      <div className="dataset-info">
                        <span>{dataset.type}</span>
                        <span>{dataset.rowCount} rows</span>
                        <span>{dataset.columns.length} columns</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default DataPanel;
