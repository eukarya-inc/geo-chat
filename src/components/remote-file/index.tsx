import { useState, useRef, useEffect } from 'react';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { createTableFromUrl as createTableFromUrlUtil } from '../../utils/tableCreation';

interface RemoteFileProps {
    dbContext: DBContext | null;
    schema?: string | null;
    onTableCreated?: (tableName: string) => void;
    onSendMessage?: (message: string) => void;
    waitForDbContext?: () => Promise<DBContext>;
}

const RemoteFile: React.FC<RemoteFileProps> = ({
    dbContext,
    schema = null,
    onTableCreated,
    onSendMessage,
    waitForDbContext,
}) => {
    const [url, setUrl] = useState<string>('');
    const [isCreatingTable, setIsCreatingTable] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isWaitingForDb, setIsWaitingForDb] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus the input when component mounts
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        setUrl(event.target.value);
    };

    const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter' && !isCreatingTable && url.trim()) {
            event.preventDefault();
            createTableFromUrl();
        }
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
        if (!targetUrl.trim()) {
            console.log('RemoteFile: missing url');
            return;
        }

        setIsCreatingTable(true);
        setError(null);

        try {
            let db = dbContext;

            // Wait for dbContext if not available
            if (!db) {
                if (!waitForDbContext) {
                    setError('データベースが初期化されていません');
                    setIsCreatingTable(false);
                    return;
                }

                setIsWaitingForDb(true);
                try {
                    db = await waitForDbContext();
                } catch {
                    setError('データベースの初期化に失敗しました');
                    setIsCreatingTable(false);
                    setIsWaitingForDb(false);
                    return;
                } finally {
                    setIsWaitingForDb(false);
                }
            }

            // Use the shared utility function to create the table
            const { tableName, message } = await createTableFromUrlUtil(targetUrl, db, schema);

            setError(null);
            setUrl('');

            if (onSendMessage) {
                // Send the table message for all cases (both Example and regular Create Table)
                onSendMessage(message);
            }

            onTableCreated?.(tableName);
        } catch (err) {
            console.error('Query error:', err);
            setError(err instanceof Error ? err.message : 'Unknown error occurred');
        } finally {
            setIsCreatingTable(false);
        }
    };

    return (
        <div className="w-full">
            <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 space-y-3">
                <input
                    ref={inputRef}
                    type="url"
                    value={url}
                    onChange={handleUrlChange}
                    onKeyPress={handleKeyPress}
                    placeholder="Enter file URL (.parquet, .csv, .geojson, .shp)"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    disabled={isCreatingTable || isWaitingForDb}
                />
                <div className="flex gap-2">
                    <button
                        onClick={() => createTableFromUrl()}
                        disabled={!url.trim() || isCreatingTable || isWaitingForDb}
                        className="px-4 py-2 bg-blue-500 text-white text-sm font-medium rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        {isWaitingForDb
                            ? 'データベース初期化中...'
                            : isCreatingTable
                              ? 'Creating Table...'
                              : 'Create Table'}
                    </button>
                    <button
                        onClick={loadSampleData}
                        disabled={isCreatingTable || isWaitingForDb}
                        className="px-4 py-2 bg-gray-500 text-white text-sm font-medium rounded-md hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed transition-colors duration-200"
                    >
                        Example
                    </button>
                </div>
                {(isCreatingTable || isWaitingForDb) && (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                        <span className="inline-block w-4 h-4 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin"></span>
                        {isWaitingForDb ? 'データベース初期化中...' : '処理中...'}
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

export default RemoteFile;
