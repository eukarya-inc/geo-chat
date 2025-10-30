import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import StructuredMessageRenderer from './StructuredMessageRenderer';
import ChatInput from './ChatInput';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { StructuredMessage } from '../../types/message';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import type { ChatState } from '../../store/remoteAtoms';
import { isTableCreatedOnlyMessage } from './utils';
import { analyzeTableGeometry } from '../../lib/ai/tools/geometryDetector';

interface ChatProps {
    dbContext: DBContext | null;
    apiKey?: string;
    schemaName?: string | null;
    messages: StructuredMessage[];
    isLoading: boolean;
    input: string;
    handleInputChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
    handleSubmit: (e: React.FormEvent) => Promise<void>;
    handleStop: () => void;
    sendMessage: (message: string) => void;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    getCurrentChatState?: () => ChatState | null;
    onLoadSample?: (url: string) => void | Promise<void>;
    renderMenu?: (
        onClose: () => void,
        onShowUrlGuide?: () => void,
        onLoadSample?: (url: string) => void
    ) => React.ReactNode;
}

export default function Chat({
    dbContext,
    apiKey,
    schemaName,
    messages,
    isLoading,
    input,
    handleInputChange,
    handleSubmit: originalHandleSubmit,
    handleStop,
    sendMessage,
    selectedTable,
    onTableSelect,
    getCurrentChatState,
    onLoadSample,
    renderMenu,
}: ChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastScrollTimeRef = useRef<number>(0);
    const userHasScrolledRef = useRef<boolean>(false);
    const isProgrammaticScrollRef = useRef<boolean>(false);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
    const [manuallyToggledGroups, setManuallyToggledGroups] = useState<Set<number>>(new Set());
    const promptSuggestionAbortRef = useRef<AbortController | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [tableGeometries, setTableGeometries] = useState<Record<string, boolean>>({});
    const checkedTablesRef = useRef<Set<string>>(new Set());
    const [showUrlGuide, setShowUrlGuide] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleShowUrlGuide = useCallback(() => {
        setShowUrlGuide(true);
        textareaRef.current?.focus();
        setTimeout(() => setShowUrlGuide(false), 5000);
    }, []);

    const handleLoadSample = useCallback(
        (url: string) => {
            console.log('Chat handleLoadSample called with url:', url, 'onLoadSample:', onLoadSample);
            if (onLoadSample) {
                onLoadSample(url);
            } else {
                console.log('Chat handleLoadSample: calling sendMessage with url:', url);
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
        isProgrammaticScrollRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        // Reset the flag after scrolling
        setTimeout(() => {
            isProgrammaticScrollRef.current = false;
        }, 500);
    }, []);

    // Handle form submission
    const handleFormSubmit = useCallback(
        async (e: React.FormEvent) => {
            // Abort any ongoing prompt suggestion loading when user submits a new message
            if (promptSuggestionAbortRef.current) {
                promptSuggestionAbortRef.current.abort();
                promptSuggestionAbortRef.current = null;
            }

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

    const messageGroups = useMemo(() => {
        const groups: { userMessage: StructuredMessage; assistantMessage?: StructuredMessage; startIndex: number }[] =
            [];

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message.role === 'user') {
                const group: {
                    userMessage: StructuredMessage;
                    assistantMessage?: StructuredMessage;
                    startIndex: number;
                } = {
                    userMessage: message,
                    startIndex: i,
                };
                if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                    group.assistantMessage = messages[i + 1];
                }
                groups.push(group);
                if (group.assistantMessage) {
                    i++;
                }
            }
        }

        return groups;
    }, [messages]);

    const chartSpecs = useMemo(() => {
        return getCurrentChatState?.()?.chartSpecs || {};
    }, [getCurrentChatState]);

    // Analyze geometry columns for all tables
    useEffect(() => {
        const checkTableGeometry = async () => {
            const chatState = getCurrentChatState?.();
            if (!chatState?.tables || !dbContext) return;

            const tables = Object.values(chatState.tables);
            for (const table of tables) {
                // Skip if we already checked this table
                if (checkedTablesRef.current.has(table.tableName)) continue;

                // Mark as checked to prevent duplicate checks
                checkedTablesRef.current.add(table.tableName);

                try {
                    const result = await analyzeTableGeometry(dbContext, table.tableName, table.schema || null);
                    setTableGeometries(prev => ({
                        ...prev,
                        [table.tableName]: result.hasGeometry,
                    }));
                } catch (error) {
                    console.error(`Failed to analyze geometry for table ${table.tableName}:`, error);
                    // Set to false on error
                    setTableGeometries(prev => ({
                        ...prev,
                        [table.tableName]: false,
                    }));
                }
            }
        };

        checkTableGeometry();
    }, [getCurrentChatState, dbContext]);

    const toggleGroupCollapse = (groupIndex: number) => {
        setManuallyToggledGroups(prev => {
            const newSet = new Set(prev);
            newSet.add(groupIndex);
            return newSet;
        });

        setCollapsedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupIndex)) {
                newSet.delete(groupIndex);
            } else {
                newSet.add(groupIndex);
            }
            return newSet;
        });
    };

    useEffect(() => {
        if (messageGroups.length > 0) {
            const lastGroup = messageGroups[messageGroups.length - 1];
            const lastIndex = messageGroups.length - 1;

            if (
                lastGroup.assistantMessage &&
                !collapsedGroups.has(lastIndex) &&
                !manuallyToggledGroups.has(lastIndex)
            ) {
                setCollapsedGroups(prev => {
                    const newSet = new Set(prev);
                    newSet.add(lastIndex);
                    return newSet;
                });
            }
        }
    }, [messageGroups, collapsedGroups, manuallyToggledGroups]);

    const isNearBottom = () => {
        const container = scrollContainerRef.current;
        if (!container) return true;

        const threshold = 100;
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return scrollBottom <= threshold;
    };

    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // Ignore programmatic scrolls
        if (isProgrammaticScrollRef.current) {
            return;
        }

        const threshold = 100;
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;

        // Mark as user-scrolled if they're away from bottom
        if (scrollBottom > threshold) {
            userHasScrolledRef.current = true;
        } else {
            // Reset if they scroll back to bottom
            userHasScrolledRef.current = false;
        }
    };

    useEffect(() => {
        // Don't auto-scroll if user has manually scrolled
        if (userHasScrolledRef.current) {
            return;
        }

        if (messages.length <= 2 || isNearBottom() || isLoading) {
            const now = Date.now();
            const timeSinceLastScroll = now - lastScrollTimeRef.current;

            // More frequent scrolling during streaming
            const scrollInterval = isLoading ? 500 : 1000;

            if (timeSinceLastScroll >= scrollInterval || messages.length <= 2) {
                lastScrollTimeRef.current = now;
                setTimeout(() => {
                    scrollToBottom();
                }, 100);
            }
        }
    }, [messages, isLoading, scrollToBottom]);

    useEffect(() => {
        if (!isLoading && isNearBottom()) {
            userHasScrolledRef.current = false;
        }
    }, [isLoading]);

    const handlePromptSelection = (promptText: string) => {
        if (input === promptText) {
            const changeEvent = {
                target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
            // Reset scroll tracking when sending a new message
            userHasScrolledRef.current = false;
            console.log('Chat handlePromptSelection: calling sendMessage with promptText:', promptText);
            sendMessage(promptText);
            // Scroll to bottom with delay when sending message from prompt
            setTimeout(() => {
                scrollToBottom();
            }, 300);
        } else {
            const changeEvent = {
                target: { value: promptText },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
            // Focus on textarea after setting the prompt
            setTimeout(() => {
                textareaRef.current?.focus();
            }, 0);
        }
    };

    /* Removed: Prompt suggestion logic moved to AIStore.addPromptSuggestions()
    useEffect(() => {
        const loadPromptSuggestions = async (abortSignal: AbortSignal) => {
            // Find the last user message with TABLE_CREATED
            let tableCreatedMessage = null;
            for (let i = messages.length - 1; i >= 0; i--) {
                const msg = messages[i];
                if (
                    msg.role === 'user' &&
                    typeof msg.content === 'string' &&
                    msg.content.includes('<!--TABLE_CREATED:')
                ) {
                    tableCreatedMessage = msg;
                    break;
                }
            }

            if (!tableCreatedMessage) return;

            const content = tableCreatedMessage.content as string;

            // Extract table name from the marker
            const match = content.match(/<!--TABLE_CREATED:(.+?)-->/);
            const tableName = match?.[1] || selectedTable || null;

            if (!tableName || !dbContext || !apiKey) return;

            // Find the index of this TABLE_CREATED message
            const tableCreatedIndex = messages.indexOf(tableCreatedMessage);

            // Check if we already have prompt suggestions AFTER this specific TABLE_CREATED message
            // Only check messages that come after the table creation message
            const hasPromptSuggestionsAfterTable = messages.slice(tableCreatedIndex + 1).some(
                msg =>
                    msg.role === 'assistant' &&
                    Array.isArray(msg.content) &&
                    msg.content.some(
                        block =>
                            // Check for table creation suggestions (tool_result)
                            (block.type === 'tool_result' &&
                                block.name === 'completion' &&
                                block.result &&
                                typeof block.result === 'object' &&
                                'suggestedPrompts' in block.result &&
                                'completionMessage' in block.result &&
                                typeof block.result.completionMessage === 'string' &&
                                block.result.completionMessage.includes(tableName)) ||
                            // Check for completion suggestions (tool_use)
                            (block.type === 'tool_use' &&
                                block.name === 'completion' &&
                                block.input &&
                                typeof block.input === 'object' &&
                                'suggestedPrompts' in block.input)
                    )
            );

            if (hasPromptSuggestionsAfterTable) {
                return;
            }

            // Check if aborted before adding loading message
            if (abortSignal.aborted) {
                return;
            }

            // Check if we already have the loading message
            const hasLoadingMessage = messages.some(
                msg =>
                    msg.role === 'assistant' &&
                    Array.isArray(msg.content) &&
                    msg.content.some(
                        block =>
                            block.type === 'text' &&
                            block.text.includes('を分析中... おすすめの分析を生成しています...')
                    )
            );

            if (!hasLoadingMessage) {
                const loadingMessage: StructuredMessage = {
                    role: 'assistant',
                    content: [
                        {
                            type: 'text',
                            text: `テーブル「${tableName}」を分析中... おすすめの分析を生成しています...`,
                        },
                    ],
                };

                const messagesWithLoading = [...messages, loadingMessage];
                handleMessagesChange(messagesWithLoading);
            }

            try {
                if (abortSignal.aborted) {
                    // Remove loading message if aborted
                    const cleanMessages = messages.filter(msg => {
                        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                            return !msg.content.some(
                                block =>
                                    block.type === 'text' &&
                                    block.text.includes('を分析中... おすすめの分析を生成しています...')
                            );
                        }
                        return true;
                    });
                    handleMessagesChange(cleanMessages);
                    return;
                }

                const prompts = await generatePromptSuggestions(tableName, dbContext, schemaName || null, apiKey || '');

                if (abortSignal.aborted) {
                    return;
                }

                if (prompts.length > 0) {
                    const promptMessage: StructuredMessage = {
                        role: 'assistant',
                        content: [
                            {
                                type: 'tool_result',
                                id: `synthetic-${Date.now()}`,
                                name: 'completion',
                                result: {
                                    success: true,
                                    suggestedPrompts: prompts.map((p, i) => ({
                                        id: `prompt-${i}`,
                                        text: p.text,
                                        description: p.category,
                                    })),
                                    completionMessage: `テーブル「${tableName}」が作成されました。以下の分析をお試しください:`,
                                    timestamp: new Date().toISOString(),
                                },
                            },
                        ],
                    };

                    // Remove loading message and add prompt message
                    const updatedMessages = messages.filter(msg => {
                        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                            return !msg.content.some(
                                block =>
                                    block.type === 'text' &&
                                    block.text.includes('を分析中... おすすめの分析を生成しています...')
                            );
                        }
                        return true;
                    });

                    updatedMessages.push(promptMessage);
                    handleMessagesChange(updatedMessages);
                } else {
                    // Remove loading message
                    const updatedMessages = messages.filter(msg => {
                        if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                            return !msg.content.some(
                                block =>
                                    block.type === 'text' &&
                                    block.text.includes('を分析中... おすすめの分析を生成しています...')
                            );
                        }
                        return true;
                    });
                    handleMessagesChange(updatedMessages);
                }
            } catch (error) {
                if (abortSignal.aborted) {
                    return;
                }
                console.error('Failed to load prompt suggestions:', error);
                // Remove loading message on error
                const updatedMessages = messages.filter(msg => {
                    if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                        return !msg.content.some(
                            block =>
                                block.type === 'text' &&
                                block.text.includes('を分析中... おすすめの分析を生成しています...')
                        );
                    }
                    return true;
                });
                handleMessagesChange(updatedMessages);
            }
        };

        if (promptSuggestionAbortRef.current) {
            promptSuggestionAbortRef.current.abort();
        }

        const abortController = new AbortController();
        promptSuggestionAbortRef.current = abortController;

        loadPromptSuggestions(abortController.signal);

        return () => {
            if (promptSuggestionAbortRef.current) {
                promptSuggestionAbortRef.current.abort();
                promptSuggestionAbortRef.current = null;
            }
        };
    }, [messages, selectedTable, dbContext, schemaName, chatId, apiKey, handleMessagesChange]);
    */

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && e.shiftKey && !e.nativeEvent.isComposing && !isLoading) {
            e.preventDefault();
            // Set isSubmitting state and call submit handler
            setIsSubmitting(true);
            const submitEvent = { preventDefault: () => {} } as React.FormEvent;
            userHasScrolledRef.current = false;
            handleFormSubmit(submitEvent).finally(() => {
                setIsSubmitting(false);
            });
        }
    };

    return (
        <>
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto bg-white border border-gray-300 rounded-md p-2.5 mb-2.5"
            >
                {messageGroups.map((group, groupIndex) => {
                    const isLastGroup = groupIndex === messageGroups.length - 1;
                    const isCollapsed = collapsedGroups.has(groupIndex);
                    const isCurrentlyLoading = isLastGroup && isLoading && group.assistantMessage;

                    const userContent = typeof group.userMessage.content === 'string' ? group.userMessage.content : '';
                    // Check if this is only a TABLE_CREATED message using shared utility
                    const isTableOnly = isTableCreatedOnlyMessage(userContent);

                    return (
                        <div key={groupIndex} className="mb-4">
                            {isTableOnly ? (
                                <div className="mb-2 w-full">
                                    <StructuredMessageRenderer
                                        message={group.userMessage}
                                        className="prose prose-xs max-w-none"
                                        dbContext={dbContext || undefined}
                                        selectedTable={selectedTable}
                                        onTableSelect={onTableSelect}
                                        onPromptClick={handlePromptSelection}
                                        chartSpecs={chartSpecs}
                                        tableGeometries={tableGeometries}
                                    />
                                </div>
                            ) : (
                                <div className="flex justify-end mb-2">
                                    <div
                                        className="p-2.5 rounded-lg bg-gray-100 text-gray-800 overflow-hidden"
                                        style={{
                                            maxWidth: '60%',
                                            minWidth: '150px',
                                        }}
                                    >
                                        <div className="break-words text-gray-800">
                                            <StructuredMessageRenderer
                                                message={group.userMessage}
                                                className="prose max-w-none"
                                                dbContext={dbContext || undefined}
                                                selectedTable={selectedTable}
                                                onTableSelect={onTableSelect}
                                                onPromptClick={handlePromptSelection}
                                                chartSpecs={chartSpecs}
                                                tableGeometries={tableGeometries}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {group.assistantMessage && (
                                <div className="flex justify-start">
                                    <div className="w-full">
                                        {(() => {
                                            const isPromptOnlyMessage =
                                                Array.isArray(group.assistantMessage.content) &&
                                                group.assistantMessage.content.length === 1 &&
                                                group.assistantMessage.content[0].type === 'tool_result' &&
                                                group.assistantMessage.content[0].name === 'completion';

                                            const isLoadingMessage =
                                                Array.isArray(group.assistantMessage.content) &&
                                                group.assistantMessage.content.length === 1 &&
                                                group.assistantMessage.content[0].type === 'text' &&
                                                group.assistantMessage.content[0].text.includes(
                                                    'を分析中... おすすめの分析を生成しています...'
                                                );

                                            if (isPromptOnlyMessage || isLoadingMessage) {
                                                return null;
                                            }

                                            return (
                                                <button
                                                    onClick={() => toggleGroupCollapse(groupIndex)}
                                                    className="flex items-center gap-1 px-2 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded-md transition-colors mb-1 relative overflow-hidden"
                                                >
                                                    {isCollapsed ? (
                                                        <ChevronRightIcon className="w-4 h-4" />
                                                    ) : (
                                                        <ChevronDownIcon className="w-4 h-4" />
                                                    )}
                                                    <span className="relative">
                                                        {isCurrentlyLoading
                                                            ? '思考中...'
                                                            : isCollapsed
                                                              ? '思考過程を表示'
                                                              : '思考過程を隠す'}
                                                        {isCurrentlyLoading && isCollapsed && (
                                                            <span
                                                                className="absolute inset-0 animate-shimmer"
                                                                style={{
                                                                    backgroundImage:
                                                                        'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                                                                    backgroundSize: '200% 100%',
                                                                }}
                                                            />
                                                        )}
                                                    </span>
                                                </button>
                                            );
                                        })()}

                                        {(() => {
                                            const isPromptOnlyMessage =
                                                Array.isArray(group.assistantMessage.content) &&
                                                group.assistantMessage.content.length === 1 &&
                                                group.assistantMessage.content[0].type === 'tool_result' &&
                                                group.assistantMessage.content[0].name === 'completion';

                                            const isLoadingMessage =
                                                Array.isArray(group.assistantMessage.content) &&
                                                group.assistantMessage.content.length === 1 &&
                                                group.assistantMessage.content[0].type === 'text' &&
                                                group.assistantMessage.content[0].text.includes(
                                                    'を分析中... おすすめの分析を生成しています...'
                                                );

                                            if (isPromptOnlyMessage || isLoadingMessage) {
                                                return (
                                                    <div className="break-words">
                                                        <StructuredMessageRenderer
                                                            message={group.assistantMessage}
                                                            className="prose max-w-none"
                                                            dbContext={dbContext || undefined}
                                                            selectedTable={selectedTable}
                                                            onTableSelect={onTableSelect}
                                                            hideToolCalls={false}
                                                            isLoadingMessage={isLoadingMessage}
                                                            onPromptClick={handlePromptSelection}
                                                            chartSpecs={chartSpecs}
                                                            tableGeometries={tableGeometries}
                                                        />
                                                    </div>
                                                );
                                            }

                                            return (
                                                <>
                                                    {!isCollapsed && (
                                                        <div className="break-words">
                                                            <StructuredMessageRenderer
                                                                message={group.assistantMessage}
                                                                className="prose max-w-none"
                                                                dbContext={dbContext || undefined}
                                                                selectedTable={selectedTable}
                                                                onTableSelect={onTableSelect}
                                                                hideToolCalls={false}
                                                                isLoadingMessage={isLoadingMessage}
                                                                onPromptClick={handlePromptSelection}
                                                                chartSpecs={chartSpecs}
                                                                tableGeometries={tableGeometries}
                                                            />
                                                            {isCurrentlyLoading &&
                                                                group.assistantMessage.streaming !== undefined && (
                                                                    <span className="inline-block animate-pulse ml-0.5">
                                                                        ▊
                                                                    </span>
                                                                )}
                                                        </div>
                                                    )}

                                                    {isCollapsed && (
                                                        <div className="break-words">
                                                            <StructuredMessageRenderer
                                                                message={group.assistantMessage}
                                                                className="prose max-w-none"
                                                                dbContext={dbContext || undefined}
                                                                selectedTable={selectedTable}
                                                                onTableSelect={onTableSelect}
                                                                hideToolCalls={true}
                                                                isStreaming={isCurrentlyLoading ? true : false}
                                                                isLoadingMessage={isLoadingMessage}
                                                                onPromptClick={handlePromptSelection}
                                                                chartSpecs={chartSpecs}
                                                                tableGeometries={tableGeometries}
                                                            />
                                                        </div>
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}

                {isLoading && messages.length === 0 && (
                    <div className="flex justify-start mb-4">
                        <div className="italic text-gray-600 w-full">考えています...</div>
                    </div>
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
                            // Reset scroll tracking when sending a new message
                            userHasScrolledRef.current = false;
                            await handleFormSubmit(e);
                        }}
                        onStop={handleStop}
                        dbContext={dbContext}
                        textareaRef={textareaRef}
                        placeholder="質問してみましょう"
                        className="w-full h-full p-2.5 resize-none text-gray-800 focus:outline-none overflow-y-auto"
                        schemaName={schemaName}
                        selectedTable={selectedTable}
                        isLoading={isLoading}
                        isSubmitting={isSubmitting}
                        renderMenu={
                            renderMenu
                                ? (onClose, onShowUrlGuide) => {
                                      console.log(
                                          'Chat renderMenu wrapper called, handleLoadSample:',
                                          handleLoadSample
                                      );
                                      return renderMenu(onClose, onShowUrlGuide, handleLoadSample);
                                  }
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
        </>
    );
}
