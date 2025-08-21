import React, { useState } from 'react';
import AIChat from '../../components/chat/AIChatModeling';
import { Table } from '../../components/table/TableList/Table';
import RemoteFileSimple from '../../components/remote-file/RemoteFileSimple';
import TableSQLDisplay from '../../components/table/TableSQLDisplay';
import TableSelector from '../../components/table/TableSelector';
import { ResizableDivider } from '../../components/common/ResizableDivider';
import { useDuckDB } from '../../lib/duckdb/useDuckDB';
import VegaLiteChart from '../../components/chart/VegaLiteChart';
import Map from '../../components/map';
import { chatIdToSchemaName } from './utils/schemaUtils';
import { ChatList } from '../../components/chat/ChatList';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import { useSyncBridge } from '../../hooks/useSyncBridge';
import {
    useApiKeyManagement,
    useResizableAreas,
    useChatManagement,
    useSchemaManagement,
    useTableSelection,
    useMapVisualization,
    useChartVisualization,
    useMessageHandling,
    useTableHistorySync
} from './hooks';

function ModelingPage() {
    const { dbContext } = useDuckDB();
    const [showSQL, setShowSQL] = useState(false);
    
    // Enable state synchronization
    const { syncImmediately } = useSyncBridge();
    
    // API key management
    const { apiKey, setApiKey, showApiKeyInput, isLoadingApiKey, saveApiKey } = useApiKeyManagement();
    
    // Resizable areas
    const { sqlAreaHeight, setSqlAreaHeight, tableAreaHeight, setTableAreaHeight } = useResizableAreas();
    
    // Chat management with Jotai (needs to be first for chats state)
    const {
        chats,
        selectedChatId,
        currentChat,
        createNewChat,
        deleteChat,
        selectChat,
        updateChatMessages,
        updateChatState,
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
        mapSelectedColumns,
        selectedGeometryColumn,
        tableStyles,
        extraMapStyle,
        updateTableStyle,
        updateExtraMapStyle,
        updateMapViewState,
        updateMapStyle,
    } = useMapVisualization(selectedTable, connection, schemaName, updateChatState);
    
    // Chart visualization
    const { chartSpec, showGraph, toggleGraphVisibility, updateChartFromAI } = useChartVisualization(selectedTable, dbContext, schemaName, connection);
    
    // Get chat type with fallback to 'graph'
    const chatType = currentChat?.type || 'graph';
    
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
                            getCurrentChatState={getCurrentChatState}
                            onConversationCompleted={syncImmediately}
                            remoteFileComponent={(onClose) => (
                                <RemoteFileSimple
                                    dbContext={dbContext}
                                    schema={schemaName}
                                    onTableCreated={(tableName) => {
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
                    {dbContext && selectedTable && connection && (
                        <>
                            {/* Table Selector Header - moved to top */}
                            <div className="flex-shrink-0 px-3 py-2 bg-gray-50 border-b border-gray-200">
                                <div className="flex items-center gap-2">
                                    <TableCellsIcon className="w-4 h-4 text-gray-600" />
                                    <div className="flex-1">
                                        <TableSelector
                                            dbContext={dbContext}
                                            selectedTable={selectedTable}
                                            onTableSelect={handleTableSelection}
                                            schema={schemaName}
                                            showSQL={showSQL}
                                            onToggleSQL={() => setShowSQL(!showSQL)}
                                            showGraph={showGraph}
                                            onToggleGraph={toggleGraphVisibility}
                                            chatType={chatType}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* SQL Section */}
                            {showSQL && (
                                <>
                                    <div
                                        className="flex-shrink-0 bg-white border-b border-gray-200 overflow-hidden"
                                        style={{ height: `${sqlAreaHeight}px` }}
                                    >
                                        <div className="h-full p-2.5 overflow-auto">
                                            <TableSQLDisplay
                                                tableName={selectedTable}
                                                dbContext={dbContext}
                                            />
                                        </div>
                                    </div>
                                    <ResizableDivider
                                        onResize={setSqlAreaHeight}
                                        minHeight={100}
                                        maxHeight={500}
                                        direction="top"
                                    />
                                </>
                            )}
                            <div className="flex-1 overflow-hidden flex flex-col">
                                {/* Table Section */}
                                <div
                                    className="flex-shrink-0 overflow-hidden border-b border-gray-200"
                                    style={{ height: `${tableAreaHeight}px` }}
                                >
                                    <Table
                                        key={`${selectedChatId}-${selectedTable}`}
                                        connection={connection}
                                        tableName={selectedTable}
                                        dbContext={dbContext}
                                    />
                                </div>

                                {/* Resizable divider between table and graph/map */}
                                {((chatType === 'graph' && showGraph) || chatType === 'map') && (
                                    <ResizableDivider
                                        onResize={setTableAreaHeight}
                                        minHeight={100}
                                        maxHeight={600}
                                        direction="top"
                                    />
                                )}

                                {/* Graph Section (for graph chats) */}
                                {chatType === 'graph' && showGraph && chartSpec && connection && selectedChatId && (
                                    <div className="flex-1 overflow-auto p-4">
                                        <VegaLiteChart
                                            key={`${schemaName}-${chartSpec.id}`}
                                            spec={chartSpec.spec}
                                            dbContext={dbContext}
                                            schema={schemaName}
                                        />
                                    </div>
                                )}

                                {/* Map Section (for map chats) */}
                                {chatType === 'map' && connection && (
                                    <div className="flex-1 overflow-hidden">
                                        <Map
                                            dbContext={dbContext}
                                            schema={schemaName}
                                            selectedTable={selectedTable}
                                            selectedColumns={mapSelectedColumns}
                                            geometryColumnName={selectedGeometryColumn}
                                            tableStyles={currentChat?.tableStyles || tableStyles}
                                            extraStyle={currentChat?.extraMapStyle || extraMapStyle}
                                            onTableStyleChanged={updateTableStyle}
                                            onExtraStyleChange={updateExtraMapStyle}
                                            onViewStateChange={updateMapViewState}
                                            initialViewState={currentChat?.mapState}
                                            initialStyle={currentChat?.mapState?.style}
                                            onStyleUpdate={updateMapStyle}
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

export default ModelingPage;
