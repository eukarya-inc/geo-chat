import { useState } from 'react';
import type { DBContext } from '../lib/duckdb/dbContext';
import { formatSQL } from '../utils/sqlFormatter';

interface RemoteFileSimpleProps {
    dbContext: DBContext;
    onTableCreated?: (tableName: string) => void;
    onSendMessage?: (message: string) => void;
    onExampleMessages?: (tableMessage: string, followUpMessage: string) => void;
}

const RemoteFileSimple: React.FC<RemoteFileSimpleProps> = ({ dbContext, onTableCreated, onSendMessage, onExampleMessages }) => {
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
            createTableFromUrl(sampleUrl, true);
        }, 100);
    };

    const createTableFromUrl = async (urlOverride?: string, isFromExample: boolean = false) => {
        const targetUrl = urlOverride || url;
        if (!dbContext || !targetUrl.trim()) {
            console.log('RemoteFileSimple: missing dbContext or url');
            return;
        }
        
        // Don't send any message here - we'll handle it after table creation

        setIsCreatingTable(true);
        let conn = null;

        try {
            // Use schema-aware connection
            conn = await dbContext.connectWithSchema();

            // URLからファイル名を抽出
            const fileName = targetUrl.split('/').pop() || 'remote_file';
            // URLエンコードされている場合はデコード
            const decodedFileName = decodeURIComponent(fileName);

            // 拡張子を除去
            const nameWithoutExt = decodedFileName.split('.')[0];

            // テーブル名として使える文字に変換
            // 日本語を含む場合は短いハッシュを生成
            let tableName;
            // eslint-disable-next-line no-control-regex
            if (/[^\x00-\x7F]/.test(nameWithoutExt)) {
                // 非ASCII文字（日本語など）が含まれる場合
                // 簡単なハッシュを生成（文字コードの合計を16進数に）
                const hash = nameWithoutExt.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0).toString(16);
                tableName = `table_${hash}`;
            } else {
                // ASCII文字のみの場合は既存の処理
                tableName = nameWithoutExt.replace(/[^a-zA-Z0-9_]/g, '_');
                if (/^\d/.test(tableName)) {
                    tableName = `t_${tableName}`;
                }
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

            // Get the current schema and use it in table creation
            const schemaName = dbContext?.getCurrentSchema() || 'main';
            const qualifiedTableName = schemaName !== 'main' ? `${schemaName}.${tableName}` : tableName;

            const createTableSQL = `CREATE TABLE ${qualifiedTableName} AS SELECT * FROM ${from}`;
            await conn.query(createTableSQL);
            await conn.query('CHECKPOINT;');

            // Record the CREATE TABLE SQL in history
            if (dbContext) {
                const formattedSQL = formatSQL(createTableSQL);
                dbContext.getSQLHistory().recordCreateTable(tableName, formattedSQL, 'remote-file');
            }

            setError(null);
            setUrl('');

            // Send a simple table creation message
            const tableMessage = `<!--TABLE_CREATED:${tableName}-->`;
            
            if (isFromExample && onExampleMessages) {
                // For Example button, use special handler that adds both messages at once
                onExampleMessages(tableMessage, 'どんな分析ができそうですか？');
            } else if (onSendMessage) {
                // For regular Create Table button, just send the table message
                onSendMessage(tableMessage);
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
                <input
                    type="url"
                    value={url}
                    onChange={handleUrlChange}
                    placeholder="Enter file URL (.parquet, .csv, .geojson, .shp)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    disabled={!dbContext || isCreatingTable}
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => createTableFromUrl()}
                        disabled={!dbContext || !url.trim() || isCreatingTable}
                        className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        {isCreatingTable ? 'Creating Table...' : 'Create Table'}
                    </button>
                    <button
                        onClick={loadSampleData}
                        disabled={!dbContext || isCreatingTable}
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
