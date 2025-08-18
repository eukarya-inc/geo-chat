import { useRef, useEffect, useState, useMemo } from 'react';
import { useAIChat } from '../lib/modelingai';
import StructuredMessageRenderer from './StructuredMessageRenderer';
import type { DBContext } from '../lib/duckdb/dbContext';
import type { StructuredMessage } from '../types/message';
import { PlusIcon, ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';

interface AIChatProps {
    dbContext: DBContext;
    apiKey?: string;
    chatId?: string | null;
    messages: StructuredMessage[];
    onMessagesChange: (messages: StructuredMessage[]) => void;
    onSendMessageReady?: (sendMessage: (message: string) => void) => void;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    remoteFileComponent?: (onClose: () => void) => React.ReactNode;
}

export default function AIChat({
    dbContext,
    apiKey,
    messages,
    onMessagesChange,
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
    const {
        input,
        handleInputChange,
        handleSubmit,
        handleStop,
        isLoading,
        // error,
        isApiKeyConfigured,
        sendMessage,
    } = useAIChat(dbContext, apiKey, messages, onMessagesChange);

    // Group messages by user-assistant pairs
    const messageGroups = useMemo(() => {
        const groups: { userMessage: StructuredMessage; assistantMessage?: StructuredMessage; startIndex: number }[] = [];
        
        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            if (message.role === 'user') {
                const group: { userMessage: StructuredMessage; assistantMessage?: StructuredMessage; startIndex: number } = { 
                    userMessage: message, 
                    startIndex: i 
                };
                // Check if next message is assistant's response
                if (i + 1 < messages.length && messages[i + 1].role === 'assistant') {
                    group.assistantMessage = messages[i + 1];
                }
                groups.push(group);
                if (group.assistantMessage) {
                    i++; // Skip the assistant message we just processed
                }
            }
        }
        
        return groups;
    }, [messages]);

    // Toggle collapse state for a group
    const toggleGroupCollapse = (groupIndex: number) => {
        // Mark this group as manually toggled
        setManuallyToggledGroups(prev => {
            const newSet = new Set(prev);
            newSet.add(groupIndex);
            return newSet;
        });
        
        // Toggle the collapsed state
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

    // Auto-collapse when a new assistant message appears (even if empty during streaming)
    useEffect(() => {
        // Check if the last group has an assistant message (it means AI started responding)
        if (messageGroups.length > 0) {
            const lastGroup = messageGroups[messageGroups.length - 1];
            const lastIndex = messageGroups.length - 1;
            
            // Only auto-collapse if:
            // 1. There's an assistant message
            // 2. It's not already collapsed
            // 3. It hasn't been manually toggled by the user
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

    // Check if scroll position is near bottom (within 100px)
    const isNearBottom = () => {
        const container = scrollContainerRef.current;
        if (!container) return true;

        const threshold = 100;
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        return scrollBottom <= threshold;
    };

    // Track user scroll events
    const handleScroll = () => {
        const container = scrollContainerRef.current;
        if (!container) return;

        // If user is not at bottom, they have manually scrolled
        userHasScrolledRef.current = !isNearBottom();
    };

    // Auto-scroll effect
    useEffect(() => {
        // Skip if user has manually scrolled up
        if (userHasScrolledRef.current) {
            return;
        }

        // For first few messages or when near bottom, auto-scroll
        if (messages.length <= 2 || isNearBottom()) {
            const now = Date.now();
            const timeSinceLastScroll = now - lastScrollTimeRef.current;

            // Throttle scrolling to once per second to allow manual scrolling
            if (timeSinceLastScroll >= 1000 || messages.length <= 2) {
                lastScrollTimeRef.current = now;
                setTimeout(() => {
                    scrollToBottom();
                }, 100);
            }
        }
    }, [messages]);

    // Reset user scroll flag when loading ends and user is at bottom
    useEffect(() => {
        if (!isLoading && isNearBottom()) {
            userHasScrolledRef.current = false;
        }
    }, [isLoading]);

    // Pass sendMessage function to parent component
    useEffect(() => {
        if (onSendMessageReady) {
            onSendMessageReady(sendMessage);
        }
    }, [onSendMessageReady, sendMessage]); // Include sendMessage to always have latest version

    // Handle click outside to close popup
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
        // During IME conversion (isComposing), do not send
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
                    
                    // Check if user message contains only TABLE_CREATED marker
                    const userContent = typeof group.userMessage.content === 'string' ? group.userMessage.content : '';
                    const isTableOnlyMessage = userContent.includes('<!--TABLE_CREATED:') && 
                                              userContent.replace(/<!--TABLE_CREATED:.*?-->/g, '').trim() === '';

                    return (
                        <div key={groupIndex} className="mb-4">
                            {/* User message */}
                            {isTableOnlyMessage ? (
                                <div className="mb-2 w-full">
                                    <StructuredMessageRenderer
                                        message={group.userMessage}
                                        className="prose prose-xs max-w-none"
                                        dbContext={dbContext}
                                        selectedTable={selectedTable}
                                        onTableSelect={onTableSelect}
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
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Assistant message */}
                            {group.assistantMessage && (
                                <div className="flex justify-start">
                                    <div className="w-full">
                                        {/* Collapse/Expand button (show always when assistant message exists) */}
                                        {(
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
                                        )}

                                        {/* Show full message only when not collapsed */}
                                        {!isCollapsed && (
                                            <div className="break-words">
                                                <StructuredMessageRenderer
                                                    message={group.assistantMessage}
                                                    className="prose max-w-none"
                                                                dbContext={dbContext}
                                                    selectedTable={selectedTable}
                                                    onTableSelect={onTableSelect}
                                                    hideToolCalls={false}
                                                />
                                                {isCurrentlyLoading && group.assistantMessage.streaming !== undefined && (
                                                    <span className="inline-block animate-pulse ml-0.5">▊</span>
                                                )}
                                            </div>
                                        )}

                                        {/* When collapsed, show table messages always, and final text only when not loading */}
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
                                                />
                                            </div>
                                        )}
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
                    placeholder="Claudeに質問してください..."
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
                        disabled={!isLoading && !input.trim()}
                        className={`px-5 py-2 text-white font-medium rounded transition-colors duration-200 ${
                            isLoading
                                ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                                : !input.trim()
                                ? 'bg-gray-400 cursor-not-allowed'
                                : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
                        } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                    >
                        {isLoading ? '停止' : '送信'}
                    </button>
                </div>
            </form>
        </div>
    );
}
