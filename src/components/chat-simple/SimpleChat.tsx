import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import SimpleMessageRenderer from './SimpleMessageRenderer';
import ChatInput from '../chat/ChatInput';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { StructuredMessage } from '../../types/message';
import type { ChatState } from '../../store/remoteAtoms';
import { isTableCreatedOnlyMessage } from '../chat/utils';
import { analyzeTableGeometry } from '../../lib/ai/tools/geometryDetector';
import { TableViewModal } from './TableViewModal';
import { ChartViewModal } from './ChartViewModal';
import { MapViewModal } from './MapViewModal';

interface SimpleChatProps {
    dbContext: DBContext | null;
    apiKey?: string;
    chatId?: string | null;
    messages: StructuredMessage[];
    isLoading: boolean;
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    handleStop: () => void;
    sendMessage: (message: string) => void;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    currentChatState?: ChatState | null;
    onLoadSample?: (url: string) => void | Promise<void>;
    renderMenu?: (
        onClose: () => void,
        onShowUrlGuide?: () => void,
        onLoadSample?: (url: string) => void
    ) => React.ReactNode;
    onExportTableToDashboard?: (tableName: string) => void;
    onExportChartToDashboard?: (tableName: string) => void;
    onExportMapToDashboard?: (tableName: string) => void;
}

export default function SimpleChat({
    dbContext,
    apiKey,
    chatId,
    messages,
    isLoading,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    handleStop,
    sendMessage,
    selectedTable,
    onTableSelect,
    currentChatState,
    onLoadSample,
    renderMenu,
    onExportTableToDashboard,
    onExportChartToDashboard,
    onExportMapToDashboard,
}: SimpleChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [tableGeometries, setTableGeometries] = useState<Record<string, boolean>>({});
    const [tableGeometryColumns, setTableGeometryColumns] = useState<Record<string, string>>({});
    const checkedTablesRef = useRef<Set<string>>(new Set());
    const [showUrlGuide, setShowUrlGuide] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showTableModal, setShowTableModal] = useState(false);
    const [modalTableName, setModalTableName] = useState<string | null>(null);
    const [showChartModal, setShowChartModal] = useState(false);
    const [chartModalTableName, setChartModalTableName] = useState<string | null>(null);
    const [showMapModal, setShowMapModal] = useState(false);
    const [mapModalTableName, setMapModalTableName] = useState<string | null>(null);
    const [currentConversationIndex, setCurrentConversationIndex] = useState(0);

    const handleShowUrlGuide = useCallback(() => {
        setShowUrlGuide(true);
        textareaRef.current?.focus();
        setTimeout(() => setShowUrlGuide(false), 5000);
    }, []);

    const handleLoadSample = useCallback(
        (url: string) => {
            if (onLoadSample) {
                onLoadSample(url);
            } else {
                sendMessage(url);
            }
        },
        [onLoadSample, sendMessage]
    );

    const handleInputChangeWithGuide = useCallback(
        (e: React.ChangeEvent<HTMLTextAreaElement>) => {
            handleInputChange(e);
            if (showUrlGuide) {
                setShowUrlGuide(false);
            }
        },
        [handleInputChange, showUrlGuide]
    );

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, []);

    const handleFormSubmit = useCallback(
        async (e: React.FormEvent) => {
            await originalHandleSubmit(e);
        },
        [originalHandleSubmit]
    );

    // Focus textarea on mount
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.focus();
        }
    }, []);

    // Collect all conversation groups (user message + following assistant messages)
    const conversationGroups = useMemo(() => {
        const groups: Array<{
            userMessage: StructuredMessage;
            assistantMessages: StructuredMessage[];
            startIndex: number;
        }> = [];

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message.role === 'user') {
                const group = {
                    userMessage: message,
                    assistantMessages: [] as StructuredMessage[],
                    startIndex: i,
                };
                // Collect all assistant messages that follow this user message
                for (let j = i + 1; j < messages.length && messages[j].role === 'assistant'; j++) {
                    group.assistantMessages.push(messages[j]);
                }
                groups.push(group);
            }
        }

        return groups;
    }, [messages]);

    // Reset conversation index to latest when messages change
    useEffect(() => {
        if (conversationGroups.length > 0) {
            setCurrentConversationIndex(conversationGroups.length - 1);
        }
    }, [conversationGroups.length]);

    // Get current conversation group
    const latestMessageGroup = useMemo(() => {
        if (conversationGroups.length === 0) return null;
        const index = Math.min(currentConversationIndex, conversationGroups.length - 1);
        return conversationGroups[index];
    }, [conversationGroups, currentConversationIndex]);

    const chartSpecs = useMemo(() => {
        return currentChatState?.chartSpecs || {};
    }, [currentChatState]);

    // Analyze geometry columns for all tables
    useEffect(() => {
        const checkTableGeometry = async () => {
            if (!currentChatState?.tables || !dbContext) {
                return;
            }

            const tables = Object.values(currentChatState.tables);

            for (const table of tables) {
                if (checkedTablesRef.current.has(table.tableName)) {
                    continue;
                }

                checkedTablesRef.current.add(table.tableName);

                try {
                    const result = await analyzeTableGeometry(dbContext, table.tableName, table.schema || null);
                    setTableGeometries(prev => ({
                        ...prev,
                        [table.tableName]: result.hasGeometry,
                    }));
                    if (result.hasGeometry && result.geometryInfo && result.geometryInfo.length > 0) {
                        setTableGeometryColumns(prev => ({
                            ...prev,
                            [table.tableName]: result.geometryInfo![0].columnName,
                        }));
                    }
                } catch (error) {
                    console.error(`Failed to analyze geometry for table ${table.tableName}:`, error);
                    setTableGeometries(prev => ({
                        ...prev,
                        [table.tableName]: false,
                    }));
                }
            }
        };

        checkTableGeometry();
    }, [currentChatState, dbContext]);

    useEffect(() => {
        if (messages.length <= 2 || isLoading) {
            setTimeout(() => {
                scrollToBottom();
            }, 100);
        }
    }, [messages, isLoading, scrollToBottom]);

    const handlePromptSelection = (promptText: string) => {
        if (input === promptText) {
            const changeEvent = {
                target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
            sendMessage(promptText);
            setTimeout(() => {
                scrollToBottom();
            }, 300);
        } else {
            const changeEvent = {
                target: { value: promptText },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 0);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing && !isLoading) {
            e.preventDefault();
            setIsSubmitting(true);
            const submitEvent = { preventDefault: () => {} } as React.FormEvent;
            handleFormSubmit(submitEvent).finally(() => {
                setIsSubmitting(false);
            });
        }
    };

    // Custom table select handler that opens modal
    const handleTableSelectWithModal = useCallback(
        (tableName: string) => {
            setModalTableName(tableName);
            setShowTableModal(true);
            onTableSelect?.(tableName);
        },
        [onTableSelect]
    );

    // Chart icon click handler
    const handleChartIconClick = useCallback((tableName: string) => {
        setChartModalTableName(tableName);
        setShowChartModal(true);
    }, []);

    // Map icon click handler
    const handleMapIconClick = useCallback((tableName: string) => {
        setMapModalTableName(tableName);
        setShowMapModal(true);
    }, []);

    // Navigation handlers
    const handlePreviousConversation = useCallback(() => {
        setCurrentConversationIndex(prev => Math.max(0, prev - 1));
    }, []);

    const handleNextConversation = useCallback(() => {
        setCurrentConversationIndex(prev => Math.min(conversationGroups.length - 1, prev + 1));
    }, [conversationGroups.length]);

    const canGoPrevious = currentConversationIndex > 0;
    const canGoNext = currentConversationIndex < conversationGroups.length - 1;

    return (
        <>
            {/* Navigation buttons - Always visible at top */}
            {conversationGroups.length > 0 && (
                <div className="flex items-center justify-between mb-2">
                    <button
                        onClick={handlePreviousConversation}
                        disabled={!canGoPrevious}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            canGoPrevious
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                        title="前の会話"
                    >
                        ← 前へ
                    </button>
                    <div className="text-base font-semibold text-gray-700">
                        {currentConversationIndex + 1} / {conversationGroups.length}
                    </div>
                    <button
                        onClick={handleNextConversation}
                        disabled={!canGoNext}
                        className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                            canGoNext
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                        }`}
                        title="次の会話"
                    >
                        次へ →
                    </button>
                </div>
            )}

            <div className="flex-1 overflow-y-auto bg-white border border-gray-300 rounded-md p-2.5 mb-2.5">
                {latestMessageGroup ? (
                    <div className="mb-4">
                        {(() => {
                            const userContent =
                                typeof latestMessageGroup.userMessage.content === 'string'
                                    ? latestMessageGroup.userMessage.content
                                    : '';
                            const isTableOnly = isTableCreatedOnlyMessage(userContent);

                            return (
                                <>
                                    {isTableOnly ? (
                                        <div className="mb-2 w-full">
                                            <SimpleMessageRenderer
                                                message={latestMessageGroup.userMessage}
                                                className="prose prose-xs max-w-none"
                                                dbContext={dbContext || undefined}
                                                selectedTable={selectedTable}
                                                onTableSelect={handleTableSelectWithModal}
                                                onPromptClick={handlePromptSelection}
                                                chartSpecs={chartSpecs}
                                                tableGeometries={tableGeometries}
                                                onChartIconClick={handleChartIconClick}
                                                onMapIconClick={handleMapIconClick}
                                            />
                                        </div>
                                    ) : (
                                        <div className="flex justify-start mb-2">
                                            <div className="w-full">
                                                <div className="break-words text-gray-800 text-2xl font-semibold">
                                                    <SimpleMessageRenderer
                                                        message={latestMessageGroup.userMessage}
                                                        className="prose prose-xl max-w-none"
                                                        dbContext={dbContext || undefined}
                                                        selectedTable={selectedTable}
                                                        onTableSelect={handleTableSelectWithModal}
                                                        onPromptClick={handlePromptSelection}
                                                        chartSpecs={chartSpecs}
                                                        tableGeometries={tableGeometries}
                                                        onChartIconClick={handleChartIconClick}
                                                        onMapIconClick={handleMapIconClick}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {(() => {
                                        // Show loading message if isLoading and first assistant message is empty/minimal
                                        if (isLoading && latestMessageGroup.assistantMessages.length > 0) {
                                            const firstMessage = latestMessageGroup.assistantMessages[0];
                                            const content =
                                                typeof firstMessage.content === 'string'
                                                    ? firstMessage.content
                                                    : Array.isArray(firstMessage.content)
                                                      ? firstMessage.content
                                                            .map(c => (c.type === 'text' ? c.text : ''))
                                                            .join('')
                                                            .trim()
                                                      : '';

                                            if (content.length < 10) {
                                                return (
                                                    <div className="flex justify-start mt-6 mb-6">
                                                        <div className="w-full">
                                                            <div className="flex items-center gap-3">
                                                                <svg
                                                                    className="w-8 h-8 animate-spin text-blue-600"
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                >
                                                                    <circle
                                                                        className="opacity-25"
                                                                        cx="12"
                                                                        cy="12"
                                                                        r="10"
                                                                        stroke="currentColor"
                                                                        strokeWidth="3"
                                                                    />
                                                                    <path
                                                                        className="opacity-75"
                                                                        fill="currentColor"
                                                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                                                    />
                                                                </svg>
                                                                <div className="text-lg font-medium text-gray-700 relative overflow-hidden">
                                                                    <span className="relative">
                                                                        AIが考えています...お待ち下さい...
                                                                    </span>
                                                                    <span
                                                                        className="absolute inset-0 animate-shimmer pointer-events-none"
                                                                        style={{
                                                                            backgroundImage:
                                                                                'linear-gradient(90deg, transparent 0%, rgba(255, 255, 255, 0.6) 50%, transparent 100%)',
                                                                            backgroundSize: '200% 100%',
                                                                        }}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            }
                                        }
                                        return null;
                                    })()}

                                    {latestMessageGroup.assistantMessages.map((assistantMessage, idx) => (
                                        <div key={idx} className="flex justify-start">
                                            <div className="w-full">
                                                <div className="break-words">
                                                    <SimpleMessageRenderer
                                                        message={assistantMessage}
                                                        className="prose max-w-none"
                                                        dbContext={dbContext || undefined}
                                                        selectedTable={selectedTable}
                                                        onTableSelect={handleTableSelectWithModal}
                                                        isStreaming={
                                                            isLoading &&
                                                            idx === latestMessageGroup.assistantMessages.length - 1
                                                        }
                                                        onPromptClick={handlePromptSelection}
                                                        chartSpecs={chartSpecs}
                                                        tableGeometries={tableGeometries}
                                                        onChartIconClick={handleChartIconClick}
                                                        onMapIconClick={handleMapIconClick}
                                                    />
                                                    {isLoading &&
                                                        idx === latestMessageGroup.assistantMessages.length - 1 &&
                                                        assistantMessage.streaming !== undefined && (
                                                            <span className="inline-block animate-pulse ml-0.5">▊</span>
                                                        )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </>
                            );
                        })()}
                    </div>
                ) : (
                    isLoading &&
                    messages.length === 0 && (
                        <div className="flex justify-start mb-4">
                            <div className="italic text-gray-600 w-full">考えています...</div>
                        </div>
                    )
                )}
                <div ref={messagesEndRef} />
            </div>

            <div className="flex-shrink-0">
                <div className="bg-white border border-gray-300 rounded-md p-2">
                    <ChatInput
                        value={input}
                        onChange={handleInputChangeWithGuide}
                        onKeyDown={handleKeyPress}
                        onSubmit={async e => {
                            e.preventDefault();
                            await handleFormSubmit(e);
                        }}
                        onStop={handleStop}
                        dbContext={dbContext}
                        textareaRef={textareaRef}
                        placeholder="質問してみましょう"
                        className="w-full h-full p-2.5 resize-none text-gray-800 focus:outline-none overflow-y-auto"
                        chatId={chatId}
                        selectedTable={selectedTable}
                        isLoading={isLoading}
                        isSubmitting={isSubmitting}
                        renderMenu={
                            renderMenu
                                ? (onClose, onShowUrlGuide) => renderMenu(onClose, onShowUrlGuide, handleLoadSample)
                                : undefined
                        }
                        disabled={!apiKey}
                        showUrlGuide={showUrlGuide}
                        onShowUrlGuide={handleShowUrlGuide}
                    />
                </div>
                <div className="flex justify-end mt-1 text-xs text-gray-500 leading-tight">
                    @でテーブル名、#で列名、Enterで改行、Shift+Enterで送信
                </div>
            </div>

            {/* Table View Modal */}
            {modalTableName && (
                <TableViewModal
                    isOpen={showTableModal}
                    onClose={() => {
                        setShowTableModal(false);
                        setModalTableName(null);
                    }}
                    tableName={modalTableName}
                    dbContext={dbContext}
                    schema={chatId}
                    onExportToDashboard={
                        onExportTableToDashboard ? () => onExportTableToDashboard(modalTableName) : undefined
                    }
                />
            )}

            {/* Chart View Modal */}
            {chartModalTableName && (
                <ChartViewModal
                    isOpen={showChartModal}
                    onClose={() => {
                        setShowChartModal(false);
                        setChartModalTableName(null);
                    }}
                    tableName={chartModalTableName}
                    chartSpec={chartSpecs[chartModalTableName]?.spec}
                    dbContext={dbContext}
                    onExportToDashboard={
                        onExportChartToDashboard ? () => onExportChartToDashboard(chartModalTableName) : undefined
                    }
                />
            )}

            {/* Map View Modal */}
            {mapModalTableName && (
                <MapViewModal
                    isOpen={showMapModal}
                    onClose={() => {
                        setShowMapModal(false);
                        setMapModalTableName(null);
                    }}
                    tableName={mapModalTableName}
                    geometryColumn={tableGeometryColumns[mapModalTableName]}
                    dbContext={dbContext}
                    schema={chatId}
                    onExportToDashboard={
                        onExportMapToDashboard ? () => onExportMapToDashboard(mapModalTableName) : undefined
                    }
                />
            )}
        </>
    );
}
