import React, { useState } from 'react';
import AIChat from '../../components/chat';
import { TableView } from '../../components/table/TableView';
import RemoteFile from '../../components/remote-file';
import TableSQLDisplay from '../../components/query';
import TableSelector from '../../components/table/TableSelector';
import { useDuckDB } from '../../lib/duckdb/useDuckDB';
import VegaLiteChart from '../../components/chart/VegaLiteChart';
import Map from '../../components/map';
import { ChatList } from '../../components/chat/ChatList';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import { useStoreSync } from '../../store/sync';
import {
    chatIdToSchemaName,
    useApiKeyManagement,
    useChatManagement,
    useSchemaManagement,
    useTableSelection,
    useMapVisualization,
    useChartVisualization,
    useMessageHandling,
    useTableHistorySync
} from './hooks';

function ChatPage() {
    const { dbContext } = useDuckDB();
    const [activeTab, setActiveTab] = useState<'sql' | 'table' | 'chart' | 'map'>('table');

    // Enable state synchronization
    const { syncImmediately } = useStoreSync();


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

    return (
        <>
            <div className="flex h-full w-full overflow-hidden">
            {/* Sidebar with Chat List */}
            <div className="w-64 h-full border-r border-gray-300 bg-gray-50 flex-shrink-0">
                <ChatList
                    chats={chats}
                    selectedChatId={selectedChatId}
                    onSelectChat={selectChat}
                    onCreateChat={createNewChat}
                    onDeleteChat={deleteChat}
                    isInitialized={!!dbContext}
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
                                    chartSpec && connection && selectedChatId ? (
                                        <div className="h-full overflow-auto p-4">
                                            <VegaLiteChart
                                                key={`${schemaName}-${chartSpec.id}`}
                                                spec={chartSpec.spec}
                                                dbContext={dbContext}
                                                schema={schemaName}
                                            />
                                        </div>
                                    ) : (
                                        <div className="h-full flex items-center justify-center">
                                            <div className="text-center">
                                                <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                                </svg>
                                                <h3 className="text-lg font-medium text-gray-900 mb-2">グラフがまだありません</h3>
                                                <p className="text-sm text-gray-500 mb-4">このテーブルのデータを可視化するグラフを作成しましょう</p>
                                                <button
                                                    onClick={() => {
                                                        if (sendMessageRef.current) {
                                                            sendMessageRef.current(`${selectedTable}テーブルのデータを分析して、適切なグラフを作成してください`);
                                                        }
                                                    }}
                                                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                                                >
                                                    グラフを作成
                                                </button>
                                            </div>
                                        </div>
                                    )
                                )}

                                {/* Map Tab */}
                                {activeTab === 'map' && connection && selectedTable && (
                                    <div className="h-full overflow-hidden">
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
        </div>
        </>
    );
}

export default ChatPage;
