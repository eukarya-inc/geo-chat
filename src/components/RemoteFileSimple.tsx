import { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useState } from 'react';

interface RemoteFileSimpleProps {
    db: AsyncDuckDB;
    onTableCreated?: (tableName: string) => void;
}

const RemoteFileSimple: React.FC<RemoteFileSimpleProps> = ({ db, onTableCreated }) => {
    const [url, setUrl] = useState<string>('');
    const [isCreatingTable, setIsCreatingTable] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(event.target.value);
    };

    const loadSampleData = async () => {
        // Get the base path from import.meta.env.BASE_URL or extract from pathname
        const basePath = import.meta.env.BASE_URL || '/';
        const sampleUrl = `${window.location.origin}${basePath}data/customer.parquet`;
        setUrl(sampleUrl);
        // Automatically create table after setting URL
        setTimeout(() => {
            createTableFromUrl(sampleUrl);
        }, 100);
    };

    const createTableFromUrl = async (urlOverride?: string) => {
        const targetUrl = urlOverride || url;
        if (!db || !targetUrl.trim()) {
            console.log('RemoteFileSimple: missing db or url');
            return;
        }

        console.log('RemoteFileSimple: Starting table creation process for URL:', targetUrl);
        setIsCreatingTable(true);
        let conn = null;

        try {
            console.log('RemoteFileSimple: Database instance ID:', (db as { __instanceId?: string }).__instanceId || 'no-id');
            conn = await db.connect();

            // URLからファイル名を抽出
            const fileName = targetUrl.split('/').pop() || 'remote_file';
            let tableName = fileName.split('.')[0].replace(/[^a-zA-Z0-9_]/g, '_');
            if (/^\d/.test(tableName)) {
                tableName = `t_${tableName}`;
            }

            const isParquet = targetUrl.toLowerCase().endsWith('.parquet');
            const isCSV = targetUrl.toLowerCase().endsWith('.csv');

            let from;
            if (isParquet) {
                from = `'${targetUrl}'`;
            } else if (isCSV) {
                from = `read_csv_auto('${targetUrl}')`;
            } else {
                from = `st_read('${targetUrl}')`;
            }

            await conn.query(`CREATE TABLE ${tableName} AS SELECT * FROM ${from}`);
            await conn.query('CHECKPOINT;');

            console.log('Table created and checkpoint executed:', tableName);

            // Verify table was created by checking if it exists
            try {
                console.log('RemoteFileSimple: Verifying table creation...');
                const tableCheck = await conn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const rowCount = tableCheck.toArray()[0].count;
                console.log(`RemoteFileSimple: Table ${tableName} verified with ${rowCount} rows`);

                // Also check columns
                const columnsCheck = await conn.query(`PRAGMA table_info('${tableName}')`);
                console.log('RemoteFileSimple: Table columns:', columnsCheck.toString());
            } catch (verifyError) {
                console.error('RemoteFileSimple: Error verifying table:', verifyError);
            }

            setError(null);
            setUrl('');
            console.log('RemoteFileSimple: Calling onTableCreated callback with tableName:', tableName);

            // Debug: Check what tables actually exist
            try {
                const debugConn = await db.connect();
                const tablesResult = await debugConn.query('SHOW TABLES;');
                console.log('RemoteFileSimple: Tables in database after creation:', tablesResult.toArray());

                // Check the actual row count
                const countResult = await debugConn.query(`SELECT COUNT(*) as count FROM ${tableName}`);
                const actualCount = countResult.toArray()[0]?.count;
                console.log(`RemoteFileSimple: Actual row count in ${tableName}:`, actualCount);

                await debugConn.close();
            } catch (debugError) {
                console.error('RemoteFileSimple: Error during debug check:', debugError);
            }

            onTableCreated?.(tableName);
        } catch (err) {
            console.error('Query error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
            if (conn) {
                await conn.close();
            }
            setIsCreatingTable(false);
        }
    };

    return (
        <div className="w-full">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
                <div className="flex gap-2">
                    <input
                        type="url"
                        value={url}
                        onChange={handleUrlChange}
                        placeholder="Enter file URL (.parquet, .csv, .geojson, .shp)"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                        disabled={!db || isCreatingTable}
                    />
                    <button
                        onClick={() => createTableFromUrl()}
                        disabled={!db || !url.trim() || isCreatingTable}
                        className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        {isCreatingTable ? 'Creating Table...' : 'Create Table'}
                    </button>
                    <button
                        onClick={loadSampleData}
                        disabled={!db || isCreatingTable}
                        className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        Example
                    </button>
                </div>
                {isCreatingTable && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                        <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></span>
                        処理中...
                    </div>
                )}
                {error && (
                    <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                        <span className="font-medium">Error:</span> {error}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RemoteFileSimple;
