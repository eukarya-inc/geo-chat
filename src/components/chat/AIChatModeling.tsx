import { useRef, useEffect, useState, useMemo } from 'react';
import { useAI } from '../../lib/ai/useAI';
import StructuredMessageRenderer from './StructuredMessageRenderer';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { StructuredMessage } from '../../types/message';
import { PlusIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import { generatePromptSuggestions } from '../../lib/modelingai/promptSuggestionService';

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
    remoteFileComponent?: (onClose: () => void) => React.ReactNode;
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
    remoteFileComponent
}: AIChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const lastScrollTimeRef = useRef<number>(0);
    const userHasScrolledRef = useRef<boolean>(false);
    const [showPopup, setShowPopup] = useState(false);
    const popupRef = useRef<HTMLDivElement>(null);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
    const [manuallyToggledGroups, setManuallyToggledGroups] = useState<Set<number>>(new Set());
    const promptSuggestionAbortRef = useRef<AbortController | null>(null);

    const effectiveChatId = chatId || 'default';

    const handleMessagesChange = (messages: StructuredMessage[]) => {
        if (chatId && updateChatMessages) {
            updateChatMessages(chatId, messages);
        }
        onMessagesChange(messages);
    };

    const {
        messages,
        isLoading,
        isAnyLoading,
        input,
        handleInputChange,
        handleSubmit,
        handleStop,
        sendMessage,
        isApiKeyConfigured,
    } = useAI({
        chatId: effectiveChatId,
        schema: schemaName,
        dbContext,
        apiKey,
        onMessagesChange: handleMessagesChange
    });

    const messageGroups = useMemo(() => {
        const groups: { userMessage: StructuredMessage; assistantMessage?: StructuredMessage; startIndex: number }[] = [];
        
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message.role === 'user') {
                const group: { userMessage: StructuredMessage; assistantMessage?: StructuredMessage; startIndex: number } = { 
                    userMessage: message, 
                    startIndex: i 
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
            
            if (lastGroup.assistantMessage && 
                !collapsedGroups.has(lastIndex) && 
                !manuallyToggledGroups.has(lastIndex)) {
                setCollapsedGroups(prev => {
                    const newSet = new Set(prev);
                    newSet.add(lastIndex);
                    return newSet;
                });
            }
        }
    }, [messageGroups, collapsedGroups, manuallyToggledGroups]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

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

        userHasScrolledRef.current = !isNearBottom();
    };

    useEffect(() => {
        if (userHasScrolledRef.current) {
            return;
        }

        if (messages.length <= 2 || isNearBottom()) {
            const now = Date.now();
            const timeSinceLastScroll = now - lastScrollTimeRef.current;

            if (timeSinceLastScroll >= 1000 || messages.length <= 2) {
                lastScrollTimeRef.current = now;
                setTimeout(() => {
                    scrollToBottom();
                }, 100);
            }
        }
    }, [messages]);

    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage && Array.isArray(lastMessage.content)) {
            const hasCompletionResult = lastMessage.content.some(
                block => block.type === 'tool_result' && block.name === 'completion'
            );
            if (hasCompletionResult) {
                setTimeout(() => {
                    scrollToBottom();
                }, 200);
            }
        }
    }, [messages]);

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
            const lastMessage = messages[messages.length - 1];
            if (!lastMessage || lastMessage.role !== 'user') return;
            
            const content = typeof lastMessage.content === 'string' ? lastMessage.content : '';
            if (!content.includes('<!--TABLE_CREATED:')) return;
            
            if (content.includes(':FROM_EXAMPLE-->')) {
                return;
            }
            
            if (messages.length > 1) {
                const prevMessage = messages[messages.length - 2];
                if (prevMessage && typeof prevMessage.content === 'string' && 
                    prevMessage.content.includes('<!--TABLE_CREATED:')) {
                    return;
                }
            }
            
            let tableName: string | null = null;
            if (content.includes(':FROM_EXAMPLE-->')) {
                const match = content.match(/<!--TABLE_CREATED:(.+?):FROM_EXAMPLE-->/);
                tableName = match ? match[1] : null;
            } else {
                const match = content.match(/<!--TABLE_CREATED:(.+?)-->/);
                tableName = match ? match[1] : null;
            }
            tableName = tableName || selectedTable || null;
            
            if (!tableName || !dbContext || !apiKey) return;

            const loadingMessage: StructuredMessage = {
                role: 'assistant',
                content: [
                    {
                        type: 'text',
                        text: `テーブル「${tableName}」を分析中... おすすめの分析を生成しています...`
                    }
                ]
            };
            
            const messagesWithLoading = [...messages, loadingMessage];
            onMessagesChange(messagesWithLoading);
            
            try {
                if (abortSignal.aborted) {
                    onMessagesChange(messages);
                    return;
                }
                
                const prompts = await generatePromptSuggestions(
                    tableName,
                    dbContext,
                    schemaName || null,
                    apiKey || ''
                );
                
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
                                        description: p.category
                                    })),
                                    completionMessage: `テーブル「${tableName}」が作成されました。以下の分析をお試しください:`,
                                    timestamp: new Date().toISOString()
                                }
                            }
                        ]
                    };
                    
                    const updatedMessages = [...messages, promptMessage];
                    onMessagesChange(updatedMessages);
                } else {
                    onMessagesChange(messages);
                }
            } catch (error) {
                if (abortSignal.aborted) {
                    return;
                }
                console.error('Failed to load prompt suggestions:', error);
                onMessagesChange(messages);
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
    }, [messages, selectedTable, dbContext, schemaName, chatId, apiKey, onMessagesChange]);

    const handlePromptSelection = (promptText: string) => {
        if (input === promptText) {
            const changeEvent = {
                target: { value: '' }
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
            sendMessage(promptText);
        } else {
            const changeEvent = {
                target: { value: promptText }
            } as React.ChangeEvent<HTMLTextAreaElement>;
            handleInputChange(changeEvent);
        }
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (showPopup &&
                popupRef.current &&
                buttonRef.current &&
                !popupRef.current.contains(event.target as Node) &&
                !buttonRef.current.contains(event.target as Node)) {
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

    if (!isApiKeyConfigured) {
        return (
            <div className="p-5 bg-gray-100 rounded-lg m-5 text-gray-800 text-left">
                <h3 className="text-gray-800 mb-4 font-semibold text-lg">AI Chat</h3>
                <p className="text-gray-600">
                    AIチャット機能を使用するには、.envファイルにVITE_ANTHROPIC_API_KEYを設定してください。
                </p>
            </div>
        );
    }

    return (
        <div className="p-2.5 bg-gray-100 text-gray-800 text-left h-screen flex flex-col overflow-hidden">
            <div ref={scrollContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto bg-white border border-gray-300 rounded-md p-2.5 mb-2.5">
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
                    const isTableOnlyMessage = userContent.includes('<!--TABLE_CREATED:') && 
                                              userContent.replace(/<!--TABLE_CREATED:.*?-->/g, '').trim() === '';

                    return (
                        <div key={groupIndex} className="mb-4">
                            {isTableOnlyMessage ? (
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
                                            minWidth: '150px'
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
                                                group.assistantMessage.content[0].text.includes('を分析中... おすすめの分析を生成しています...');
                                            
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
                                                        {isCurrentlyLoading ? '思考中...' : (isCollapsed ? '思考過程を表示' : '思考過程を隠す')}
                                                        {isCurrentlyLoading && isCollapsed && (
                                                            <span 
                                                                className="absolute inset-0 animate-shimmer"
                                                                style={{
                                                                    backgroundImage: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                                                                    backgroundSize: '200% 100%'
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
                                                group.assistantMessage.content[0].text.includes('を分析中... おすすめの分析を生成しています...');
                                            
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
                                                                onPromptClick={handlePromptSelection}
                                                            />
                                                            {isCurrentlyLoading && group.assistantMessage.streaming !== undefined && (
                                                                <span className="inline-block animate-pulse ml-0.5">▊</span>
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
                        <div className="italic text-gray-600 w-full">
                            考えています...
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-2 flex-shrink-0">
                <textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder="質問してみましょう"
                    className="w-full p-2.5 border border-gray-300 rounded resize-none h-15 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
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
                                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
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