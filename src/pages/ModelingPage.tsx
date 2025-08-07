import { useState, useEffect, useCallback, useRef } from 'react';
import AIChat from '../components/AIChatModeling';
import { Table } from '../components/Table';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import RemoteFileSimple from '../components/RemoteFileSimple';
import TableSQLDisplay from '../components/TableSQLDisplay';
import TableSelector from '../components/TableSelector';
import { ResizableDivider } from '../components/ResizableDivider';
import { useDuckDB } from '../lib/duckdb/useDuckDB';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from '../utils/encryption';
import { ChartGrid, type ChartSpec } from '../components/ChartGrid';
import { generateDefaultCharts } from '../utils/autoChartGenerator';
import Map from '../components/Map';
import { checkTableGeometry } from '../utils/duckdbGeometryHelpers';
import { ChatList, type Chat, type ChatType } from '../components/ChatList';
import { createSchemaManager, type SchemaManager } from '../lib/duckdb/schemaManager';
import type { StructuredMessage } from '../types/message';
import { TableCellsIcon } from '@heroicons/react/24/outline';

function ModelingPage() {
    const { db, dbStateManager } = useDuckDB();
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [connection, setConnection] = useState<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);
    const [connectionTimestamp, setConnectionTimestamp] = useState<number>(Date.now());
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);
    const [sqlAreaHeight, setSqlAreaHeight] = useState(200);
    const [tableAreaHeight, setTableAreaHeight] = useState(300);
    const sendMessageRef = useRef<((message: string) => void) | null>(null);

    const handleSendMessageReady = useCallback((sendFn: (message: string) => void) => {
        sendMessageRef.current = sendFn;
    }, []);
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);
    const [mapSelectedColumns, setMapSelectedColumns] = useState<string[]>([]);
    const [selectedGeometryColumn, setSelectedGeometryColumn] = useState<string>('geometry');

    // Chat management state
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    
    // Handle table selection and update chat state
    const handleTableSelection = useCallback((tableName: string | null) => {
        setSelectedTable(tableName);
        
        // Update the selected table in the current chat
        if (selectedChatId && tableName) {
            setChats(prevChats => 
                prevChats.map(chat => 
                    chat.id === selectedChatId 
                        ? { ...chat, selectedTable: tableName }
                        : chat
                )
            );
        }
    }, [selectedChatId]);
    const [schemaManager, setSchemaManager] = useState<SchemaManager | null>(null);
    
    // Get current chat
    const currentChat = chats.find(chat => chat.id === selectedChatId);

    // Update messages for a specific chat
    const updateChatMessages = useCallback((chatId: string, messages: StructuredMessage[]) => {
        setChats(prevChats =>
            prevChats.map(chat =>
                chat.id === chatId
                    ? { ...chat, messages }
                    : chat
            )
        );
    }, []);

    // Save selected table to current chat when it changes
    useEffect(() => {
        if (selectedChatId && selectedTable !== undefined) {
            setChats(prevChats => {
                const updatedChats = prevChats.map(chat =>
                    chat.id === selectedChatId
                        ? { ...chat, selectedTable }
                        : chat
                );
                return updatedChats;
            });
        }
    }, [selectedTable, selectedChatId]);

    // Special handler for Example button that sends both messages
    const handleExampleMessages = useCallback((tableMessage: string, followUpMessage: string) => {
        if (!sendMessageRef.current) return;
        
        // Send table message first (won't go to AI due to TABLE_CREATED marker)
        sendMessageRef.current(tableMessage);
        
        // Send follow-up message after a delay
        setTimeout(() => {
            if (sendMessageRef.current) {
                sendMessageRef.current(followUpMessage);
            }
        }, 300);
    }, []);

    // Chat management functions
    const createNewChat = async (type: ChatType) => {
        if (!schemaManager) {
            console.error('SchemaManager is not initialized');
            return;
        }

        try {
            const typeLabel = type === 'graph' ? 'グラフ' : '地図';
            const newChat: Chat = {
                id: `chat-${Date.now()}`,
                title: `${typeLabel}チャット ${chats.length + 1}`,
                type,
                createdAt: new Date(),
                messages: [],
                selectedTable: null
            };

            // Create schema for the new chat
            await schemaManager.createSchema(newChat.id);
            await schemaManager.switchToSchema(newChat.id);

            setChats([...chats, newChat]);
            setSelectedChatId(newChat.id);

            // Update dbStateManager with current schema
            if (dbStateManager) {
                dbStateManager.setCurrentSchema(schemaManager.getCurrentSchema());
            }

            // Reset table selection since we're in a new schema
            setSelectedTable(null);

            // Notify table change to refresh table list
            if (dbStateManager) {
                dbStateManager.notifyTableChange();
            }
        } catch (error) {
            console.error('Error creating new chat:', error);
        }
    };

    const deleteChat = async (chatId: string) => {
        if (!schemaManager) return;

        // Delete the schema associated with the chat
        await schemaManager.deleteSchema(chatId);

        setChats(chats.filter(chat => chat.id !== chatId));
        if (selectedChatId === chatId) {
            const remainingChats = chats.filter(chat => chat.id !== chatId);
            if (remainingChats.length > 0) {
                const nextChat = remainingChats[0];
                await selectChat(nextChat.id);
            } else {
                setSelectedChatId(null);
                // Reset to main schema
                await schemaManager.resetToMain();
                // Update dbStateManager
                if (dbStateManager) {
                    dbStateManager.setCurrentSchema(null);
                }
                // Reset table selection
                setSelectedTable(null);
            }

            // Notify table change
            if (dbStateManager) {
                dbStateManager.notifyTableChange();
            }
        }
    };

    // Handle chat selection
    const selectChat = async (chatId: string) => {
        if (!schemaManager) return;

        // Find the chat being selected
        const targetChat = chats.find(chat => chat.id === chatId);
        if (!targetChat) return;

        // Set the selected chat ID - this will trigger the useEffect that switches schema
        setSelectedChatId(chatId);
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
            } catch {
                setShowApiKeyInput(true);
            } finally {
                setIsLoadingApiKey(false);
            }
        };

        initializeApiKey();
    }, []);

    // Initialize schema manager and create first chat
    useEffect(() => {
        if (db) {
            const manager = createSchemaManager(db);
            setSchemaManager(manager);

            // Auto-create first chat if no chats exist
            if (chats.length === 0) {
                const initializeFirstChat = async () => {
                    try {
                        const firstChat: Chat = {
                            id: `chat-${Date.now()}`,
                            title: 'グラフチャット 1',
                            type: 'graph',
                            createdAt: new Date(),
                            messages: [],
                            selectedTable: null
                        };

                        await manager.createSchema(firstChat.id);
                        await manager.switchToSchema(firstChat.id);

                        setChats([firstChat]);
                        setSelectedChatId(firstChat.id);

                        if (dbStateManager) {
                            dbStateManager.setCurrentSchema(manager.getCurrentSchema());
                            setTimeout(() => {
                                dbStateManager.notifyTableChange();
                            }, 0);
                        }
                    } catch (error) {
                        console.error('Error creating initial chat:', error);
                    }
                };

                initializeFirstChat();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [db]); // Only depend on db to avoid re-creating chats

    // Combined schema switching and connection setup
    useEffect(() => {
        if (!schemaManager || !db || !selectedChatId) return;

        let currentConnection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null = null;
        let isCleanedUp = false;

        const switchSchemaAndConnect = async () => {
            // First close any existing connection
            if (connection) {
                try {
                    await connection.close();
                } catch (e) {
                    console.error('Error closing previous connection:', e);
                }
                setConnection(null);
            }

            // Wait a bit longer to ensure all connections are fully closed
            await new Promise(resolve => setTimeout(resolve, 200));

            try {
                // Switch schema first
                await schemaManager.switchToSchema(selectedChatId);

                // Update dbStateManager with current schema
                if (dbStateManager) {
                    const schemaName = schemaManager.getCurrentSchema();
                    dbStateManager.setCurrentSchema(schemaName);
                }

                // Reset selection - will be restored by separate effect
                setSelectedTable(null);

                // Create new connection with the new schema
                const conn = await db.connect();
                currentConnection = conn;

                // Set search_path for this connection
                const currentSchema = schemaManager.getCurrentSchema();
                if (currentSchema) {
                    await conn.query(`SET search_path = '${currentSchema}'`);
                }

                if (!isCleanedUp) {
                    setConnection(conn);
                    setConnectionTimestamp(Date.now());
                    
                    // Restore table selection for this chat
                    const targetChat = chats.find(chat => chat.id === selectedChatId);
                    if (targetChat?.selectedTable) {
                        try {
                            // Check if table exists in this schema
                            await conn.query(`SELECT 1 FROM "${targetChat.selectedTable}" LIMIT 0`);
                            setSelectedTable(targetChat.selectedTable);
                        } catch {
                            // Table not found in schema, reset selection
                            setSelectedTable(null);
                        }
                    }
                    
                    // Notify table change after connection is established
                    if (dbStateManager) {
                        setTimeout(() => {
                            dbStateManager.notifyTableChange();
                        }, 300);
                    }
                }
            } catch (error) {
                console.error('Error switching schema and creating connection:', error);
                setConnection(null);
            }
        };

        switchSchemaAndConnect();

        return () => {
            isCleanedUp = true;
            if (currentConnection) {
                currentConnection.close().catch(() => {});
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChatId, db, schemaManager]); // Only depend on selectedChatId, db, and schemaManager

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

            // Auto-select the newly created table with a delay to ensure data is ready
            if (tableName) {
                // Wait longer for the table data to be fully committed and visible
                setTimeout(() => {
                    handleTableSelection(tableName);
                    // Force a connection timestamp update to refresh the Table component
                    setConnectionTimestamp(Date.now());
                }, 800);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [dbStateManager, handleTableSelection]);

    // Check for geom column and available columns when table is selected
    useEffect(() => {
        const checkGeomColumn = async () => {
            if (!selectedTable || !connection) {
                return;
            }

            const result = await checkTableGeometry(connection, selectedTable);

            if (result.geometryColumns.length > 0) {
                setSelectedGeometryColumn(result.geometryColumns[0]);
                setMapSelectedColumns(result.nonGeometryColumns);
            }
        };

        checkGeomColumn();
    }, [selectedTable, connection]);

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

    // Create memoized callback for message updates
    const handleMessagesChange = useCallback((messages: StructuredMessage[]) => {
        if (selectedChatId) {
            updateChatMessages(selectedChatId, messages);
        }
    }, [selectedChatId, updateChatMessages]);

    return (
        <div className="flex h-full w-full overflow-hidden">
            {/* Sidebar with Chat List */}
            <div className="w-64 h-full border-r border-gray-300 bg-gray-50 flex-shrink-0">
                <ChatList
                    chats={chats}
                    selectedChatId={selectedChatId}
                    onSelectChat={selectChat}
                    onCreateChat={createNewChat}
                    onDeleteChat={deleteChat}
                    isInitialized={!!schemaManager}
                />
            </div>

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
                {!isLoadingApiKey && db && selectedChatId ? (
                    <AIChat
                        db={db}
                        dbStateManager={dbStateManager || undefined}
                        apiKey={apiKey}
                        chatId={selectedChatId}
                        messages={chats.find(c => c.id === selectedChatId)?.messages || []}
                        onMessagesChange={handleMessagesChange}
                        onSendMessageReady={handleSendMessageReady}
                        selectedTable={selectedTable}
                        onTableSelect={handleTableSelection}
                        remoteFileComponent={(onClose) => (
                            <RemoteFileSimple 
                                db={db} 
                                dbStateManager={dbStateManager || undefined} 
                                onTableCreated={(tableName) => {
                                    setSelectedTable(tableName);
                                    if (dbStateManager) {
                                        dbStateManager.notifyTableChange();
                                    }
                                    onClose();
                                }}
                                onSendMessage={sendMessageRef.current || undefined}
                                onExampleMessages={(tableMessage, followUpMessage) => {
                                    handleExampleMessages(tableMessage, followUpMessage);
                                    onClose();
                                }}
                            />
                        )}
                    />
                ) : !isLoadingApiKey && db ? (
                    <div className="flex-1 flex items-center justify-center text-gray-500 p-4">
                        <div className="text-center">
                            <p className="mb-2">チャットを選択するか、新しいチャットを作成してください</p>
                            <button
                                onClick={() => createNewChat('graph')}
                                className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                            >
                                新しいグラフチャットを作成
                            </button>
                        </div>
                    </div>
                ) : null}
            </div>

            {/* Right Half - DuckDB and Table */}
            <div className="w-1/2 h-full flex flex-col overflow-hidden">
                <div className="flex-1 overflow-hidden flex flex-col">
                    {db && selectedTable && connection && (
                        <>
                            {/* Table Selector Header - moved to top */}
                            <div className="flex-shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <TableCellsIcon className="w-4 h-4 text-gray-600" />
                                    <div className="flex-1">
                                        <TableSelector
                                            db={db}
                                            dbStateManager={dbStateManager || undefined}
                                            selectedTable={selectedTable}
                                            onTableSelect={handleTableSelection}
                                            refreshTrigger={connectionTimestamp}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            {/* SQL Section */}
                            <div
                                className="flex-shrink-0 bg-white border-b border-gray-200 overflow-hidden"
                                style={{ height: `${sqlAreaHeight}px` }}
                            >
                                <div className="h-full p-2.5 overflow-auto">
                                    <TableSQLDisplay
                                        tableName={selectedTable}
                                        dbStateManager={dbStateManager}
                                    />
                                </div>
                            </div>
                            <ResizableDivider
                                onResize={setSqlAreaHeight}
                                minHeight={100}
                                maxHeight={500}
                                direction="top"
                            />
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {/* Table Section */}
                                <div 
                                    className="flex-shrink-0 overflow-hidden border-b border-gray-200"
                                    style={{ height: `${tableAreaHeight}px` }}
                                >
                                    <Table
                                        key={`${selectedChatId}-${selectedTable}-${connectionTimestamp}`}
                                        connection={connection}
                                        tableName={selectedTable}
                                        dbStateManager={dbStateManager || undefined}
                                    />
                                </div>
                                
                                {/* Resizable divider between table and graph/map */}
                                {(currentChat?.type === 'graph' || currentChat?.type === 'map') && (
                                    <ResizableDivider
                                        onResize={setTableAreaHeight}
                                        minHeight={100}
                                        maxHeight={600}
                                        direction="top"
                                    />
                                )}
                                
                                {/* Graph Section (for graph chats) */}
                                {currentChat?.type === 'graph' && (
                                    <div className="flex-1 overflow-hidden">
                                        <ChartGrid
                                            charts={chartSpec ? [chartSpec] : []}
                                            db={db}
                                            dbStateManager={dbStateManager || undefined}
                                        />
                                    </div>
                                )}
                                
                                {/* Map Section (for map chats) */}
                                {currentChat?.type === 'map' && (
                                    <div className="flex-1 overflow-hidden">
                                        <Map
                                            db={db}
                                            dbStateManager={dbStateManager || undefined}
                                            selectedTable={selectedTable}
                                            selectedColumns={mapSelectedColumns}
                                            geometryColumnName={selectedGeometryColumn}
                                            onViewStateChange={(viewState) => {
                                                // Save map state to chat
                                                if (selectedChatId) {
                                                    setChats(prevChats =>
                                                        prevChats.map(chat =>
                                                            chat.id === selectedChatId
                                                                ? { 
                                                                    ...chat, 
                                                                    mapState: {
                                                                        ...chat.mapState,
                                                                        center: viewState.center,
                                                                        zoom: viewState.zoom,
                                                                        bearing: viewState.bearing,
                                                                        pitch: viewState.pitch
                                                                    }
                                                                }
                                                                : chat
                                                        )
                                                    );
                                                }
                                            }}
                                            initialViewState={currentChat.mapState}
                                            initialStyle={currentChat.mapState?.style}
                                            onStyleUpdate={(style) => {
                                                // Save style to chat
                                                if (selectedChatId) {
                                                    setChats(prevChats =>
                                                        prevChats.map(chat =>
                                                            chat.id === selectedChatId
                                                                ? { 
                                                                    ...chat, 
                                                                    mapState: {
                                                                        ...chat.mapState,
                                                                        style
                                                                    }
                                                                }
                                                                : chat
                                                        )
                                                    );
                                                }
                                            }}
                                        />
                                    </div>
                                )}
                                
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
