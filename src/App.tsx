import { useState, useEffect } from 'react';
import './App.css';
import AIChat from './components/AIChat';
import MapComponent from './components/Map';
import RemoteFile from './components/RemoteFile';
import TableList from './components/TableList';
import { useDuckDB } from './lib/duckdb/useDuckDB';
import { terminateGlobalDB } from './lib/duckdb/globalDB';
import type { MapStyleManager } from './utils/mapStyleManager';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from './utils/encryption';

function App() {
    const { dbContext } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
    const [mapStyleManager, setMapStyleManager] = useState<MapStyleManager | null>(null);
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);
    
    console.log('App: Render with dbContext:', !!dbContext);

    const handleColumnSelect = (tableName: string, columns: string[]) => {
        console.log('App: Column selection changed for table:', tableName, 'columns:', columns);
        setSelectedColumns(prev => ({
            ...prev,
            [tableName]: columns,
        }));
    };

    const handleMapReady = (styleManager: MapStyleManager) => {
        console.log('App: Map ready, style manager initialized');
        setMapStyleManager(styleManager);
    };

    const handleTableSelect = (tableName: string) => {
        const actualTable = tableName === '' ? null : tableName;
        setSelectedTable(actualTable);
    };

    // No longer needed - state manager handles table refresh automatically

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
        console.log('App: selectedTable changed to:', selectedTable);
    }, [selectedTable]);

    useEffect(() => {
        console.log('App: selectedColumns changed to:', selectedColumns);
    }, [selectedColumns]);

    // Cleanup global DB on app unmount
    useEffect(() => {
        return () => {
            terminateGlobalDB();
        };
    }, []);


    return (
        <div style={{ 
            display: 'flex', 
            height: '100%', 
            width: '100%',
            overflow: 'hidden',
            margin: 0,
            padding: 0
        }}>
            {/* Left Half - AI Chat */}
            <div style={{ 
                width: '50%', 
                height: '100%',
                borderRight: '1px solid #ddd',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {(showApiKeyInput && !isLoadingApiKey) && (
                    <div style={{ 
                        padding: '15px', 
                        backgroundColor: '#f8f9fa', 
                        borderBottom: '1px solid #ddd',
                        flexShrink: 0
                    }}>
                        <div style={{ marginBottom: '10px', fontSize: '14px', fontWeight: 'bold' }}>
                            Anthropic API Key Settings
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <input
                                type="password"
                                value={apiKey}
                                onChange={(e) => setApiKey(e.target.value)}
                                placeholder="Enter your Anthropic API key..."
                                style={{
                                    flex: 1,
                                    padding: '8px 12px',
                                    border: '1px solid #ddd',
                                    borderRadius: '4px',
                                    fontSize: '14px'
                                }}
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
                                style={{
                                    padding: '8px 16px',
                                    backgroundColor: apiKey.trim() ? '#007bff' : '#ccc',
                                    color: 'white',
                                    border: 'none',
                                    borderRadius: '4px',
                                    cursor: apiKey.trim() ? 'pointer' : 'not-allowed',
                                    fontSize: '14px'
                                }}
                            >
                                Save
                            </button>
                        </div>
                        <div style={{ fontSize: '12px', color: '#666', marginTop: '8px' }}>
                            Your API key is encrypted and stored locally in your browser and never sent to our servers.
                        </div>
                    </div>
                )}
                {isLoadingApiKey && (
                    <div style={{ 
                        padding: '20px', 
                        textAlign: 'center',
                        color: '#666'
                    }}>
                        APIキーを読み込み中...
                    </div>
                )}
                {!isLoadingApiKey && dbContext && <AIChat dbContext={dbContext} mapStyleManager={mapStyleManager || undefined} apiKey={apiKey} />}
            </div>
            
            {/* Right Half - DuckDB and Map */}
            <div style={{ 
                width: '50%', 
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{ 
                    display: 'flex', 
                    flexDirection: 'column', 
                    gap: '15px',
                    padding: '10px',
                    flexShrink: 0,
                    backgroundColor: 'white'
                }}>
                    {dbContext && <RemoteFile dbContext={dbContext} onTableCreated={(tableName) => {
                        console.log('App: Table created, auto-selecting:', tableName);
                        setSelectedTable(tableName);
                        // Also trigger TableList refresh via dbContext
                        if (dbContext) {
                            console.log('App: Triggering TableList refresh via dbContext');
                            dbContext.notifyTableChange(undefined, null);
                        }
                    }} />}
                    {dbContext && (
                        <TableList
                            key="main-table-list"
                            dbContext={dbContext}
                            selectedTable={selectedTable}
                            onTableSelect={handleTableSelect}
                            selectedColumns={selectedColumns}
                            onColumnSelect={handleColumnSelect}
                        />
                    )}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {dbContext && (
                        <MapComponent
                            key="main-map"
                            dbContext={dbContext}
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

export default App;
