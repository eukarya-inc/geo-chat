import { useState, useEffect, useCallback, useRef } from 'react';
import type { Chat } from '../../components/chat/ChatList';
import type { StructuredMessage } from '../../types/message';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { createSchemaManager, type SchemaManager } from '../../lib/duckdb/schemaManager';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { StyleSpecification } from 'maplibre-gl';
import { checkTableGeometry } from '../../utils/duckdbGeometryHelpers';
import { generateDefaultCharts } from '../../utils/autoChartGenerator';
import type { ChartSpec } from '../../types/chart';
import type { TableStyle, ExtraStyle } from '../../components/map';
import { storeEncryptedApiKey, retrieveEncryptedApiKey } from '../../utils/encryption';

// Type definitions for Map state
interface MapViewState {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
}

export function useAIChatModeling(dbContext: DBContext | null) {
    // Chat management state
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
    const [schemaManager, setSchemaManager] = useState<SchemaManager | null>(null);
    
    // Table and connection state
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [connection, setConnection] = useState<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);
    const [connectionTimestamp, setConnectionTimestamp] = useState<number>(Date.now());
    
    // Chart state
    const [chartSpec, setChartSpec] = useState<ChartSpec | null>(null);
    
    // Map state
    const [mapSelectedColumns, setMapSelectedColumns] = useState<string[]>([]);
    const [selectedGeometryColumn, setSelectedGeometryColumn] = useState<string>('geometry');
    const [tableStyles, setTableStyles] = useState<Record<string, TableStyle>>({});
    const [extraMapStyle, setExtraMapStyle] = useState<ExtraStyle | undefined>(undefined);
    
    // Message sending ref
    const sendMessageRef = useRef<((message: string) => void) | null>(null);

    // Get current chat
    const currentChat = chats.find(chat => chat.id === selectedChatId);

    // Handle table selection and update chat state
    const handleTableSelection = useCallback((tableName: string | null) => {
        setSelectedTable(tableName);
        
        // Update the selected table in the current chat
        if (selectedChatId && tableName !== undefined) {
            setChats(prevChats => 
                prevChats.map(chat => 
                    chat.id === selectedChatId 
                        ? { ...chat, selectedTable: tableName }
                        : chat
                )
            );
        }
    }, [selectedChatId]);

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

    // No longer need this effect since handleTableSelection already updates the chat

    // Chat management functions
    const createNewChat = async (type: 'graph' | 'map') => {
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

            // Reset table selection since we're in a new schema
            setSelectedTable(null);

            // Notify table change to refresh table list
            if (dbContext) {
                dbContext.notifyTableChange(undefined, newChat.id);
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
                // Reset table selection
                setSelectedTable(null);
            }

            // Notify table change
            if (dbContext) {
                dbContext.notifyTableChange(undefined, selectedChatId);
            }
        }
    };

    // Handle chat selection
    const selectChat = async (chatId: string) => {
        if (!schemaManager) return;

        // Find the chat being selected
        const targetChat = chats.find(chat => chat.id === chatId);
        if (!targetChat) return;

        // Clear selected table immediately when switching chats
        setSelectedTable(null);

        // Set the selected chat ID - this will trigger the useEffect that switches schema
        setSelectedChatId(chatId);
    };

    // Initialize schema manager and create first chat
    useEffect(() => {
        if (dbContext) {
            const manager = createSchemaManager(dbContext);
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

                        if (dbContext) {
                            setTimeout(() => {
                                dbContext.notifyTableChange(undefined, firstChat.id);
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
    }, [dbContext]); // Only depend on dbContext to avoid re-creating chats

    // Combined schema switching and connection setup
    useEffect(() => {
        if (!schemaManager || !dbContext || !selectedChatId) return;

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

                // Create new connection with the new schema
                const conn = await dbContext.createManagedConnection(selectedChatId);
                currentConnection = conn;

                // Connection already has schema set correctly by dbContext

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
                            // Table not found in schema, clear the saved selection
                            setSelectedTable(null);
                            // Also update the chat to clear the invalid table reference
                            setChats(prevChats =>
                                prevChats.map(chat =>
                                    chat.id === selectedChatId
                                        ? { ...chat, selectedTable: null }
                                        : chat
                                )
                            );
                        }
                    } else {
                        // Ensure table is cleared if chat has no saved selection
                        setSelectedTable(null);
                    }
                    
                    // Notify table change after connection is established
                    if (dbContext) {
                        setTimeout(() => {
                            dbContext.notifyTableChange(undefined, selectedChatId);
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
    }, [selectedChatId, dbContext, schemaManager]); // Only depend on selectedChatId, dbContext, and schemaManager

    // Subscribe to table changes from dbContext
    useEffect(() => {
        if (!dbContext) return;

        const unsubscribe = dbContext.onTableChange(async (tableName?: string, schema?: string | null) => {
            // Only process table changes for the current chat's schema
            if (schema !== selectedChatId) {
                return;
            }

            // Force consistency across all connections
            try {
                await dbContext.forceConsistency();
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
    }, [dbContext, handleTableSelection, selectedChatId]);

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
            if (!selectedTable || !dbContext) {
                setChartSpec(null);
                return;
            }

            try {
                const defaultCharts = await generateDefaultCharts(selectedTable, dbContext, selectedChatId);

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
    }, [selectedTable, dbContext, selectedChatId]);

    // Handle send message ready callback
    const handleSendMessageReady = useCallback((sendFn: (message: string) => void) => {
        sendMessageRef.current = sendFn;
    }, []);

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

    // Create memoized callback for message updates
    const handleMessagesChange = useCallback((messages: StructuredMessage[]) => {
        if (selectedChatId) {
            updateChatMessages(selectedChatId, messages);
        }
    }, [selectedChatId, updateChatMessages]);

    // Update table styles in chat
    const updateTableStyle = useCallback((tableName: string, style: TableStyle) => {
        // Update local state
        setTableStyles(prev => ({
            ...prev,
            [tableName]: style
        }));
        
        // Save to chat
        if (selectedChatId) {
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === selectedChatId
                        ? { 
                            ...chat, 
                            tableStyles: {
                                ...chat.tableStyles,
                                [tableName]: style
                            }
                        }
                        : chat
                )
            );
        }
    }, [selectedChatId]);

    // Update extra map style in chat
    const updateExtraMapStyle = useCallback((style: ExtraStyle | undefined) => {
        // Update local state
        setExtraMapStyle(style);
        
        // Save to chat
        if (selectedChatId) {
            setChats(prevChats =>
                prevChats.map(chat =>
                    chat.id === selectedChatId
                        ? { 
                            ...chat, 
                            extraMapStyle: style
                        }
                        : chat
                )
            );
        }
    }, [selectedChatId]);

    // Update map view state in chat
    const updateMapViewState = useCallback((viewState: MapViewState) => {
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
    }, [selectedChatId]);

    // Update map style in chat
    const updateMapStyle = useCallback((style: StyleSpecification) => {
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
    }, [selectedChatId]);

    return {
        // Chat state
        chats,
        selectedChatId,
        currentChat,
        schemaManager,
        
        // Table and connection state
        selectedTable,
        connection,
        connectionTimestamp,
        
        // Chart state
        chartSpec,
        
        // Map state
        mapSelectedColumns,
        selectedGeometryColumn,
        tableStyles,
        extraMapStyle,
        
        // Refs
        sendMessageRef,
        
        // Chat management functions
        createNewChat,
        deleteChat,
        selectChat,
        
        // Table functions
        handleTableSelection,
        
        // Message functions
        handleMessagesChange,
        handleSendMessageReady,
        handleExampleMessages,
        
        // Map functions
        updateTableStyle,
        updateExtraMapStyle,
        updateMapViewState,
        updateMapStyle,
    };
}

// Hook for API key management
export function useApiKeyManagement() {
    const [apiKey, setApiKey] = useState<string>('');
    const [showApiKeyInput, setShowApiKeyInput] = useState<boolean>(true);
    const [isLoadingApiKey, setIsLoadingApiKey] = useState<boolean>(true);

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

    const saveApiKey = async (key: string) => {
        if (key.trim()) {
            try {
                // Save encrypted API key to localStorage
                await storeEncryptedApiKey(key.trim());
                setApiKey(key.trim());
                setShowApiKeyInput(false);
                return true;
            } catch {
                return false;
            }
        }
        return false;
    };

    return {
        apiKey,
        setApiKey,
        showApiKeyInput,
        isLoadingApiKey,
        saveApiKey,
    };
}

// Hook for resizable areas
export function useResizableAreas() {
    const [sqlAreaHeight, setSqlAreaHeight] = useState(200);
    const [tableAreaHeight, setTableAreaHeight] = useState(300);

    return {
        sqlAreaHeight,
        setSqlAreaHeight,
        tableAreaHeight,
        setTableAreaHeight,
    };
}