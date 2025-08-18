import { useState } from 'react';
import type { DBContext } from '../lib/duckdb/dbContext';

interface RemoteFileProps {
    dbContext: DBContext;
    onTableCreated?: (tableName: string) => void;
}

const RemoteFile: React.FC<RemoteFileProps> = ({ dbContext, onTableCreated }) => {
    const [url, setUrl] = useState<string>('');
    const [isCreatingTable, setIsCreatingTable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [show, setShow] = useState(false);

    const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(event.target.value);
    };

    const createTableFromUrl = async () => {
        console.log('RemoteFile: createTableFromUrl called with:', { dbContext: !!dbContext, url: url.trim() });
        if (!dbContext || !url.trim()) {
            console.log('RemoteFile: Early return - missing dbContext or url');
            return;
        }

        console.log('RemoteFile: Starting table creation process for URL:', url);
        setIsCreatingTable(true);
        document.body.classList.add('creating-table');
        let conn = null;

        try {
            console.log('RemoteFile: Using dbContext');
            conn = await dbContext.connect();
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
            const isCSV = url.toLowerCase().endsWith('.csv');
            
            let query;
            if (isParquet) {
                query = `CREATE TABLE ${tableName} AS SELECT * FROM '${url}'`;
            } else if (isCSV) {
                // First create the table from CSV
                query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${url}')`;
                
                // After creation, check for lat/lng columns and add geometry if found
                const checkGeometryQuery = `
                    WITH column_info AS (
                        SELECT column_name, column_type 
                        FROM (DESCRIBE ${tableName})
                    ),
                    lat_columns AS (
                        SELECT column_name FROM column_info 
                        WHERE LOWER(column_name) LIKE '%lat%' 
                           OR column_name LIKE '%緯度%'
                           OR LOWER(column_name) = 'y'
                           OR column_name = '緯度_y'
                    ),
                    lng_columns AS (
                        SELECT column_name FROM column_info 
                        WHERE LOWER(column_name) LIKE '%lon%' 
                           OR LOWER(column_name) LIKE '%lng%'
                           OR column_name LIKE '%経度%'
                           OR LOWER(column_name) = 'x'
                           OR column_name = '経度_y'
                    )
                    SELECT 
                        (SELECT column_name FROM lat_columns LIMIT 1) as lat_col,
                        (SELECT column_name FROM lng_columns LIMIT 1) as lng_col
                `;
                
                try {
                    await conn.query(query);
                    console.log('RemoteFile: CSV table created, checking for coordinate columns');
                    
                    
                    const coordCheck = await conn.query(checkGeometryQuery);
                    const coords = coordCheck.toArray()[0] as { lat_col: string | null; lng_col: string | null };
                    console.log('RemoteFile: Coordinate check result:', coords);
                    
                    if (coords && coords.lat_col && coords.lng_col) {
                        console.log(`RemoteFile: Found coordinate columns: lat=${coords.lat_col}, lng=${coords.lng_col}`);
                        
                        // Create a new table with geometry column
                        const geomTableName = `${tableName}_with_geom`;
                        const createGeomQuery = `
                            CREATE OR REPLACE TABLE ${geomTableName} AS 
                            SELECT *, 
                                   ST_Point(CAST("${coords.lng_col}" AS DOUBLE), CAST("${coords.lat_col}" AS DOUBLE)) as geom
                            FROM ${tableName}
                            WHERE "${coords.lng_col}" IS NOT NULL 
                              AND "${coords.lat_col}" IS NOT NULL
                              AND TRY_CAST("${coords.lng_col}" AS DOUBLE) IS NOT NULL
                              AND TRY_CAST("${coords.lat_col}" AS DOUBLE) IS NOT NULL
                        `;
                        
                        
                        await conn.query(createGeomQuery);
                        
                        // Drop the original table and rename the new one
                        await conn.query(`DROP TABLE ${tableName}`);
                        await conn.query(`ALTER TABLE ${geomTableName} RENAME TO ${tableName}`);
                        
                        console.log(`RemoteFile: Successfully added geometry column to ${tableName}`);
                        
                        // Create spatial index on the geometry column
                        try {
                            console.log('RemoteFile: Creating spatial index on geometry column');
                            await conn.query(`CREATE INDEX ${tableName}_geom_idx ON ${tableName} USING RTREE (geom)`);
                            console.log('RemoteFile: Spatial index created successfully');
                        } catch (indexError) {
                            console.warn('RemoteFile: Could not create spatial index:', indexError);
                        }
                        
                        // Count rows to verify
                        const countResult = await conn.query(`SELECT COUNT(*) as total, COUNT(geom) as with_geom FROM ${tableName}`);
                        const counts = countResult.toArray()[0] as { total: number; with_geom: number };
                        console.log(`RemoteFile: Table has ${counts.total} rows, ${counts.with_geom} with valid geometry`);
                        
                    } else {
                        console.log('RemoteFile: No coordinate columns detected in CSV');
                    }
                    
                    // Skip the main query since we already handled everything
                    query = null;
                } catch (csvError) {
                    console.error('RemoteFile: Error processing CSV with coordinates:', csvError);
                    // Fall back to simple CSV loading if coordinate detection fails
                    query = `CREATE TABLE ${tableName} AS SELECT * FROM read_csv_auto('${url}')`;
                }
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
            
            // Only create spatial index if the table has a geometry column
            try {
                // Check if table has a geom column
                const columnsResult = await conn.query(`DESCRIBE ${tableName}`);
                const columns = columnsResult.toArray();
                const hasGeomColumn = columns.some(col => 
                    col.column_name?.toLowerCase() === 'geom' || 
                    col.column_name?.toLowerCase() === 'geometry' ||
                    col.column_type?.toLowerCase().includes('geometry')
                );
                
                if (hasGeomColumn) {
                    console.log('RemoteFile: Creating spatial index for geometry column');
                    await conn.query(`CREATE INDEX ${tableName}_idx ON ${tableName} USING RTREE (geom);`);
                } else {
                    console.log('RemoteFile: No geometry column found, skipping spatial index');
                }
            } catch (indexError) {
                console.warn('RemoteFile: Could not create spatial index:', indexError);
                // Continue without spatial index - not critical for non-spatial data
            }
            
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
                const debugConn = await dbContext.connect();
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
                <button onClick={() => setShow(!show)} disabled={!dbContext}>
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
                            placeholder="Enter file URL (.parquet, .csv, .geojson, .shp)"
                            style={{ flex: 1, padding: '0.5em' }}
                        />
                        <button onClick={createTableFromUrl} disabled={!dbContext || !url.trim() || isCreatingTable}>
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
