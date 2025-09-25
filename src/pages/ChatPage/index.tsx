import { useState } from 'react';
import AIChat from '../../components/chat';
import { TableView } from '../../components/table/TableView';
import RemoteFile from '../../components/remote-file';
import TableSQLDisplay from '../../components/query';
import TableSelector from '../../components/table/TableSelector';
import { useDuckDB } from '../../lib/duckdb/useDuckDB';
import VegaLiteChart from '../../components/chart/VegaLiteChart';
import { ChartConfigForm } from '../../components/chart';
import Map from '../../components/map';
import { ChatList } from '../../components/chat/ChatList';
import { Dashboard, ChartExportModal } from '../../components/dashboard';
import { TableCellsIcon, ArrowUpTrayIcon, CogIcon } from '@heroicons/react/24/outline';
import type { ChartSpec } from '../../types/chart';
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
    useDashboardManagement
} from './hooks';

function ChatPage() {
    const { dbContext } = useDuckDB();
    const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart' | 'map'>('table');
    const [showExportModal, setShowExportModal] = useState(false);
    const [exportType, setExportType] = useState<'chart' | 'map'>('chart');
    const [lastSelectedExportDashboard, setLastSelectedExportDashboard] = useState<string | null>(null);
    const [showChartConfig, setShowChartConfig] = useState(false);
    const [configuredChartSpec, setConfiguredChartSpec] = useState<ChartSpec | null>(null);

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
        selectChat,
        updateChatMessages,
        getCurrentChatState,
    } = useChatManagement(dbContext);

    // Convert chatId to schemaName at the top level
    const schemaName = chatIdToSchemaName(selectedChatId);

    // Schema management (uses chats state from above)
    const { connection } = useSchemaManagement(
        dbContext,
        schemaName,
        chats
    );

    // Table selection
    const {
        selectedTable,
        handleTableSelection,
    } = useTableSelection(dbContext, schemaName, connection);

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
    const { chartSpec, updateChartFromAI, deleteChartFromAI } = useChartVisualization(selectedTable, dbContext, schemaName, connection);

    // Message handling
    const {
        sendMessageRef,
        handleSendMessageReady,
        handleMessagesChange,
    } = useMessageHandling(selectedChatId, updateChatMessages);

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
        removeVisualizationFromDashboard,
        renameDashboard
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
            createdAt: new Date()
        };
        

        const newLayout = {
            i: newVisualization.id,
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            minW: 3,
            minH: 2
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
            layout: [...dashboard.layout, newLayout]
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
        // Update the AI state as well
        if (selectedTable && updateChartFromAI) {
            updateChartFromAI(selectedTable, newSpec.spec);
        }
    };

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
            geometryColumn: selectedGeometryColumn || 'geometry',
            sql: `SELECT * FROM ${selectedTable}`, // Base SQL for the table
            createdAt: new Date()
        };

        const newLayout = {
            i: newVisualization.id,
            x: 0,
            y: 0,
            w: 8,
            h: 6,
            minW: 4,
            minH: 3
        };

        const updatedDashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, newVisualization],
            layout: [...dashboard.layout, newLayout]
        };

        // Remember the selected dashboard for next time
        setLastSelectedExportDashboard(dashboardId);

        // Update the dashboard
        updateDashboard(updatedDashboard);

        // Automatically switch to the dashboard view to show the newly added map
        handleSelectDashboard(dashboardId);
    };

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
                                availableCharts={getCurrentChatState()?.chartSpecs || {}}
                                onLayoutChange={(layout) => updateDashboardLayout(selectedDashboardId, layout)}
                                onAddVisualization={() => {
                                    // This will be handled by the chart export functionality
                                }}
                                onRemoveVisualization={(vizId) => {
                                    if (!selectedDashboardId) {
                                        console.error('No dashboard selected for removal');
                                        return;
                                    }
                                    removeVisualizationFromDashboard(selectedDashboardId, vizId);
                                }}
                                onUpdateDashboard={updateDashboard}
                            />
                        );
                    })()}
                </div>
            ) : (
                /* Chat Mode - Split View */
                <>
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
                            Your API key is encrypted and stored locally in your browser and never sent to our servers.
                        </div>
                    </div>
                )}
                {isLoadingApiKey && (
                    <div className="p-5 text-center text-gray-600">
                        APIキーを読み込み中...
                    </div>
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
                            onMapStyleUpdate={async (tableName: string, style: import('../../components/map').TableStyle) => {
                                updateTableStyle(tableName, style);
                            }}
                            onMapStyleDelete={async (tableName: string) => {
                                deleteTableStyle(tableName);
                            }}
                            onConversationCompleted={syncImmediately}
                            remoteFileComponent={(onClose) => (
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
                                        グラフ
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('map')}
                                        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                                            activeTab === 'map'
                                                ? 'border-blue-500 text-blue-600'
                                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }`}
                                    >
                                        地図
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
                                {activeTab === 'chart' && (
                                    displayChartSpec && connection && selectedChatId ? (
                                        <div className="h-full overflow-hidden flex flex-col">
                                            {/* Chart Display Area */}
                                            <div className={`${showChartConfig ? 'flex-1' : 'flex-1'} flex flex-col overflow-hidden`}>
                                                {/* Chart Title Bar with Menu */}
                                                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                                                    <h4 className="text-sm font-medium text-gray-900 truncate">
                                                        {displayChartSpec.title || 'Chart'}
                                                    </h4>
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            onClick={() => setShowChartConfig(!showChartConfig)}
                                                            className="p-2 text-gray-400 hover:text-gray-600 transition-colors rounded-md hover:bg-gray-100"
                                                            title="Configure chart"
                                                        >
                                                            <CogIcon className="w-5 h-5" />
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (getAllDashboards().length > 0) {
                                                                    setExportType('chart');
                                                                    setShowExportModal(true);
                                                                }
                                                            }}
                                                            disabled={getAllDashboards().length === 0}
                                                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors ${
                                                                getAllDashboards().length > 0
                                                                    ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer shadow-sm'
                                                                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                            }`}
                                                            title={
                                                                getAllDashboards().length > 0
                                                                    ? "Export this chart to a dashboard"
                                                                    : "⚠️ No dashboards available - Create a dashboard first to export charts"
                                                            }
                                                        >
                                                            <ArrowUpTrayIcon className="w-3.5 h-3.5" />
                                                            <span>Export</span>
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Chart Content */}
                                                <div className="flex-1 overflow-auto p-4">
                                                    <VegaLiteChart
                                                        key={`${schemaName}-${displayChartSpec.id}`}
                                                        spec={displayChartSpec.spec}
                                                        dbContext={dbContext}
                                                        schema={schemaName}
                                                        showHeader={false}
                                                        enableActions={false}
                                                    />
                                                </div>
                                            </div>

                                            {/* Configuration Panel - Horizontal Split */}
                                            {showChartConfig && (
                                                <div className="border-t border-gray-200 bg-white" style={{ height: '300px' }}>
                                                    <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50">
                                                        <h4 className="text-sm font-medium text-gray-900">Chart Configuration</h4>
                                                        <button
                                                            onClick={() => setShowChartConfig(false)}
                                                            className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
                                                            title="Close configuration"
                                                        >
                                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                    <div className="overflow-auto p-4" style={{ height: 'calc(300px - 57px)' }}>
                                                        {chartSpec && (
                                                            <ChartConfigForm
                                                                chartSpec={chartSpec}
                                                                dbContext={dbContext}
                                                                schema={schemaName || 'main'}
                                                                onSpecChange={handleChartSpecChange}
                                                            />
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center">
                                            <div className="text-center">
                                                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                                <h3 className="text-lg font-medium text-gray-900 mb-2">グラフを生成中...</h3>
                                                <p className="text-sm text-gray-500">このテーブルのデータから自動的にグラフを作成しています</p>
                                            </div>
                                        </div>
                                    )
                                )}

                                {/* Map Tab */}
                                {activeTab === 'map' && connection && selectedTable && (
                                    <div className="h-full overflow-hidden flex flex-col">
                                        <div className="flex-1 overflow-hidden">
                                            <Map
                                                dbContext={dbContext}
                                                schema={schemaName}
                                                selectedTable={selectedTable}
                                                selectedColumns={undefined}
                                                geometryColumnName={selectedGeometryColumn}
                                                tableStyles={tableStyles}
                                                initialStyle={mapStyle}
                                                onTableStyleChanged={updateTableStyle}
                                            />
                                        </div>
                                        <div className="flex justify-end p-3 border-t border-gray-200 bg-white">
                                            <button
                                                onClick={() => {
                                                    if (getAllDashboards().length > 0) {
                                                        setExportType('map');
                                                        setShowExportModal(true);
                                                    }
                                                }}
                                                disabled={getAllDashboards().length === 0}
                                                className={`p-2 rounded-full transition-colors shadow-lg ${
                                                    getAllDashboards().length > 0
                                                        ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                                                        : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                                }`}
                                                title={
                                                    getAllDashboards().length > 0
                                                        ? "Export map visualization"
                                                        : "Create a dashboard first to export visualizations"
                                                }
                                            >
                                                <ArrowUpTrayIcon className="w-5 h-5" />
                                            </button>
                                        </div>
                                    </div>
                                )}
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
            title={exportType === 'chart' ? (displayChartSpec?.title || 'Chart') : `${selectedTable} Map`}
            type={exportType}
            lastSelectedDashboard={lastSelectedExportDashboard}
        />
        </>
    );
}

export default ChatPage;
