import { useEffect } from 'react';
import './App.css';
import AIChat from './components/AIChat';
import MapComponent from './components/Map';
import RemoteFile from './components/RemoteFile';
import TableList from './components/TableList';
import { terminateGlobalDB } from './lib/duckdb/globalDB';
import { useAppDispatch, useAppSelector } from './store/hooks';
import { setSelectedTable, setSelectedColumns } from './store/slices/dataSlice';
import { setStyleManager } from './store/slices/mapSlice';
import { setApiKey, setShowApiKeyInput } from './store/slices/uiSlice';
import { storeEncryptedApiKey } from './utils/encryption';

function AppRedux() {
    // Get state from Redux instead of local state
    const dispatch = useAppDispatch();
    const { connection: db, dbContext } = useAppSelector(state => state.duckdb);
    const { selectedTable, selectedColumns } = useAppSelector(state => state.data);
    const { styleManager: mapStyleManager } = useAppSelector(state => state.map);
    const { apiKey, showApiKeyInput, isLoadingApiKey } = useAppSelector(state => state.ui);

    console.log('AppRedux: Render with database:', !!db, 'dbContext:', !!dbContext);

    const handleColumnSelect = (tableName: string, columns: string[]) => {
        console.log('AppRedux: Column selection changed for table:', tableName, 'columns:', columns);
        dispatch(setSelectedColumns({ table: tableName, columns }));
    };

    const handleMapReady = (styleManager: import('./utils/mapStyleManager').MapStyleManager) => {
        console.log('AppRedux: Map ready, style manager initialized');
        dispatch(setStyleManager(styleManager));
    };

    const handleTableSelect = (tableName: string) => {
        const actualTable = tableName === '' ? null : tableName;
        dispatch(setSelectedTable(actualTable));
    };

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
                                onChange={(e) => dispatch(setApiKey(e.target.value))}
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
                                            dispatch(setShowApiKeyInput(false));
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
                        console.log('AppRedux: Table created, auto-selecting:', tableName);
                        dispatch(setSelectedTable(tableName));
                        // Also trigger TableList refresh via dbContext
                        if (dbContext) {
                            console.log('AppRedux: Triggering TableList refresh via dbContext');
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

export default AppRedux;
