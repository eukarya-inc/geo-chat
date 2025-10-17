import { useState, useEffect, useRef } from 'react';
import AIChat from '../../components/chat';
import { TableView } from '../../components/table/TableView';
import RemoteFile from '../../components/remote-file';
import TableSQLDisplay from '../../components/query';
import TableSelector from '../../components/table/TableSelector';
import { useDuckDB } from '../../lib/duckdb/useDuckDB';
import { ChartSpecModal, ChartPanel, ChartTypeSelector, type ChartTypeOption } from '../../components/chart';
import { MapPanel } from '../../components/map';
import { ChatList } from '../../components/chat/ChatList';
import { Dashboard, ChartExportModal } from '../../components/dashboard';
import { TableCellsIcon, MapIcon } from '@heroicons/react/24/outline';
import { generateChartByType } from '../../utils/chartSpecGenerator';
import type { ChartSpec } from '../../types/chart';
import type { View } from 'vega';
import { useStoreSync } from '../../store/sync';
import { useAtomValue, useSetAtom } from 'jotai';
import { currentDashboardAtom, selectDashboardAtom } from '../../store/derivedAtoms';
import { localStateAtom } from '../../store/localAtoms';
import {
    chatIdToSchemaName,
    useApiKeyManagement,
    useChatManagement,
    useSchemaManagement,
    useTableSelection,
    useMapVisualization,
    useChartVisualization,
    useMessageHandling,
    useTableHistorySync,
    useDashboardManagement,
} from './hooks';

function ChatPage() {
    const { dbContext } = useDuckDB();
    const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart' | 'map'>('table');
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState<'chart' | 'map'>('chart');
    const [lastSelectedExportDashboard, setLastSelectedExportDashboard] = useState<string | null>(null);
    const [showChartConfig, setShowChartConfig] = useState(false);
    const [configuredChartSpec, setConfiguredChartSpec] = useState<ChartSpec | null>(null);
    const [showChartSpecModal, setShowChartSpecModal] = useState(false);
    const chatPageVegaViewRef = useRef<View | null>(null);

    // Enable state synchronization
    const { syncImmediately } = useStoreSync();

    // Dashboard state management with atoms
    const currentDashboard = useAtomValue(currentDashboardAtom);
    const localState = useAtomValue(localStateAtom);
    const selectedDashboardId = localState.selectedDashboardId;
    const setSelectedDashboard = useSetAtom(selectDashboardAtom);

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

    // Convert chatId to schemaName at the top level
    const schemaName = chatIdToSchemaName(selectedChatId);

    // Schema management (uses chats state from above)
    const { connection } = useSchemaManagement(dbContext, schemaName, chats, cleanedChartSpecs => {
        // Update the chat state with cleaned chartSpecs when orphaned specs are removed
        updateChatState({ chartSpecs: cleanedChartSpecs });
    });

    // Table selection
    const { selectedTable, handleTableSelection } = useTableSelection(dbContext, schemaName, connection);

    // Map visualization
    const {
        // mapSelectedColumns, // Unused but kept for API compatibility
        selectedGeometryColumn,
        tableStyles,
        mapStyle,
        updateTableStyle,
        deleteTableStyle,
    } = useMapVisualization(selectedTable, connection);

    // Chart visualization
    const { chartSpec, updateChartFromAI, deleteChartFromAI } = useChartVisualization(
        selectedTable,
        dbContext,
        schemaName,
        connection
    );

    // Message handling
    const { sendMessageRef, handleSendMessageReady, handleMessagesChange } = useMessageHandling(
        selectedChatId,
        updateChatMessages
    );

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
        renameDashboard,
    } = useDashboardManagement();

    // Dashboard handlers
    const handleCreateDashboard = () => {
        const newDashboard = createDashboard();
        setSelectedDashboard(newDashboard.id);
        // Clear chat selection when dashboard is selected
        if (selectedChatId) {
            selectChat('');
        }
    };

    const handleSelectDashboard = (dashboardId: string) => {
        setSelectedDashboard(dashboardId);
        // Clear chat selection when dashboard is selected
        if (selectedChatId) {
            selectChat('');
        }
    };

    const handleSelectChat = (chatId: string) => {
        selectChat(chatId);
        // Clear dashboard selection when chat is selected
        setSelectedDashboard(null);
    };

    const handleDeleteDashboard = (dashboardId: string) => {
        // Clear selection if deleting the currently selected dashboard
        if (selectedDashboardId === dashboardId) {
            setSelectedDashboard(null);
        }
        deleteDashboard(dashboardId);
    };

    // Chart export to dashboard functionality
    const handleExportChartToDashboard = (dashboardId: string) => {
        const exportSpec = displayChartSpec; // Use configured chart if available
        if (!selectedChatId || !exportSpec || !selectedTable) {
            console.warn('Cannot export chart: missing selectedChatId, chartSpec, or selectedTable');
            return;
        }

        // Persist configured changes to remote state before exporting
        if (configuredChartSpec && updateChartFromAI) {
            updateChartFromAI(selectedTable, configuredChartSpec.spec);
        }

        const dashboard = getDashboard(dashboardId);

        if (!dashboard) {
            console.error('Dashboard not found:', dashboardId);
            return;
        }

        const chart = exportSpec;

        // Extract SQL from chart spec
        const chartSql = chart.spec?.data?.sql;

        const newVisualization = {
            id: `viz-${Date.now()}`,
            type: 'chart' as const,
            title: chart.title || 'Chart',
            chartSpec: chart,
            sql: chartSql,
            createdAt: new Date(),
        };

        const newLayout = {
            i: newVisualization.id,
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            minW: 3,
            minH: 2,
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
            layout: [...dashboard.layout, newLayout],
        };
        // Remember the selected dashboard for next time
        setLastSelectedExportDashboard(dashboardId);

        // Update the dashboard
        updateDashboard(updatedDashboard);

        // Automatically switch to the dashboard view to show the newly added chart
        handleSelectDashboard(dashboardId);
    };

    // Chart configuration handlers
    const handleChartSpecChange = (newSpec: ChartSpec) => {
        setConfiguredChartSpec(newSpec);
        // Don't update remote state immediately with auto-apply to avoid feedback loops
        // Remote state will be updated when chart is saved/exported or tab is switched
    };

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
    const handleExportMapToDashboard = (dashboardId: string) => {
        if (!selectedChatId || !selectedTable) {
            console.warn('Cannot export map: missing selectedChatId or selectedTable');
            return;
        }

        const dashboard = getDashboard(dashboardId);
        const mapSpecs = getCurrentChatState()?.mapSpecs;

        if (!dashboard) {
            console.error('Dashboard not found:', dashboardId);
            return;
        }

        // Create map visualization with current map state
        const mapSpec = mapSpecs?.[selectedTable];
        const newVisualization = {
            id: `viz-${Date.now()}`,
            type: 'map' as const,
            title: `${selectedTable} Map`,
            mapSpec: mapSpec,
            tableName: selectedTable,
            geometryColumn: selectedGeometryColumn,
            sql: `SELECT * FROM ${selectedTable}`, // Base SQL for the table
            createdAt: new Date(),
        };

        const newLayout = {
            i: newVisualization.id,
            x: 0,
            y: 0,
            w: 8,
            h: 6,
            minW: 4,
            minH: 3,
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
            layout: [...dashboard.layout, newLayout],
        };

        // Remember the selected dashboard for next time
        setLastSelectedExportDashboard(dashboardId);

        // Update the dashboard
        updateDashboard(updatedDashboard);

        // Automatically switch to the dashboard view to show the newly added map
        handleSelectDashboard(dashboardId);
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

    // Check if current chat has any messages
    const currentChatMessages = getCurrentChatState()?.messages || [];
    const hasMessages = currentChatMessages.length > 0;
    const isEmptyChat = selectedChatId && !hasMessages;

    return (
        <>
            <div className="flex h-full w-full overflow-hidden">
                {/* Sidebar with Chat List */}
                <div className="w-64 h-full border-r border-gray-300 bg-gray-50 flex-shrink-0">
                    <ChatList
                        chats={chats}
                        selectedChatId={selectedChatId}
                        onSelectChat={handleSelectChat}
                        onCreateChat={createNewChat}
                        onDeleteChat={deleteChat}
                        onRenameChat={renameChat}
                        isInitialized={!!dbContext}
                        dashboards={getAllDashboards()}
                        onCreateDashboard={handleCreateDashboard}
                        onSelectDashboard={handleSelectDashboard}
                        onDeleteDashboard={handleDeleteDashboard}
                        onRenameDashboard={renameDashboard}
                        selectedDashboardId={selectedDashboardId}
                    />
                </div>

                {/* Main Content Area */}
                {selectedDashboardId ? (
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
                                    onUpdateDashboard={updateDashboard}
                                />
                            );
                        })()}
                    </div>
                ) : isEmptyChat ? (
                    /* Empty Chat Mode - Centered Input */
                    <div className="flex-1 h-full flex items-center justify-center p-4">
                        <div className="w-full max-w-3xl -mt-32">
                            {!isLoadingApiKey && dbContext && selectedChatId && (
                                <AIChat
                                    dbContext={dbContext}
                                    apiKey={apiKey}
                                    chatId={selectedChatId}
                                    schemaName={schemaName}
                                    onMessagesChange={handleMessagesChange}
                                    updateChatMessages={updateChatMessages}
                                    onSendMessageReady={handleSendMessageReady}
                                    selectedTable={selectedTable}
                                    onTableSelect={handleTableSelection}
                                    onChartUpdate={updateChartFromAI}
                                    onChartDelete={deleteChartFromAI}
                                    getCurrentChatState={getCurrentChatState}
                                    onMapStyleUpdate={async (
                                        tableName: string,
                                        style: import('../../components/map').TableStyle
                                    ) => {
                                        updateTableStyle(tableName, style);
                                    }}
                                    onMapStyleDelete={async (tableName: string) => {
                                        deleteTableStyle(tableName);
                                    }}
                                    onConversationCompleted={syncImmediately}
                                    remoteFileComponent={onClose => (
                                        <RemoteFile
                                            dbContext={dbContext}
                                            schema={schemaName}
                                            onTableCreated={(tableName: string) => {
                                                handleTableSelection(tableName);
                                                if (dbContext) {
                                                    dbContext.notifyTableChange(tableName, schemaName);
                                                }
                                                onClose();
                                            }}
                                            onSendMessage={sendMessageRef.current || undefined}
                                        />
                                    )}
                                    emptyMode={true}
                                />
                            )}
                        </div>
                    </div>
                ) : (
                    /* Chat Mode - Split View */
                    <>
                        {/* Left Half - AI Chat (Modeling Tools) */}
                        <div className="w-1/2 h-full border-r border-gray-300 flex flex-col overflow-hidden">
                            {showApiKeyInput && !isLoadingApiKey && (
                                <div className="p-4 bg-gray-50 border-b border-gray-300 flex-shrink-0">
                                    <div className="mb-2.5 text-sm font-bold">Anthropic API Key Settings</div>
                                    <div className="flex gap-2.5 items-center">
                                        <input
                                            type="password"
                                            value={apiKey}
                                            onChange={e => setApiKey(e.target.value)}
                                            placeholder="Enter your Anthropic API key..."
                                            className="flex-1 px-3 py-2 border border-gray-300 rounded text-sm"
                                        />
                                        <button
                                            onClick={async () => {
                                                const success = await saveApiKey(apiKey);
                                                if (!success && apiKey.trim()) {
                                                    alert('APIキーの保存に失敗しました。');
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
                                        Your API key is encrypted and stored locally in your browser and never sent to
                                        our servers.
                                    </div>
                                </div>
                            )}
                            {isLoadingApiKey && (
                                <div className="p-5 text-center text-gray-600">APIキーを読み込み中...</div>
                            )}
                            {!isLoadingApiKey && dbContext && selectedChatId ? (
                                <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                                    <AIChat
                                        dbContext={dbContext}
                                        apiKey={apiKey}
                                        chatId={selectedChatId}
                                        schemaName={schemaName}
                                        onMessagesChange={handleMessagesChange}
                                        updateChatMessages={updateChatMessages}
                                        onSendMessageReady={handleSendMessageReady}
                                        selectedTable={selectedTable}
                                        onTableSelect={handleTableSelection}
                                        onChartUpdate={updateChartFromAI}
                                        onChartDelete={deleteChartFromAI}
                                        getCurrentChatState={getCurrentChatState}
                                        onMapStyleUpdate={async (
                                            tableName: string,
                                            style: import('../../components/map').TableStyle
                                        ) => {
                                            updateTableStyle(tableName, style);
                                        }}
                                        onMapStyleDelete={async (tableName: string) => {
                                            deleteTableStyle(tableName);
                                        }}
                                        onConversationCompleted={syncImmediately}
                                        remoteFileComponent={onClose => (
                                            <RemoteFile
                                                dbContext={dbContext}
                                                schema={schemaName}
                                                onTableCreated={(tableName: string) => {
                                                    handleTableSelection(tableName);
                                                    if (dbContext) {
                                                        dbContext.notifyTableChange(tableName, schemaName);
                                                    }
                                                    onClose();
                                                }}
                                                onSendMessage={sendMessageRef.current || undefined}
                                            />
                                        )}
                                    />
                                </div>
                            ) : !isLoadingApiKey && dbContext ? (
                                <div className="flex-1 flex items-center justify-center text-gray-500 p-4">
                                    <div className="text-center">
                                        <p className="mb-2">チャットを選択するか、新しいチャットを作成してください</p>
                                        <button
                                            onClick={() => createNewChat()}
                                            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                        >
                                            新しいチャットを作成
                                        </button>
                                    </div>
                                </div>
                            ) : null}
                        </div>

                        {/* Right Half - DuckDB and Table */}
                        <div className="w-1/2 h-full flex flex-col overflow-hidden">
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {dbContext && selectedTable && connection && (
                                    <>
                                        {/* Table Selector Header */}
                                        <div className="flex-shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-200">
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
                                            {activeTab === 'table' && (
                                                <div className="h-full overflow-hidden">
                                                    <TableView
                                                        key={`${selectedChatId}-${selectedTable}`}
                                                        connection={connection}
                                                        tableName={selectedTable}
                                                        dbContext={dbContext}
                                                    />
                                                </div>
                                            )}

                                            {/* Chart Tab */}
                                            {activeTab === 'chart' &&
                                                selectedTable &&
                                                (displayChartSpec && connection && selectedChatId ? (
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
                                                            if (getAllDashboards().length > 0) {
                                                                setExportType('chart');
                                                                setShowExportModal(true);
                                                            }
                                                        }}
                                                        isExportDisabled={getAllDashboards().length === 0}
                                                        exportTooltip={
                                                            getAllDashboards().length > 0
                                                                ? 'このグラフをダッシュボードにエクスポート'
                                                                : '⚠️ ダッシュボードがありません - グラフをエクスポートするには先にダッシュボードを作成してください'
                                                        }
                                                    />
                                                ) : (
                                                    <div className="h-full flex items-center justify-center bg-gray-50">
                                                        <ChartTypeSelector onSelectType={handleChartTypeSelect} />
                                                    </div>
                                                ))}

                                            {/* Map Tab */}
                                            {activeTab === 'map' &&
                                                connection &&
                                                selectedTable &&
                                                (selectedGeometryColumn ? (
                                                    <MapPanel
                                                        title={selectedTable}
                                                        tableName={selectedTable}
                                                        geometryColumn={selectedGeometryColumn}
                                                        dbContext={dbContext}
                                                        schema={schemaName || undefined}
                                                        mapSpec={{ tableStyles, style: mapStyle }}
                                                        showRemoveButton={false}
                                                        onExport={() => {
                                                            if (getAllDashboards().length > 0) {
                                                                setExportType('map');
                                                                setShowExportModal(true);
                                                            }
                                                        }}
                                                        showExportButton={true}
                                                        isExportDisabled={getAllDashboards().length === 0}
                                                        exportTooltip={
                                                            getAllDashboards().length > 0
                                                                ? 'この地図をダッシュボードにエクスポート'
                                                                : '⚠️ ダッシュボードがありません - 地図をエクスポートするには先にダッシュボードを作成してください'
                                                        }
                                                    />
                                                ) : (
                                                    <div className="h-full flex items-center justify-center bg-gray-50">
                                                        <div className="text-center text-gray-500 max-w-md">
                                                            <MapIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                                                            <p className="text-lg mb-4">
                                                                ジオメトリカラムが存在しません
                                                            </p>
                                                            <p className="text-sm mb-2">
                                                                地図を表示するには、ジオメトリ情報を持つテーブルが必要です。
                                                            </p>
                                                            <p className="text-sm mb-4">以下の方法をお試しください：</p>
                                                            <ul className="text-sm text-left mb-4 space-y-2">
                                                                <li>• ジオメトリ情報を含むデータを読み込む</li>
                                                                <li>
                                                                    •
                                                                    緯度経度カラムからジオメトリを生成するようAIに依頼する
                                                                </li>
                                                                <li>• ジオメトリ情報を持つ別のテーブルと結合する</li>
                                                            </ul>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    </>
                                )}
                                {dbContext && !selectedTable && (
                                    <div className="flex items-center justify-center h-full text-gray-500">
                                        テーブルを選択してください
                                    </div>
                                )}
                            </div>
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
                onExport={exportType === 'chart' ? handleExportChartToDashboard : handleExportMapToDashboard}
                title={exportType === 'chart' ? displayChartSpec?.title || 'Chart' : `${selectedTable} Map`}
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
