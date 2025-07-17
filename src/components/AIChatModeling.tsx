import { useRef, useEffect } from 'react';
import { type AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useAIChat } from '../lib/modelingai/useAIChat';
import CollapsibleMessageRenderer from './CollapsibleMessageRenderer';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';

interface AIChatProps {
    db: AsyncDuckDB;
    dbStateManager?: DBStateManager;
    apiKey?: string;
}

export default function AIChat({ db, dbStateManager, apiKey }: AIChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        handleStop,
        isLoading,
        // error,
        isApiKeyConfigured,
    } = useAIChat(db, dbStateManager, apiKey);

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

    useEffect(() => {
        // Only scroll to bottom if user is already near the bottom
        if (isNearBottom()) {
            scrollToBottom();
        }
    }, [messages]);

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
            <div ref={scrollContainerRef} className="flex-1 overflow-y-auto bg-white border border-gray-300 rounded-md p-2.5 mb-2.5">
                {messages.length === 0 && (
                    <p className="text-gray-500 italic">
                        Claudeとチャットを開始しましょう。データ分析について質問してみてください。
                    </p>
                )}
                {messages.map((message, index) => {
                    const isLastMessage = index === messages.length - 1;
                    const isStreamingMessage = isLastMessage && message.role === 'assistant' && isLoading;

                    return (
                        <div
                            key={index}
                            className={`mb-2.5 p-2 rounded ${
                                message.role === 'user'
                                    ? 'bg-blue-50'
                                    : 'bg-green-50'
                            } text-gray-800`}
                        >
                            <strong className="text-gray-800">
                                {message.role === 'user' ? 'あなた' : 'Claude'}:
                            </strong>
                            <div className="mt-1 text-gray-800">
                                {message.role === 'user' ? (
                                    <div className="whitespace-pre-wrap">
                                        {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                                    </div>
                                ) : (
                                    <CollapsibleMessageRenderer
                                        content={typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                                        className="prose prose-sm max-w-none"
                                        db={db}
                                        dbStateManager={dbStateManager}
                                    />
                                )}
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

            <form onSubmit={handleSubmit} className="flex gap-2.5 flex-shrink-0">
                <textarea
                    value={input}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder="Claudeに質問してください..."
                    className="flex-1 p-2.5 border border-gray-300 rounded resize-none h-15 bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    rows={2}
                />
                <button
                    type="button"
                    onClick={handleButtonClick}
                    disabled={!isLoading && !input.trim()}
                    className={`px-5 py-2.5 text-white font-medium rounded transition-colors duration-200 ${
                        isLoading
                            ? 'bg-red-500 hover:bg-red-600 focus:ring-red-500'
                            : !input.trim()
                            ? 'bg-gray-400 cursor-not-allowed'
                            : 'bg-blue-500 hover:bg-blue-600 focus:ring-blue-500'
                    } focus:outline-none focus:ring-2 focus:ring-offset-2`}
                >
                    {isLoading ? '停止' : '送信'}
                </button>
            </form>
        </div>
    );
}
