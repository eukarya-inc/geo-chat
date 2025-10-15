import { useRef, useEffect, useState, useMemo, useCallback } from 'react';
import { useAIChat } from '../../lib/ai/useAIChat';
import { aiStore } from '../../lib/ai/AIStore';
import StructuredMessageRenderer from './StructuredMessageRenderer';
import ChatInput from './ChatInput';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { StructuredMessage } from '../../types/message';
import { PlusIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { generatePromptSuggestions } from '../../lib/ai/promptSuggestionService';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/remoteAtoms';
import type { TableStyle } from '../map';
import { isTableCreatedOnlyMessage } from './utils';

interface AIChatProps {
    dbContext: DBContext;
    apiKey?: string;
    chatId?: string | null;
    schemaName?: string | null;
    onMessagesChange: (messages: StructuredMessage[]) => void;
    updateChatMessages?: (chatId: string, messages: StructuredMessage[]) => void;
    onSendMessageReady?: (sendMessage: (message: string) => void) => void;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
    onChartDelete?: (tableName: string) => Promise<void>;
    getCurrentChatState?: () => ChatState | null;
    onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>;
    onMapStyleDelete?: (tableName: string) => Promise<void>;
    remoteFileComponent?: (onClose: () => void) => React.ReactNode;
    onConversationCompleted?: () => void;
}

export default function AIChat({
    dbContext,
    apiKey,
    chatId,
    schemaName,
    onMessagesChange,
    updateChatMessages,
    onSendMessageReady,
    selectedTable,
    onTableSelect,
    onChartUpdate,
    onChartDelete,
    getCurrentChatState,
    onMapStyleUpdate,
    onMapStyleDelete,
    remoteFileComponent,
    onConversationCompleted,
}: AIChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastScrollTimeRef = useRef<number>(0);
    const userHasScrolledRef = useRef<boolean>(false);
    const isProgrammaticScrollRef = useRef<boolean>(false);
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
    const [manuallyToggledGroups, setManuallyToggledGroups] = useState<Set<number>>(new Set());
    const promptSuggestionAbortRef = useRef<AbortController | null>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const effectiveChatId = chatId || 'default';

    const handleMessagesChange = useCallback(
        (messages: StructuredMessage[]) => {
            // Update AIStore's session messages
            aiStore.updateMessages(effectiveChatId, messages);

            if (chatId && updateChatMessages) {
                updateChatMessages(chatId, messages);
            }
            onMessagesChange(messages);
        },
        [effectiveChatId, chatId, updateChatMessages, onMessagesChange]
    );

    const scrollToBottom = useCallback(() => {
        isProgrammaticScrollRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        // Reset the flag after scrolling
        setTimeout(() => {
            isProgrammaticScrollRef.current = false;
        }, 500);
    }, []);

    const { messages, isLoading, isAnyLoading, input, handleInputChange, handleSubmit, handleStop, sendMessage } =
        useAIChat({
            chatId: effectiveChatId,
            schema: schemaName,
            dbContext,
            apiKey,
            selectedTable,
            onMessagesChange: handleMessagesChange,
            onChartUpdate,
            onChartDelete,
            getCurrentChatState,
            onMapStyleUpdate,
            onMapStyleDelete,
            onConversationCompleted,
        });

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

    useEffect(() => {
        if (onSendMessageReady) {
            onSendMessageReady(sendMessage);
        }
    }, [onSendMessageReady, sendMessage]);

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

            // Check if we already have prompt suggestions for this table
            // Table creation suggestions are in tool_result, completion suggestions are in tool_use (for memory efficiency)
            const hasPromptSuggestions = messages.some(
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
                                'suggestedPrompts' in block.result) ||
                            // Check for completion suggestions (tool_use)
                            (block.type === 'tool_use' &&
                                block.name === 'completion' &&
                                block.input &&
                                typeof block.input === 'object' &&
                                'suggestedPrompts' in block.input)
                    )
            );

            if (hasPromptSuggestions) {
                return;
            }

            // Extract table name from the marker
            const match = content.match(/<!--TABLE_CREATED:(.+?)-->/);
            const tableName = match?.[1] || selectedTable || null;

            if (!tableName || !dbContext || !apiKey) return;

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

    const handlePromptSelection = (promptText: string) => {
        if (input === promptText) {
            const changeEvent = {
                target: { value: '' },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
            // Reset scroll tracking when sending a new message
            userHasScrolledRef.current = false;
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
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (
                showPopup &&
                popupRef.current &&
                buttonRef.current &&
                !popupRef.current.contains(event.target as Node) &&
                !buttonRef.current.contains(event.target as Node)
            ) {
                setShowPopup(false);
            }
        };

        if (showPopup) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [showPopup]);

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && !isLoading) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    const handleButtonClick = (e: React.FormEvent) => {
        e.preventDefault();
        if (isLoading) {
            handleStop();
        } else {
            handleSubmit(e);
        }
    };

    return (
        <div className="p-2.5 bg-gray-100 text-gray-800 text-left h-screen flex flex-col overflow-hidden">
            <div
                ref={scrollContainerRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto bg-white border border-gray-300 rounded-md p-2.5 mb-2.5"
            >
                {messages.length === 0 && (
                    <p className="text-gray-500">
                        チャットを開始しましょう。データの可視化やモデリングについて質問してみてください。
                    </p>
                )}
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
                                        dbContext={dbContext}
                                        selectedTable={selectedTable}
                                        onTableSelect={onTableSelect}
                                        onPromptClick={handlePromptSelection}
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
                                                dbContext={dbContext}
                                                selectedTable={selectedTable}
                                                onTableSelect={onTableSelect}
                                                onPromptClick={handlePromptSelection}
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
                                                            dbContext={dbContext}
                                                            selectedTable={selectedTable}
                                                            onTableSelect={onTableSelect}
                                                            hideToolCalls={false}
                                                            isLoadingMessage={isLoadingMessage}
                                                            onPromptClick={handlePromptSelection}
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
                                                                dbContext={dbContext}
                                                                selectedTable={selectedTable}
                                                                onTableSelect={onTableSelect}
                                                                hideToolCalls={false}
                                                                isLoadingMessage={isLoadingMessage}
                                                                onPromptClick={handlePromptSelection}
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
                                                                dbContext={dbContext}
                                                                selectedTable={selectedTable}
                                                                onTableSelect={onTableSelect}
                                                                hideToolCalls={true}
                                                                isStreaming={isCurrentlyLoading ? true : false}
                                                                isLoadingMessage={isLoadingMessage}
                                                                onPromptClick={handlePromptSelection}
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

            <form
                onSubmit={e => {
                    // Reset scroll tracking when sending a new message
                    userHasScrolledRef.current = false;
                    handleSubmit(e);
                }}
                className="flex flex-col gap-2 flex-shrink-0"
            >
                <ChatInput
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    dbContext={dbContext}
                    textareaRef={textareaRef}
                    placeholder="質問してみましょう（@でテーブル名を補完）"
                    className="w-full p-2.5 border border-gray-300 rounded resize-none h-15 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                    schemaName={schemaName}
                />
                <div className="flex justify-between">
                    {remoteFileComponent && (
                        <div className="relative">
                            <button
                                ref={buttonRef}
                                type="button"
                                onClick={() => setShowPopup(!showPopup)}
                                className="p-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
                                title="データを読み込む"
                            >
                                <PlusIcon className="w-5 h-5" />
                            </button>

                            {showPopup && (
                                <div
                                    ref={popupRef}
                                    className="absolute bottom-full mb-2 left-0 bg-white rounded-lg shadow-2xl border border-gray-200 z-50"
                                    style={{ width: '500px', maxHeight: '400px' }}
                                >
                                    <div className="relative">
                                        <button
                                            onClick={() => setShowPopup(false)}
                                            className="absolute top-2 right-2 p-1 hover:bg-gray-100 rounded transition-colors z-10"
                                        >
                                            <svg
                                                className="w-4 h-4"
                                                fill="none"
                                                stroke="currentColor"
                                                viewBox="0 0 24 24"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    strokeWidth={2}
                                                    d="M6 18L18 6M6 6l12 12"
                                                />
                                            </svg>
                                        </button>
                                        <div className="p-4 overflow-auto" style={{ maxHeight: '400px' }}>
                                            {remoteFileComponent(() => setShowPopup(false))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleButtonClick}
                        disabled={(!isLoading && !input.trim()) || (!isLoading && isAnyLoading)}
                        className={`px-5 py-2 text-white font-medium rounded transition-colors duration-200 ${
                            isLoading
                                ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                                : !input.trim() || isAnyLoading
                                  ? 'bg-gray-400 cursor-not-allowed'
                                  : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
                        } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                        title={!isLoading && isAnyLoading ? '他のチャットが処理中です' : ''}
                    >
                        {isLoading ? '停止' : '送信'}
                    </button>
                </div>
            </form>
        </div>
    );
}
