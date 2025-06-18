import { useState, useEffect } from 'react';
import './App.css';
import AIChat from './components/AIChat';
import MapComponent from './components/Map';
import RemoteFile from './components/RemoteFile';
import TableList from './components/TableList';
import { useDuckDB } from './lib/duckdb/useDuckDB';
import { terminateGlobalDB } from './lib/duckdb/globalDB';
import type { MapStyleManager } from './utils/mapStyleManager';

function App() {
    const { db, dbStateManager } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [selectedColumns, setSelectedColumns] = useState<Record<string, string[]>>({});
    const [mapStyleManager, setMapStyleManager] = useState<MapStyleManager | null>(null);
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(!import.meta.env.VITE_ANTHROPIC_API_KEY);
    
    console.log('App: Render with database:', !!db, 'dbStateManager:', !!dbStateManager);

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
            height: '100vh', 
            width: '100vw',
            overflow: 'hidden',
            margin: 0,
            padding: 0
        }}>
            {/* Left Half - AI Chat */}
            <div style={{ 
                width: '50%', 
                height: '100vh',
                borderRight: '1px solid #ddd',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                {showApiKeyInput && (
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
                                onClick={() => setShowApiKeyInput(false)}
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
                            Your API key is stored locally and never sent to our servers.
                        </div>
                    </div>
                )}
                {db && <AIChat db={db} dbStateManager={dbStateManager || undefined} mapStyleManager={mapStyleManager || undefined} apiKey={apiKey} />}
            </div>
            
            {/* Right Half - DuckDB and Map */}
            <div style={{ 
                width: '50%', 
                height: '100vh',
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
                    {db && <RemoteFile db={db} onTableCreated={(tableName) => {
                        console.log('App: Table created, auto-selecting:', tableName);
                        setSelectedTable(tableName);
                        // Also trigger TableList refresh via dbStateManager
                        if (dbStateManager) {
                            console.log('App: Triggering TableList refresh via dbStateManager');
                            dbStateManager.notifyTableChange();
                        }
                    }} />}
                    {db && (
                        <TableList
                            key="main-table-list"
                            db={db}
                            dbStateManager={dbStateManager || undefined}
                            selectedTable={selectedTable}
                            onTableSelect={handleTableSelect}
                            selectedColumns={selectedColumns}
                            onColumnSelect={handleColumnSelect}
                        />
                    )}
                </div>
                <div style={{ flex: 1, overflow: 'hidden' }}>
                    {db && (
                        <MapComponent
                            key="main-map"
                            db={db}
                            selectedTable={selectedTable}
                            selectedColumns={selectedColumns[selectedTable || ''] || []}
                            onMapReady={handleMapReady}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default App;
