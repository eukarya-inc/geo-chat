import { useState, useEffect } from 'react';
import AIChat from '../components/AIChatModeling';
import { Table } from '../components/Table';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import RemoteFileSimple from '../components/RemoteFileSimple';
import TableSelector from '../components/TableSelector';
import { useDuckDB } from '../lib/duckdb/useDuckDB';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from '../utils/encryption';

function ModelingPage() {
    const { db, dbStateManager } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [connection, setConnection] = useState<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);
    const [tableRefreshKey, setTableRefreshKey] = useState(0);
    const [showTableSelector, setShowTableSelector] = useState(true);
    const [forceRefreshTables, setForceRefreshTables] = useState(0);

    // Initialize API key from encrypted storage or environment variable
    useEffect(() => {
        const initializeApiKey = async () => {
            setIsLoadingApiKey(true);
            try {
                const storedKey = await retrieveEncryptedApiKey();
                const envKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

                if (storedKey) {
                    setApiKey(storedKey);
                    setShowApiKeyInput(false);
                } else if (envKey) {
                    setApiKey(envKey);
                    setShowApiKeyInput(false);
                } else {
                    setShowApiKeyInput(true);
                }
            } catch (error) {
                setShowApiKeyInput(true);
            } finally {
                setIsLoadingApiKey(false);
            }
        };

        initializeApiKey();
    }, []);

    // Set up connection
    useEffect(() => {
        let currentConnection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null = null;

        const createConnection = async () => {
            if (db) {
                try {
                    const conn = await db.connect();
                    currentConnection = conn;
                    setConnection(conn);
                } catch (err) {
                }
            } else {
                setConnection(null);
            }
        };

        createConnection();

        return () => {
            if (currentConnection) {
                currentConnection.close().catch(() => {});
            }
        };
    }, [db]);

    // Subscribe to table changes from dbStateManager
    useEffect(() => {
        if (!dbStateManager) return;

        const unsubscribe = dbStateManager.onTableChange(async () => {
            // Force consistency across all connections
            try {
                await dbStateManager.forceConsistency();
            } catch (error) {
            }
            
            // Force TableSelector to completely remount
            setShowTableSelector(false);
            setTimeout(() => {
                setShowTableSelector(true);
                setTableRefreshKey(prev => prev + 1);
            }, 100);
        });

        return () => {
            unsubscribe();
        };
    }, [dbStateManager]);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Left Half - AI Chat (Modeling Tools) */}
            <div className="w-1/2 h-full border-r border-gray-300 flex flex-col overflow-hidden">
                {(showApiKeyInput && !isLoadingApiKey) && (
                    <div className="p-4 bg-gray-50 border-b border-gray-300 flex-shrink-0">
                        <div className="mb-2.5 text-sm font-bold">
                            Anthropic API Key Settings
                        </div>
                        <div className="flex gap-2.5 items-center">
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter your Anthropic API key..."
                                className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                            />
                            <button
                                onClick={async () => {
                                    if (apiKey.trim()) {
                                        try {
                                            // Save encrypted API key to localStorage
                                            await storeEncryptedApiKey(apiKey.trim());
                                            setShowApiKeyInput(false);
                                        } catch (error) {
                                            alert('APIキーの保存に失敗しました。');
                                        }
                                    }
                                }}
                                disabled={!apiKey.trim()}
                                className={`px-4 py-2 text-white border-none rounded text-sm ${
                                    apiKey.trim()
                                        ? 'bg-blue-500 cursor-pointer hover:bg-blue-600'
                                        : 'bg-gray-400 cursor-not-allowed'
                                }`}
                            >
                                Save
                            </button>
                        </div>
                        <div className="text-xs text-gray-600 mt-2">
                            Your API key is encrypted and stored locally in your browser and never sent to our servers.
                        </div>
                    </div>
                )}
                {isLoadingApiKey && (
                    <div className="p-5 text-center text-gray-600">
                        APIキーを読み込み中...
                    </div>
                )}
                {!isLoadingApiKey && db && (
                    <AIChat
                        db={db}
                        dbStateManager={dbStateManager || undefined}
                        apiKey={apiKey}
                    />
                )}
            </div>

            {/* Right Half - DuckDB and Table */}
            <div className="w-1/2 h-full flex flex-col overflow-hidden">
                <div className="flex flex-col gap-4 p-2.5 flex-shrink-0 bg-white">
                    {db && <RemoteFileSimple db={db} onTableCreated={(tableName) => {
                        setSelectedTable(tableName);
                        if (dbStateManager) {
                            dbStateManager.notifyTableChange();
                        }
                    }} />}
                    {db && showTableSelector && (
                        <TableSelector
                            db={db}
                            refreshTrigger={tableRefreshKey}
                            selectedTable={selectedTable}
                            onTableSelect={setSelectedTable}
                        />
                    )}
                </div>
                <div className="flex-1 overflow-hidden">
                    {db && selectedTable && connection && (
                        <Table
                            connection={connection}
                            tableName={selectedTable}
                        />
                    )}
                    {db && !selectedTable && (
                        <div className="flex items-center justify-center h-full text-gray-500">
                            テーブルを選択してください
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

export default ModelingPage;
