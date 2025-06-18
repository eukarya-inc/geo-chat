import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useState } from 'react';

interface RemoteFileProps {
    db: AsyncDuckDB;
    onTableCreated?: (tableName: string) => void;
}

const RemoteFile: React.FC<RemoteFileProps> = ({ db, onTableCreated }) => {
    const [url, setUrl] = useState<string>('');
    const [isCreatingTable, setIsCreatingTable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [show, setShow] = useState(false);

    const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(event.target.value);
    };

    const createTableFromUrl = async () => {
        console.log('RemoteFile: createTableFromUrl called with:', { db: !!db, url: url.trim() });
        if (!db || !url.trim()) {
            console.log('RemoteFile: Early return - missing db or url');
            return;
        }

        console.log('RemoteFile: Starting table creation process for URL:', url);
        setIsCreatingTable(true);
        document.body.classList.add('creating-table');
        let conn = null;

        try {
            console.log('RemoteFile: Database instance ID:', (db as { __instanceId?: string }).__instanceId || 'no-id');
            conn = await db.connect();
            await conn.query('LOAD spatial;');
            
            // Load httpfs extension for HTTP access
            try {
                await conn.query("INSTALL httpfs;");
                await conn.query("LOAD httpfs;");
            } catch (httpfsError) {
                console.warn('Could not load httpfs extension:', httpfsError);
            }

            // URLからファイル名を抽出
            const fileName = url.split('/').pop() || 'remote_file';
            let tableName = fileName.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');
            if (/^\d/.test(tableName)) {
                tableName = `t_${tableName}`;
            }

            const isParquet = url.toLowerCase().endsWith('.parquet');
            const isGeoJSON = url.toLowerCase().endsWith('.geojson') || url.toLowerCase().endsWith('.json') || url.includes('geojson');
            
            let query;
            if (isParquet) {
                query = `CREATE TABLE ${tableName} AS SELECT * FROM '${url}'`;
            } else if (isGeoJSON) {
                // For GeoJSON, fetch the data client-side first to avoid DuckDB URL issues
                console.log('RemoteFile: Fetching GeoJSON data from:', url);
                const response = await fetch(url);
                if (!response.ok) {
                    throw new Error(`Failed to fetch GeoJSON: ${response.status} ${response.statusText}`);
                }
                console.log('RemoteFile: Fetch successful, parsing response...');
                const geojsonText = await response.text();
                console.log('RemoteFile: Response text length:', geojsonText.length);
                
                // Parse the GeoJSON to validate it
                const geojsonData = JSON.parse(geojsonText);
                console.log('RemoteFile: JSON parsed successfully, type:', geojsonData.type);
                if (geojsonData.type !== 'FeatureCollection') {
                    throw new Error('Invalid GeoJSON: Must be a FeatureCollection');
                }
                
                console.log(`RemoteFile: Loaded GeoJSON with ${geojsonData.features?.length || 0} features`);
                
                // Create table directly without temp table for now
                console.log('RemoteFile: Creating table schema...');
                await conn.query(`CREATE TABLE ${tableName} (properties JSON, geom GEOMETRY);`);
                console.log('RemoteFile: Table schema created successfully');
                
                // Insert features one by one to avoid JSON parsing issues
                console.log('RemoteFile: Starting feature insertion...');
                for (let i = 0; i < geojsonData.features.length; i++) {
                    if (i % 50 === 0) {
                        console.log(`RemoteFile: Inserting feature ${i + 1}/${geojsonData.features.length}`);
                    }
                    
                    const feature = geojsonData.features[i];
                    const propertiesJson = JSON.stringify(feature.properties || {});
                    const geometryJson = JSON.stringify(feature.geometry);
                    
                    try {
                        await conn.query(`
                            INSERT INTO ${tableName} (properties, geom) 
                            VALUES (
                                '${propertiesJson.replace(/'/g, "''")}',
                                ST_GeomFromGeoJSON('${geometryJson.replace(/'/g, "''")}')
                            )
                        `);
                    } catch (insertError) {
                        console.error(`RemoteFile: Error inserting feature ${i}:`, insertError);
                        console.error('RemoteFile: Feature data:', feature);
                        throw insertError;
                    }
                }
                console.log('RemoteFile: Feature insertion completed');
                
                // Skip the main query since we already created and populated the table
                query = null;
            } else {
                // Try direct st_read for other formats
                query = `CREATE TABLE ${tableName} AS SELECT * FROM st_read('${url}')`;
            }

            if (query) {
                await conn.query(query);
            }
            await conn.query(`CREATE INDEX ${tableName}_idx ON ${tableName} USING RTREE (geom);`);
            await conn.query('CHECKPOINT;');

            console.log('Table created and checkpoint executed:', tableName);
            
            // Verify table was created by checking if it exists
            try {
                const tableCheck = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const rowCount = tableCheck.toArray()[0].count;
                console.log(`RemoteFile: Table ${tableName} verified with ${rowCount} rows`);
            } catch (verifyError) {
                console.error('RemoteFile: Error verifying table:', verifyError);
            }
            
            setError(null);
            setUrl(''); // 入力をクリア
            console.log('RemoteFile: Calling onTableCreated callback with tableName:', tableName);
            onTableCreated?.(tableName);
            
            // Debug: Check what tables actually exist
            try {
                const debugConn = await db.connect();
                const tablesResult = await debugConn.query('SHOW TABLES;');
                console.log('RemoteFile: Tables in database after creation:', tablesResult.toArray());
                
                // Check the actual row count
                const countResult = await debugConn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const actualCount = countResult.toArray()[0]?.count;
                console.log(`RemoteFile: Actual row count in ${tableName}:`, actualCount);
                
                await debugConn.close();
            } catch (debugError) {
                console.error('RemoteFile: Error during debug check:', debugError);
            }
        } catch (err) {
            console.error('Query error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
            if (conn) {
                await conn.close();
            }
            setIsCreatingTable(false);
            document.body.classList.remove('creating-table');
        }
    };

    return (
        <div className="remote-file">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <h3 style={{ margin: 0 }}>Remote File</h3>
                <button onClick={() => setShow(!show)} disabled={!db}>
                    {show ? '隠す' : '表示'}
                </button>
            </div>

            {show && (
                <div
                    style={{
                        backgroundColor: '#f5f5f5',
                        padding: '10px',
                        borderRadius: '4px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px',
                    }}
                >
                    <div className="file-upload">
                        <input
                            type="url"
                            value={url}
                            onChange={handleUrlChange}
                            placeholder="Enter file URL (.parquet, .geojson, .shp)"
                            style={{ flex: 1, padding: '0.5em' }}
                        />
                        <button onClick={createTableFromUrl} disabled={!db || !url.trim() || isCreatingTable}>
                            {isCreatingTable ? 'テーブル作成中...' : 'Create Table from URL'}
                        </button>
                    </div>
                    {isCreatingTable && <div style={{ color: '#0066cc', marginLeft: '2px' }}>処理中...</div>}
                    {error && <div style={{ color: 'red' }}>Error: {error}</div>}
                </div>
            )}
        </div>
    );
};

export default RemoteFile;
