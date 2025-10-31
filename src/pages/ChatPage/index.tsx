import { useState, useEffect, useRef, useCallback } from 'react';
import { Chat, EmptyChat } from '../../components/chat';
import ApiKeyInput from '../../components/chat/ApiKeyInput';
import { useAIChat } from '../../lib/ai/useAIChat';
import { TablePanel } from '../../components/table/TablePanel';
import { DataSourceSelector } from '../../components/data-source-selector';
import TableSQLDisplay from '../../components/query';
import TableSelector from '../../components/table/TableSelector';
import { useDuckDB } from '../../lib/duckdb/useDuckDB';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { ChartSpecModal, ChartPanel, ChartTypeSelector, type ChartTypeOption } from '../../components/chart';
import { MapPanel } from '../../components/map';
import { Sidebar } from '../../components/Sidebar';
import { Dashboard, ChartExportModal } from '../../components/dashboard';
import type { Dashboard as DashboardType } from '../../store/remoteAtoms';
import { TableCellsIcon, MapIcon } from '@heroicons/react/24/outline';
import { generateChartByType } from '../../utils/chartSpecGenerator';
import type { ChartSpec } from '../../types/chart';
import type { View } from 'vega';
import type { StructuredMessage } from '../../types/message';
import { useStoreSync } from '../../store/sync';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { currentDashboardAtom, selectDashboardAtom, currentChatStateAtom } from '../../store/derivedAtoms';
import { localStateAtom, viewModeAtom, chatWidthPercentageAtom } from '../../store/localAtoms';
import { ChatHistoryGrid, DashboardHistoryGrid } from '../../components/history';
import { ResizableHandle } from '../../components/ResizableHandle';
import { extractDataUrl, createTableFromUrl } from '../../utils/tableCreation';
import { chatIdToSchemaName } from '../../utils/schema';
import {
    useApiKeyManagement,
    useChatManagement,
    useSchemaManagement,
    useTableSelection,
    useMapVisualization,
    useChartVisualization,
    useTableHistorySync,
    useDashboardManagement,
} from './hooks';

function ChatPage() {
    const { dbContext, isInitializing } = useDuckDB();
    const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart' | 'map'>('table');
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState<'chart' | 'map' | 'table'>('chart');
    const [lastSelectedExportDashboard, setLastSelectedExportDashboard] = useState<string | null>(null);
    const [showChartConfig, setShowChartConfig] = useState(false);
    const [configuredChartSpec, setConfiguredChartSpec] = useState<ChartSpec | null>(null);
    const [showChartSpecModal, setShowChartSpecModal] = useState(false);
    const chatPageVegaViewRef = useRef<View | null>(null);
    const dbContextRef = useRef<DBContext | null>(dbContext);
    const isInitializingRef = useRef<boolean>(isInitializing);

    // Update refs when values change
    useEffect(() => {
        dbContextRef.current = dbContext;
    }, [dbContext]);

    useEffect(() => {
        isInitializingRef.current = isInitializing;
    }, [isInitializing]);

    // Wait for DuckDB context to be ready
    const waitForDbContext = useCallback(async (): Promise<DBContext> => {
        if (dbContextRef.current) return dbContextRef.current;
        if (!isInitializingRef.current) throw new Error('DuckDB initialization failed');

        return new Promise((resolve, reject) => {
            const checkInterval = setInterval(() => {
                if (dbContextRef.current) {
                    clearInterval(checkInterval);
                    resolve(dbContextRef.current);
                } else if (!isInitializingRef.current) {
                    clearInterval(checkInterval);
                    reject(new Error('DuckDB initialization failed'));
                }
            }, 100);

            setTimeout(() => {
                clearInterval(checkInterval);
                reject(new Error('DuckDB initialization timeout'));
            }, 30000);
        });
    }, []);

    // Enable state synchronization
    const { syncImmediately } = useStoreSync();

    // Extract title from completion tool result in messages
    const extractCompletionTitle = useCallback((messages: StructuredMessage[]): string | null => {
        // Search messages in reverse order to find the most recent completion tool
        for (let i = messages.length - 1; i >= 0; i--) {
            const message = messages[i];
            if (message.role !== 'assistant' || !Array.isArray(message.content)) continue;

            for (const block of message.content) {
                // Check tool_use for completion (this is where the title is in the input)
                if (block.type === 'tool_use' && block.name === 'completion') {
                    const input = block.input;
                    if (
                        input &&
                        typeof input === 'object' &&
                        'title' in input &&
                        typeof input.title === 'string' &&
                        input.title.trim()
                    ) {
                        return input.title.trim();
                    }
                }
            }
        }
        return null;
    }, []);

    // Dashboard state management with atoms
    const currentDashboard = useAtomValue(currentDashboardAtom);
    const localState = useAtomValue(localStateAtom);
    const selectedDashboardId = localState.selectedDashboardId;
    const setSelectedDashboard = useSetAtom(selectDashboardAtom);

    // View mode management (for history grids)
    const [viewMode, setViewMode] = useAtom(viewModeAtom);

    // Chat width management
    const [chatWidthPercentage, setChatWidthPercentage] = useAtom(chatWidthPercentageAtom);

    // API key management
    const { apiKey, setApiKey, showApiKeyInput, isLoadingApiKey, saveApiKey } = useApiKeyManagement();

    // Chat management with Jotai (needs to be first for chats state)
    const {
        chats,
        selectedChatId,
        createNewChat,
        deleteChat,
        renameChat,
        selectChat,
        updateChatMessages,
        updateChatState,
        getCurrentChatState,
    } = useChatManagement(dbContext);

    // Get current chat state reactively
    const currentChatState = useAtomValue(currentChatStateAtom);

    // Convert chatId to schemaName at the top level
    const schemaName = chatIdToSchemaName(selectedChatId);

    // Schema management (uses chats state from above)
    useSchemaManagement(dbContext, schemaName, chats, cleanedChartSpecs => {
        // Update the chat state with cleaned chartSpecs when orphaned specs are removed
        updateChatState({ chartSpecs: cleanedChartSpecs });
    });

    // Table selection
    const { selectedTable, handleTableSelection } = useTableSelection(dbContext, schemaName);

    // Icon click handlers for TableCreatedMessage
    const handleChartIconClick = useCallback(
        (tableName: string) => {
            handleTableSelection(tableName);
            setActiveTab('chart');
        },
        [handleTableSelection]
    );

    const handleMapIconClick = useCallback(
        (tableName: string) => {
            handleTableSelection(tableName);
            setActiveTab('map');
        },
        [handleTableSelection]
    );

    // Map visualization
    const {
        // mapSelectedColumns, // Unused but kept for API compatibility
        selectedGeometryColumn,
        tableStyles,
        mapStyle,
        updateTableStyle,
        deleteTableStyle,
    } = useMapVisualization(selectedTable, dbContext, schemaName);

    // Chart visualization
    const { chartSpec, updateChartFromAI, deleteChartFromAI } = useChartVisualization(
        selectedTable,
        dbContext,
        schemaName
    );

    // Handler for conversation completion - updates chat title if needed
    const handleConversationCompleted = useCallback(() => {
        // Just trigger immediate sync
        syncImmediately();
    }, [syncImmediately]);

    // Wrapper for updateChatMessages (keep same signature for compatibility)
    const updateChatMessagesWithAutoSelect = useCallback(
        (chatId: string, messages: StructuredMessage[]) => {
            updateChatMessages(chatId, messages);
        },
        [updateChatMessages]
    );

    // Check and update chat title when messages change
    const checkAndUpdateChatTitle = useCallback(
        (messages: StructuredMessage[]) => {
            if (!selectedChatId) return;

            const currentChat = chats.find(chat => chat.id === selectedChatId);
            if (!currentChat) return;

            // Only update if title is still default (isTitleDefault is true or undefined for backward compatibility)
            if (!currentChat.isTitleDefault) return;

            // Extract title from completion tool result
            const completionTitle = extractCompletionTitle(messages);
            if (completionTitle) {
                // Update the chat title (isDefault=false since AI explicitly provided a custom title)
                renameChat(selectedChatId, completionTitle, false);
            }
        },
        [selectedChatId, chats, extractCompletionTitle, renameChat]
    );

    // Message handling - now handled directly by AIStore
    const handleMessagesChange = useCallback(
        (messages: StructuredMessage[]) => {
            if (selectedChatId) {
                updateChatMessagesWithAutoSelect(selectedChatId, messages);
            }
            checkAndUpdateChatTitle(messages);
        },
        [selectedChatId, updateChatMessagesWithAutoSelect, checkAndUpdateChatTitle]
    );

    // Use AI Chat hook for Split View
    const { messages, isLoading, input, handleInputChange, handleSubmit, handleStop, sendMessage } = useAIChat({
        chatId: selectedChatId || 'default',
        schema: schemaName,
        dbContext,
        apiKey,
        selectedTable,
        onMessagesChange: handleMessagesChange,
        onChartUpdate: updateChartFromAI,
        onChartDelete: deleteChartFromAI,
        getCurrentChatState,
        onMapStyleUpdate: async (tableName: string, style: import('./../../components/map').TableStyle) => {
            updateTableStyle(tableName, style);
        },
        onMapStyleDelete: async (tableName: string) => {
            deleteTableStyle(tableName);
        },
        onConversationCompleted: handleConversationCompleted,
    });

    // Sync table creation history to remote state
    useTableHistorySync(dbContext, selectedChatId);

    // Dashboard management
    const {
        createDashboard,
        updateDashboard,
        deleteDashboard,
        getDashboard,
        getAllDashboards,
        updateDashboardLayout,
        hideVisualizationFromDashboard,
        showVisualizationOnDashboard,
        removeVisualizationFromDashboard,
        renameDashboard,
    } = useDashboardManagement();

    // Navigation handler for sidebar buttons
    const handleNavigate = useCallback(
        (view: 'chat' | 'dashboard-list') => {
            setViewMode(view);
            selectChat('');
            setSelectedDashboard(null);
        },
        [setViewMode, selectChat, setSelectedDashboard]
    );

    // Chat handlers
    const handleSelectChat = useCallback(
        (chatId: string) => {
            selectChat(chatId);
            setViewMode('chat');
            setSelectedDashboard(null);
        },
        [selectChat, setViewMode, setSelectedDashboard]
    );

    // Dashboard handlers
    const handleSelectDashboard = useCallback(
        (dashboardId: string) => {
            setSelectedDashboard(dashboardId);
            setViewMode('dashboard');
            selectChat('');
        },
        [setSelectedDashboard, setViewMode, selectChat]
    );

    const handleCreateDashboard = useCallback(() => {
        const newDashboard = createDashboard();
        setSelectedDashboard(newDashboard.id);
        setViewMode('dashboard');
        selectChat('');
    }, [createDashboard, setSelectedDashboard, setViewMode, selectChat]);

    const handleDeleteDashboard = (dashboardId: string) => {
        if (selectedDashboardId === dashboardId) {
            setSelectedDashboard(null);
        }
        deleteDashboard(dashboardId);
    };

    // Get sample data URL
    const getSampleDataUrl = useCallback(() => {
        const basePath = import.meta.env.BASE_URL || '/';
        return `${window.location.origin}${basePath}data/customer.parquet`;
    }, []);

    // Handle sending message with chat creation (for EmptyChat)
    // Returns the new chat ID and optional table name without selecting the chat, so caller can control when to switch
    const handleSendMessageWithChatCreation = useCallback(
        async (message: string): Promise<{ chatId: string; tableName?: string } | null> => {
            try {
                // Wait for DuckDB to be ready
                let db = dbContext;
                if (!db) {
                    if (!waitForDbContext) {
                        console.error('DuckDB is not initialized');
                        return null;
                    }
                    db = await waitForDbContext();
                }

                // Check if message is a URL
                const dataUrl = extractDataUrl(message);

                if (dataUrl) {
                    // URL case: create table first, then send the result message
                    const newChatId = await createNewChat(db);
                    if (!newChatId) {
                        console.error('Failed to create chat');
                        return null;
                    }

                    const newSchemaName = chatIdToSchemaName(newChatId);
                    const { tableName, message: tableMessage } = await createTableFromUrl(
                        dataUrl,
                        db,
                        newSchemaName || null
                    );

                    // Create a promise that resolves when messages are added
                    let resolveMessageAdded: (() => void) | null = null;
                    const messageAddedPromise = new Promise<void>(resolve => {
                        resolveMessageAdded = resolve;
                    });

                    // Create onMessagesChange for this specific chat
                    const newChatOnMessagesChange = (messages: StructuredMessage[]) => {
                        updateChatMessagesWithAutoSelect(newChatId, messages);
                        // Resolve promise when first message is added
                        if (messages.length > 0 && resolveMessageAdded) {
                            resolveMessageAdded();
                            resolveMessageAdded = null;
                        }
                    };

                    // Pass db, schema and onMessagesChange as overrides
                    await sendMessage(tableMessage, newChatId, db, newSchemaName, {
                        onMessagesChange: newChatOnMessagesChange,
                    });

                    // Wait for messages to be added
                    await messageAddedPromise;

                    // Return the chat ID and table name without selecting it
                    return { chatId: newChatId, tableName };
                } else {
                    // Normal message case
                    const newChatId = await createNewChat(db);
                    if (!newChatId) {
                        return null;
                    }

                    const newSchemaName = chatIdToSchemaName(newChatId);

                    // Create onMessagesChange for this specific chat
                    const newChatOnMessagesChange = (messages: StructuredMessage[]) => {
                        updateChatMessagesWithAutoSelect(newChatId, messages);
                    };

                    // Start sending message in background (don't wait)
                    sendMessage(message, newChatId, db, newSchemaName, {
                        onMessagesChange: newChatOnMessagesChange,
                    });

                    // Return the chat ID immediately without waiting for message to complete
                    return { chatId: newChatId };
                }
            } catch (error) {
                console.error('Failed to create chat:', error);
                throw error;
            }
        },
        [dbContext, waitForDbContext, createNewChat, sendMessage, updateChatMessagesWithAutoSelect]
    );

    // Handle chat created event from EmptyChat
    const handleChatCreated = useCallback(
        (chatId: string, tableName?: string) => {
            selectChat(chatId);

            // If a table was created, notify table change to trigger auto-selection
            if (tableName && dbContext) {
                const schemaName = chatIdToSchemaName(chatId);
                // Use setTimeout to ensure the chat is fully switched before notifying
                setTimeout(() => {
                    if (dbContext) {
                        dbContext.notifyTableChange(tableName, schemaName);
                    }
                }, 100);
            }
        },
        [selectChat, dbContext]
    );

    // Handle sending message with URL - creates table from URL in existing chat
    const handleSendMessageWithUrl = useCallback(
        async (url: string) => {
            if (!selectedChatId || !schemaName || !dbContext) {
                console.error('Cannot process URL: missing chat ID, schema, or dbContext');
                return;
            }

            try {
                // Extract and validate URL
                const dataUrl = extractDataUrl(url);
                if (!dataUrl) {
                    console.error('Invalid URL:', url);
                    return;
                }

                // Create table from URL in the current chat's schema
                const { message: tableMessage } = await createTableFromUrl(dataUrl, dbContext, schemaName);

                // Send the result message to AI
                sendMessage(tableMessage);
            } catch (error) {
                console.error('Failed to create table from URL:', error);
            }
        },
        [selectedChatId, schemaName, dbContext, sendMessage]
    );

    // Wrap sendMessage to handle URL processing for existing chat
    const sendMessageWithUrlProcessing = useCallback(
        (message: string) => {
            const dataUrl = extractDataUrl(message);

            if (dataUrl) {
                // URL case: create table from URL
                handleSendMessageWithUrl(message);
            } else {
                // Normal message case: send directly
                sendMessage(message);
            }
        },
        [handleSendMessageWithUrl, sendMessage]
    );

    // Wrap handleSubmit to handle URL processing
    const handleSubmitWithUrlProcessing = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();

            if (!input.trim()) return;

            const messageToSend = input.trim();
            const dataUrl = extractDataUrl(messageToSend);

            if (dataUrl) {
                // URL case: create table from URL (don't use handleSubmit)
                // Clear input first
                handleInputChange({ target: { value: '' } } as React.ChangeEvent<HTMLTextAreaElement>);
                await handleSendMessageWithUrl(messageToSend);
            } else {
                // Normal message case: use original handleSubmit
                await handleSubmit(e);
            }
        },
        [input, handleInputChange, handleSendMessageWithUrl, handleSubmit]
    );

    // Chart export to dashboard functionality
    const handleExportChartToDashboard = (dashboardIdOrDashboard: string | DashboardType) => {
        const exportSpec = displayChartSpec; // Use configured chart if available
        if (!selectedChatId || !exportSpec || !selectedTable) {
            console.warn('Cannot export chart: missing selectedChatId, chartSpec, or selectedTable');
            return;
        }

        // Persist configured changes to remote state before exporting
        if (configuredChartSpec && updateChartFromAI) {
            updateChartFromAI(selectedTable, configuredChartSpec.spec);
        }

        // Get dashboard object
        const dashboard =
            typeof dashboardIdOrDashboard === 'string' ? getDashboard(dashboardIdOrDashboard) : dashboardIdOrDashboard;

        if (!dashboard) {
            console.error('Dashboard not found:', dashboardIdOrDashboard);
            return;
        }

        const chart = exportSpec;

        const newVisualization = {
            id: `viz-${Date.now()}`,
            type: 'chart' as const,
            title: chart.title || 'Chart',
            chartSpec: chart,
            createdAt: new Date(),
            chatId: selectedChatId,
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
        };
        // Remember the selected dashboard for next time
        setLastSelectedExportDashboard(dashboard.id);

        // Update the dashboard
        updateDashboard(updatedDashboard);

        // Switch to the dashboard view to show available visualizations
        handleSelectDashboard(dashboard.id);
    };

    // Chart configuration handlers
    const handleChartSpecChange = (newSpec: ChartSpec) => {
        setConfiguredChartSpec(newSpec);
        // Don't update remote state immediately with auto-apply to avoid feedback loops
        // Remote state will be updated when chart is saved/exported or tab is switched
    };

    // Title update handlers for Table/Map panels
    const handleTableTitleChange = useCallback(
        (newTitle: string) => {
            if (!selectedTable) return;

            const currentTableSpecs = currentChatState?.tableSpecs || {};
            const currentTableSpec = currentTableSpecs[selectedTable];

            updateChatState({
                tableSpecs: {
                    [selectedTable]: {
                        id: currentTableSpec?.id || `table-spec-${Date.now()}`,
                        tableName: selectedTable,
                        timestamp: currentTableSpec?.timestamp || new Date(),
                        title: newTitle,
                        columns: currentTableSpec?.columns,
                    },
                },
            });
        },
        [selectedTable, currentChatState, updateChatState]
    );

    const handleMapTitleChange = useCallback(
        (newTitle: string) => {
            if (!selectedTable) return;

            const currentMapSpecs = currentChatState?.mapSpecs || {};
            const currentMapSpec = currentMapSpecs[selectedTable];

            updateChatState({
                mapSpecs: {
                    [selectedTable]: {
                        ...currentMapSpec,
                        title: newTitle,
                    },
                },
            });
        },
        [selectedTable, currentChatState, updateChatState]
    );

    const handleChartTitleChange = useCallback(
        (newTitle: string) => {
            if (!selectedTable) return;

            const currentChartSpecs = currentChatState?.chartSpecs || {};
            const currentChartSpec = currentChartSpecs[selectedTable];

            if (!currentChartSpec) return;

            updateChatState({
                chartSpecs: {
                    [selectedTable]: {
                        ...currentChartSpec,
                        title: newTitle,
                    },
                },
            });
        },
        [selectedTable, currentChatState, updateChatState]
    );

    // Persist configured chart changes when switching away from chart tab
    useEffect(() => {
        // When leaving chart tab, save configured changes to remote state
        if (activeTab !== 'chart' && configuredChartSpec && selectedTable && updateChartFromAI) {
            updateChartFromAI(selectedTable, configuredChartSpec.spec);
            // Clear local configured state since it's now in remote state
            setConfiguredChartSpec(null);
        }
    }, [activeTab, configuredChartSpec, selectedTable, updateChartFromAI]);

    // Persist configured chart changes when closing configuration panel
    useEffect(() => {
        // When closing config panel, save configured changes to remote state
        if (!showChartConfig && configuredChartSpec && selectedTable && updateChartFromAI) {
            updateChartFromAI(selectedTable, configuredChartSpec.spec);
            // Clear local configured state since it's now in remote state
            setConfiguredChartSpec(null);
        }
    }, [showChartConfig, configuredChartSpec, selectedTable, updateChartFromAI]);

    // Determine which chart spec to display - prefer configured version
    const displayChartSpec = configuredChartSpec || chartSpec;

    // Map export to dashboard functionality
    const handleExportMapToDashboard = (dashboardIdOrDashboard: string | DashboardType) => {
        if (!selectedChatId || !selectedTable) {
            console.warn('Cannot export map: missing selectedChatId or selectedTable');
            return;
        }

        // Get dashboard object
        const dashboard =
            typeof dashboardIdOrDashboard === 'string' ? getDashboard(dashboardIdOrDashboard) : dashboardIdOrDashboard;
        const mapSpecs = currentChatState?.mapSpecs;

        if (!dashboard) {
            console.error('Dashboard not found:', dashboardIdOrDashboard);
            return;
        }

        // Create map visualization with current map state
        const mapSpec = mapSpecs?.[selectedTable];
        const mapTitle = mapSpec?.title || `${selectedTable} Map`;
        const newVisualization = {
            id: `viz-${Date.now()}`,
            type: 'map' as const,
            title: mapTitle,
            mapSpec: mapSpec,
            tableName: selectedTable,
            geometryColumn: selectedGeometryColumn,
            sql: `SELECT * FROM ${selectedTable}`, // Base SQL for the table
            createdAt: new Date(),
            chatId: selectedChatId,
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
        };

        // Remember the selected dashboard for next time
        setLastSelectedExportDashboard(dashboard.id);

        // Update the dashboard
        updateDashboard(updatedDashboard);

        // Switch to the dashboard view to show available visualizations
        handleSelectDashboard(dashboard.id);
    };

    // Table export to dashboard functionality
    const handleExportTableToDashboard = (dashboardIdOrDashboard: string | DashboardType) => {
        if (!selectedChatId || !selectedTable) {
            console.warn('Cannot export table: missing selectedChatId or selectedTable');
            return;
        }

        // Get dashboard object
        const dashboard =
            typeof dashboardIdOrDashboard === 'string' ? getDashboard(dashboardIdOrDashboard) : dashboardIdOrDashboard;

        if (!dashboard) {
            console.error('Dashboard not found:', dashboardIdOrDashboard);
            return;
        }

        // Get table title from tableSpecs
        const tableSpecs = currentChatState?.tableSpecs || {};
        const tableSpec = tableSpecs[selectedTable];
        const tableTitle = tableSpec?.title || `Table: ${selectedTable}`;

        // Create table visualization
        const newVisualization = {
            id: `viz-${Date.now()}`,
            type: 'table' as const,
            title: tableTitle,
            tableName: selectedTable,
            sql: `SELECT * FROM ${selectedTable}`, // Base SQL for the table
            createdAt: new Date(),
            chatId: selectedChatId,
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
        };

        // Remember the selected dashboard for next time
        setLastSelectedExportDashboard(dashboard.id);

        // Update the dashboard
        updateDashboard(updatedDashboard);

        // Switch to the dashboard view to show available visualizations
        handleSelectDashboard(dashboard.id);
    };

    // Chart type selection handler
    const handleChartTypeSelect = async (chartType: ChartTypeOption) => {
        if (!selectedTable || !dbContext || !updateChartFromAI) {
            return;
        }

        try {
            const result = await generateChartByType(chartType, selectedTable, dbContext, schemaName);
            if (result) {
                updateChartFromAI(selectedTable, result.spec);
                // Automatically open the chart configuration panel
                setShowChartConfig(true);
            } else {
                alert('Failed to generate chart. Please make sure the table has appropriate data for this chart type.');
            }
        } catch (error) {
            console.error('Error generating chart:', error);
            alert('An error occurred while generating the chart.');
        }
    };

    // Show Home Screen when no chat is selected
    const showHomeScreen = !selectedChatId;

    // Sidebar selection: highlight button based on current view
    const sidebarSelection =
        viewMode === 'dashboard-list' ? 'dashboard-list' : viewMode === 'chat' && !selectedChatId ? 'chat' : undefined;

    return (
        <>
            <div className="flex h-full w-full overflow-hidden">
                {/* Sidebar */}
                <Sidebar selectedView={sidebarSelection} onNavigate={handleNavigate} />

                {/* Main Content Area */}
                {viewMode === 'dashboard-list' ? (
                    /* Dashboard History Grid */
                    <div className="flex-1 h-full overflow-hidden">
                        <DashboardHistoryGrid
                            dashboards={getAllDashboards().sort(
                                (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
                            )}
                            onSelectDashboard={handleSelectDashboard}
                            onDeleteDashboard={handleDeleteDashboard}
                            onRenameDashboard={renameDashboard}
                            onCreateDashboard={handleCreateDashboard}
                        />
                    </div>
                ) : selectedDashboardId ? (
                    /* Dashboard Mode - Full Width */
                    <div className="flex-1 h-full flex flex-col overflow-hidden">
                        {(() => {
                            if (!currentDashboard || !selectedDashboardId) return null;

                            return (
                                <Dashboard
                                    key={selectedDashboardId} // Force re-render when dashboard changes
                                    dashboard={currentDashboard}
                                    dbContext={dbContext!}
                                    schemaName={schemaName || 'main'}
                                    onLayoutChange={layout => updateDashboardLayout(selectedDashboardId, layout)}
                                    onRemoveVisualization={vizId => {
                                        if (!selectedDashboardId) {
                                            console.error('No dashboard selected for removal');
                                            return;
                                        }
                                        hideVisualizationFromDashboard(selectedDashboardId, vizId);
                                    }}
                                    onAddVisualization={vizId => {
                                        if (!selectedDashboardId) {
                                            console.error('No dashboard selected for adding visualization');
                                            return;
                                        }
                                        showVisualizationOnDashboard(selectedDashboardId, vizId);
                                    }}
                                    onDeleteVisualization={vizId => {
                                        if (!selectedDashboardId) {
                                            console.error('No dashboard selected for deletion');
                                            return;
                                        }
                                        // Permanently remove visualization from dashboard
                                        removeVisualizationFromDashboard(selectedDashboardId, vizId);
                                    }}
                                    onUpdateDashboard={updateDashboard}
                                />
                            );
                        })()}
                    </div>
                ) : showHomeScreen ? (
                    /* Home Screen - Centered Input + History Grid */
                    <div className="flex-1 h-full overflow-y-auto bg-gray-50">
                        <div className="min-h-full flex flex-col">
                            {/* Spacer */}
                            <div className="h-[35vh]" />

                            {/* Chat input */}
                            <div className="flex items-center justify-center px-8 pb-24">
                                <div className="w-full max-w-2xl relative">
                                    {!isLoadingApiKey && (
                                        <EmptyChat
                                            dbContext={dbContext}
                                            apiKey={apiKey}
                                            schemaName={schemaName}
                                            onApiKeyChange={setApiKey}
                                            onApiKeySave={saveApiKey}
                                            showApiKeyInput={showApiKeyInput}
                                            sendMessage={handleSendMessageWithChatCreation}
                                            onChatCreated={handleChatCreated}
                                            renderMenu={(onClose, onShowUrlGuide, onLoadSample) => (
                                                <DataSourceSelector
                                                    onClose={onClose}
                                                    onShowUrlGuide={onShowUrlGuide}
                                                    sampleUrl={getSampleDataUrl()}
                                                    onLoadSample={url => {
                                                        if (onLoadSample) {
                                                            onLoadSample(url);
                                                        }
                                                    }}
                                                />
                                            )}
                                        />
                                    )}
                                </div>
                            </div>

                            {/* Chat history grid */}
                            <div className="px-8 pb-8">
                                <ChatHistoryGrid
                                    chats={chats}
                                    onSelectChat={handleSelectChat}
                                    onDeleteChat={deleteChat}
                                    onRenameChat={renameChat}
                                />
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Chat Mode - Split View */
                    <>
                        {/* Left Half - AI Chat (Modeling Tools) */}
                        <div
                            className="h-full flex flex-col overflow-hidden py-4 pl-4 pr-2 bg-gray-50 text-gray-800 text-left"
                            style={{ width: `${chatWidthPercentage}%` }}
                            data-chat-width={chatWidthPercentage}
                        >
                            {showApiKeyInput && !isLoadingApiKey && (
                                <ApiKeyInput apiKey={apiKey} onApiKeyChange={setApiKey} onSave={saveApiKey} />
                            )}
                            {isLoadingApiKey && (
                                <div className="p-5 text-center text-gray-600">APIキーを読み込み中...</div>
                            )}
                            {!isLoadingApiKey && dbContext && selectedChatId && (
                                <Chat
                                    dbContext={dbContext}
                                    apiKey={apiKey}
                                    schemaName={schemaName}
                                    messages={messages}
                                    isLoading={isLoading}
                                    input={input}
                                    handleInputChange={handleInputChange}
                                    handleSubmit={handleSubmitWithUrlProcessing}
                                    handleStop={handleStop}
                                    sendMessage={sendMessageWithUrlProcessing}
                                    selectedTable={selectedTable}
                                    onTableSelect={handleTableSelection}
                                    currentChatState={currentChatState}
                                    onLoadSample={handleSendMessageWithUrl}
                                    renderMenu={(onClose, onShowUrlGuide, onLoadSample) => (
                                        <DataSourceSelector
                                            onClose={onClose}
                                            onShowUrlGuide={onShowUrlGuide}
                                            sampleUrl={getSampleDataUrl()}
                                            onLoadSample={onLoadSample || (() => {})}
                                        />
                                    )}
                                    onChartIconClick={handleChartIconClick}
                                    onMapIconClick={handleMapIconClick}
                                />
                            )}
                        </div>

                        {/* Resizable Handle */}
                        <ResizableHandle
                            onResize={setChatWidthPercentage}
                            minWidthPercentage={20}
                            maxWidthPercentage={80}
                        />

                        {/* Right Half - DuckDB and Table */}
                        <div
                            className="h-full flex flex-col overflow-hidden py-4 pl-2 pr-4 bg-gray-50"
                            style={{ width: `${100 - chatWidthPercentage}%` }}
                        >
                            {dbContext && selectedTable && (
                                <div className="flex-1 overflow-hidden flex flex-col bg-white border border-gray-300 rounded-md">
                                    {/* Table Selector Header */}
                                    <div className="flex-shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-200 rounded-t-md">
                                        <div className="flex items-center gap-2">
                                            <TableCellsIcon className="w-4 h-4 text-gray-600" />
                                            <div className="flex-1">
                                                <TableSelector
                                                    dbContext={dbContext}
                                                    selectedTable={selectedTable}
                                                    onTableSelect={handleTableSelection}
                                                    schema={schemaName}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tab Navigation */}
                                    <div className="flex-shrink-0 border-b border-gray-200 bg-white">
                                        <div className="flex">
                                            <button
                                                onClick={() => setActiveTab('sql')}
                                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                                    activeTab === 'sql'
                                                        ? 'border-blue-500 text-blue-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                            >
                                                クエリ
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('table')}
                                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                                    activeTab === 'table'
                                                        ? 'border-blue-500 text-blue-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                            >
                                                テーブル
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('chart')}
                                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                                    activeTab === 'chart'
                                                        ? 'border-blue-500 text-blue-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    グラフ
                                                    {displayChartSpec && (
                                                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                                    )}
                                                </span>
                                            </button>
                                            <button
                                                onClick={() => setActiveTab('map')}
                                                className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                                    activeTab === 'map'
                                                        ? 'border-blue-500 text-blue-600'
                                                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    地図
                                                    {selectedGeometryColumn && (
                                                        <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                                                    )}
                                                </span>
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tab Content */}
                                    <div className="flex-1 overflow-hidden">
                                        {/* SQL Tab */}
                                        {activeTab === 'sql' && (
                                            <div className="h-full p-4 overflow-auto">
                                                <TableSQLDisplay
                                                    tableName={selectedTable}
                                                    dbContext={dbContext}
                                                    schema={schemaName}
                                                />
                                            </div>
                                        )}

                                        {/* Table Tab */}
                                        {activeTab === 'table' &&
                                            (() => {
                                                const tableSpecs = currentChatState?.tableSpecs || {};
                                                const tableSpec = tableSpecs[selectedTable];
                                                const displayTitle = tableSpec?.title;

                                                return (
                                                    <TablePanel
                                                        key={`${selectedChatId}-${selectedTable}`}
                                                        title={displayTitle}
                                                        tableName={selectedTable}
                                                        dbContext={dbContext}
                                                        schema={schemaName || null}
                                                        showExportButton={true}
                                                        onExport={() => {
                                                            setExportType('table');
                                                            setShowExportModal(true);
                                                        }}
                                                        exportTooltip="このテーブルをダッシュボードにエクスポート"
                                                        editable={true}
                                                        onTitleChange={handleTableTitleChange}
                                                    />
                                                );
                                            })()}

                                        {/* Chart Tab */}
                                        {activeTab === 'chart' &&
                                            selectedTable &&
                                            (displayChartSpec && selectedChatId ? (
                                                <ChartPanel
                                                    chartSpec={displayChartSpec}
                                                    dbContext={dbContext}
                                                    schema={schemaName || 'main'}
                                                    configMode="panel"
                                                    onViewReady={view => {
                                                        chatPageVegaViewRef.current = view;
                                                    }}
                                                    onConfigOpen={() => setShowChartConfig(!showChartConfig)}
                                                    onJsonSourceOpen={() => setShowChartSpecModal(true)}
                                                    onRemove={() => {
                                                        if (selectedTable && deleteChartFromAI) {
                                                            deleteChartFromAI(selectedTable);
                                                            setConfiguredChartSpec(null);
                                                            setShowChartConfig(false);
                                                        }
                                                    }}
                                                    onSpecChange={handleChartSpecChange}
                                                    showConfigPanel={showChartConfig}
                                                    onCloseConfigPanel={() => setShowChartConfig(false)}
                                                    autoApplyChanges={true}
                                                    showApplyButton={false}
                                                    showMenuExportButton={true}
                                                    onExport={() => {
                                                        setExportType('chart');
                                                        setShowExportModal(true);
                                                    }}
                                                    exportTooltip="このグラフをダッシュボードにエクスポート"
                                                    editable={true}
                                                    onTitleChange={handleChartTitleChange}
                                                />
                                            ) : (
                                                <div className="h-full flex items-center justify-center bg-gray-50">
                                                    <ChartTypeSelector onSelectType={handleChartTypeSelect} />
                                                </div>
                                            ))}

                                        {/* Map Tab */}
                                        {activeTab === 'map' &&
                                            selectedTable &&
                                            (selectedGeometryColumn ? (
                                                (() => {
                                                    const mapSpecs = currentChatState?.mapSpecs || {};
                                                    const mapSpec = mapSpecs[selectedTable];
                                                    const displayTitle = mapSpec?.title || selectedTable;

                                                    return (
                                                        <MapPanel
                                                            title={displayTitle}
                                                            tableName={selectedTable}
                                                            geometryColumn={selectedGeometryColumn}
                                                            dbContext={dbContext}
                                                            schema={schemaName || undefined}
                                                            mapSpec={{ tableStyles, style: mapStyle }}
                                                            showRemoveButton={false}
                                                            onExport={() => {
                                                                setExportType('map');
                                                                setShowExportModal(true);
                                                            }}
                                                            showExportButton={true}
                                                            exportTooltip="この地図をダッシュボードにエクスポート"
                                                            editable={true}
                                                            onTitleChange={handleMapTitleChange}
                                                        />
                                                    );
                                                })()
                                            ) : (
                                                <div className="h-full flex items-center justify-center bg-gray-50">
                                                    <div className="text-center text-gray-500 max-w-md">
                                                        <MapIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                                                        <p className="text-lg mb-4">ジオメトリカラムが存在しません</p>
                                                        <p className="text-sm mb-2">
                                                            地図を表示するには、ジオメトリ情報を持つテーブルが必要です。
                                                        </p>
                                                        <p className="text-sm mb-4">以下の方法をお試しください：</p>
                                                        <ul className="text-sm text-left mb-4 space-y-2">
                                                            <li>• ジオメトリ情報を含むデータを読み込む</li>
                                                            <li>
                                                                • 緯度経度カラムからジオメトリを生成するようAIに依頼する
                                                            </li>
                                                            <li>• ジオメトリ情報を持つ別のテーブルと結合する</li>
                                                        </ul>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            )}
                            {dbContext && !selectedTable && (
                                <div className="flex items-center justify-center h-full text-gray-500">
                                    テーブルを選択してください
                                </div>
                            )}
                        </div>
                        {/* End of Right Half */}
                    </>
                )}
                {/* End of Main Content Area */}
            </div>

            {/* Export Modal */}
            <ChartExportModal
                isOpen={showExportModal}
                onClose={() => setShowExportModal(false)}
                dashboards={getAllDashboards()}
                onExport={
                    exportType === 'chart'
                        ? handleExportChartToDashboard
                        : exportType === 'map'
                          ? handleExportMapToDashboard
                          : handleExportTableToDashboard
                }
                onCreateDashboard={createDashboard}
                onNavigateToDashboard={dashboardId => {
                    setSelectedDashboard(dashboardId);
                    setViewMode('dashboard');
                    selectChat('');
                }}
                title={
                    exportType === 'chart'
                        ? displayChartSpec?.title || 'Chart'
                        : exportType === 'map'
                          ? (selectedTable && currentChatState?.mapSpecs?.[selectedTable]?.title) ||
                            `${selectedTable} Map`
                          : (selectedTable && currentChatState?.tableSpecs?.[selectedTable]?.title) ||
                            `Table: ${selectedTable}`
                }
                type={exportType}
                lastSelectedDashboard={lastSelectedExportDashboard}
            />

            {/* Chart Spec Modal */}
            {displayChartSpec && (
                <ChartSpecModal
                    isOpen={showChartSpecModal}
                    onClose={() => setShowChartSpecModal(false)}
                    chartSpec={displayChartSpec.spec}
                    vegaView={chatPageVegaViewRef.current}
                    aiGeneratedSpec={displayChartSpec.aiGeneratedSpec}
                    onApply={newSpec => {
                        if (selectedTable && updateChartFromAI) {
                            updateChartFromAI(selectedTable, newSpec);
                        }
                    }}
                />
            )}
        </>
    );
}

export default ChatPage;
