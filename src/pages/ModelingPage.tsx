import { useState, useEffect } from 'react';
import AIChat from '../components/AIChatModeling';
import { Table } from '../components/Table';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import RemoteFileSimple from '../components/RemoteFileSimple';
import TableSelector from '../components/TableSelector';
import TableSQLDisplay from '../components/TableSQLDisplay';
import { ResizableDivider } from '../components/ResizableDivider';
import { useDuckDB } from '../lib/duckdb/useDuckDB';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from '../utils/encryption';
import { TabView } from '../components/TabView';
import { ChartGrid, type ChartSpec } from '../components/ChartGrid';
import { generateDefaultCharts } from '../utils/autoChartGenerator';

function ModelingPage() {
    const { db, dbStateManager } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [connection, setConnection] = useState<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);
    const [tableRefreshKey, setTableRefreshKey] = useState(0);
    const [showTableSelector, setShowTableSelector] = useState(true);
    const [sqlAreaHeight, setSqlAreaHeight] = useState(200);
    const [sendMessage, setSendMessage] = useState<((message: string) => void) | null>(null);
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);

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
            } catch {
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
                } catch {
                    // Error creating connection
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

        const unsubscribe = dbStateManager.onTableChange(async (tableName?: string) => {
            // Force consistency across all connections
            try {
                await dbStateManager.forceConsistency();
            } catch {
                // Error forcing consistency
            }

            // Force TableSelector to completely remount
            setShowTableSelector(false);
            setTimeout(() => {
                setShowTableSelector(true);
                setTableRefreshKey(prev => prev + 1);
                // Auto-select the newly created table
                if (tableName) {
                    setSelectedTable(tableName);
                }
            }, 100);
        });

        return () => {
            unsubscribe();
        };
    }, [dbStateManager]);

    // Generate preview chart when table is selected
    useEffect(() => {
        const generateChart = async () => {
            if (!selectedTable || !dbStateManager) {
                setChartSpec(null);
                return;
            }

            try {
                const defaultCharts = await generateDefaultCharts(selectedTable, dbStateManager);

                if (defaultCharts.length > 0) {
                    const result = defaultCharts[0];
                    setChartSpec({
                        id: `preview-${selectedTable}`,
                        spec: result.spec,
                        timestamp: new Date(),
                        title: result.title
                    });
                } else {
                    setChartSpec(null);
                }
            } catch (error) {
                console.error('Error generating preview chart:', error);
                setChartSpec(null);
            }
        };

        generateChart();
    }, [selectedTable, dbStateManager]);

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
                                        } catch {
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
                        onSendMessageReady={(sendFn) => setSendMessage(() => sendFn)}
                    />
                )}
            </div>

            {/* Right Half - DuckDB and Table */}
            <div className="w-1/2 h-full flex flex-col overflow-hidden">
                <div className="flex flex-col gap-4 p-2.5 flex-shrink-0 bg-white">
                    {db && <RemoteFileSimple db={db} dbStateManager={dbStateManager || undefined} onTableCreated={(tableName) => {
                        setSelectedTable(tableName);
                        if (dbStateManager) {
                            dbStateManager.notifyTableChange();
                        }
                        // Send auto message when customer table is created
                        if (tableName === 'customer' && sendMessage) {
                            setTimeout(() => {
                                sendMessage('customerテーブルでどんな可視化できそうですか？');
                            }, 500);
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
                <div className="flex-1 overflow-hidden flex flex-col">
                    {db && selectedTable && connection && (
                        <>
                            <div className="flex-1 overflow-hidden">
                                <TabView
                                    tabs={[
                                        {
                                            id: 'table',
                                            title: 'テーブル',
                                            content: (
                                                <div className="h-full">
                                                    <Table
                                                        connection={connection}
                                                        tableName={selectedTable}
                                                    />
                                                </div>
                                            )
                                        },
                                        {
                                            id: 'graph',
                                            title: 'グラフ',
                                            content: (
                                                <ChartGrid
                                                    charts={chartSpec ? [chartSpec] : []}
                                                    db={db}
                                                    dbStateManager={dbStateManager || undefined}
                                                />
                                            )
                                        }
                                    ]}
                                    defaultActiveTab="table"
                                />
                            </div>
                            <ResizableDivider
                                onResize={setSqlAreaHeight}
                                minHeight={100}
                                maxHeight={500}
                            />
                            <div
                                className="flex-shrink-0 bg-white border-t border-gray-200 overflow-hidden"
                                style={{ height: `${sqlAreaHeight}px` }}
                            >
                                <div className="h-full p-2.5 overflow-auto">
                                    <TableSQLDisplay
                                        tableName={selectedTable}
                                        dbStateManager={dbStateManager}
                                    />
                                </div>
                            </div>
                        </>
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
