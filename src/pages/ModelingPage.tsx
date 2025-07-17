import { useState, useEffect } from 'react';
import AIChat from '../components/AIChat';
import MapComponent from '../components/Map';
import RemoteFile from '../components/RemoteFile';
import TableList from '../components/TableList';
import { useDuckDB } from '../lib/duckdb/useDuckDB';
import { terminateGlobalDB } from '../lib/duckdb/globalDB';
import type { MapStyleManager } from '../utils/mapStyleManager';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from '../utils/encryption';

function ModelingPage() {
    const { db, dbStateManager } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
    const [mapStyleManager, setMapStyleManager] = useState<MapStyleManager | null>(null);
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);

    const handleColumnSelect = (tableName: string, columns: string[]) => {
        console.log('ModelingPage: Column selection changed for table:', tableName, 'columns:', columns);
        setSelectedColumns(prev => ({
            ...prev,
            [tableName]: columns,
        }));
    };

    const handleMapReady = (styleManager: MapStyleManager) => {
        console.log('ModelingPage: Map ready, style manager initialized');
        setMapStyleManager(styleManager);
    };

    const handleTableSelect = (tableName: string) => {
        const actualTable = tableName === '' ? null : tableName;
        setSelectedTable(actualTable);
    };

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
                console.error('Failed to load API key:', error);
                setShowApiKeyInput(true);
            } finally {
                setIsLoadingApiKey(false);
            }
        };

        initializeApiKey();
    }, []);

    // Log state changes for debugging
    useEffect(() => {
        console.log('ModelingPage: selectedTable changed to:', selectedTable);
    }, [selectedTable]);

    useEffect(() => {
        console.log('ModelingPage: selectedColumns changed to:', selectedColumns);
    }, [selectedColumns]);

    // Cleanup global DB on component unmount
    useEffect(() => {
        return () => {
            terminateGlobalDB();
        };
    }, []);


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
                                            console.error('Failed to save API key:', error);
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
                        mapStyleManager={mapStyleManager || undefined}
                        apiKey={apiKey}
                    />
                )}
            </div>

            {/* Right Half - DuckDB and Map */}
            <div className="w-1/2 h-full flex flex-col overflow-hidden">
                <div className="flex flex-col gap-4 p-2.5 flex-shrink-0 bg-white">
                    {db && <RemoteFile db={db} onTableCreated={(tableName) => {
                        console.log('ModelingPage: Table created, auto-selecting:', tableName);
                        setSelectedTable(tableName);
                        // Also trigger TableList refresh via dbStateManager
                        if (dbStateManager) {
                            console.log('ModelingPage: Triggering TableList refresh via dbStateManager');
                            dbStateManager.notifyTableChange();
                        }
                    }} />}
                    {db && (
                        <TableList
                            key="modeling-table-list"
                            db={db}
                            dbStateManager={dbStateManager || undefined}
                            selectedTable={selectedTable}
                            onTableSelect={handleTableSelect}
                            selectedColumns={selectedColumns}
                            onColumnSelect={handleColumnSelect}
                        />
                    )}
                </div>
                <div className="flex-1 overflow-hidden">
                    {db && (
                        <MapComponent
                            key="modeling-map"
                            db={db}
                            selectedTable={selectedTable}
                            selectedColumns={selectedColumns[selectedTable || ''] || []}
                            onMapReady={handleMapReady}
                            mapStyleManager={mapStyleManager || undefined}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default ModelingPage;
