import { useRef, useEffect, useState } from 'react';
import { type AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useAIChat } from '../lib/modelingai/useAIChat';
import CollapsibleMessageRenderer from './CollapsibleMessageRenderer';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';
import type { CoreMessage } from 'ai';
import { PlusIcon } from '@heroicons/react/24/outline';

interface AIChatProps {
    db: AsyncDuckDB;
    dbStateManager?: DBStateManager;
    apiKey?: string;
    chatId?: string | null;
    messages: CoreMessage[];
    onMessagesChange: (messages: CoreMessage[]) => void;
    onSendMessageReady?: (sendMessage: (message: string) => void) => void;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    remoteFileComponent?: (onClose: () => void) => React.ReactNode;
}

export default function AIChat({ 
    db, 
    dbStateManager, 
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
    const {
        input,
        handleInputChange,
        handleSubmit,
        handleStop,
        isLoading,
        // error,
        isApiKeyConfigured,
        sendMessage,
    } = useAIChat(db, dbStateManager, apiKey, messages, onMessagesChange);

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
        // IME変換中（isComposing）の場合は送信しない
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
                    <p className="text-gray-500 italic">
                        チャットを開始しましょう。データの可視化やモデリングについて質問してみてください。
                    </p>
                )}
                {messages.map((message, index) => {
                    const isLastMessage = index === messages.length - 1;
                    const isStreamingMessage = isLastMessage && message.role === 'assistant' && isLoading;

                    return (
                        <div
                            key={index}
                            className={`mb-2.5 p-2 rounded overflow-hidden ${
                                message.role === 'user'
                                    ? 'bg-blue-50'
                                    : 'bg-green-50'
                            } text-gray-800`}
                        >
                            <strong className="text-gray-800">
                                {message.role === 'user' ? 'あなた' : 'Claude'}:
                            </strong>
                            <div className="mt-1 text-gray-800 break-words">
                                <CollapsibleMessageRenderer
                                    content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                                    className="prose prose-sm max-w-none"
                                    db={db}
                                    dbStateManager={dbStateManager}
                                    selectedTable={selectedTable}
                                    onTableSelect={onTableSelect}
                                />
                                {isStreamingMessage && (
                                    <span className="inline-block animate-pulse ml-0.5">▊</span>
                                )}
                            </div>
                        </div>
                    );
                })}
                {isLoading && messages.length === 0 && (
                    <div className="p-2 bg-green-50 rounded italic text-gray-600">
                        Claude is thinking...
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
