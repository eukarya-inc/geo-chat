import { useRef, useEffect } from 'react';
import { type AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { useAIChat } from '../lib/ai/useAIChat';

interface AIChatProps {
    db: AsyncDuckDB;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function AIChat({ db }: AIChatProps) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const {
        messages,
        input,
        handleInputChange,
        handleSubmit,
        isLoading,
        // error,
        isApiKeyConfigured,
    } = useAIChat(db);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);


    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    if (!isApiKeyConfigured) {
        return (
            <div style={{
                padding: '20px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                margin: '20px 0',
                color: '#333',
                textAlign: 'left'
            }}>
                <h3 style={{ color: '#333', margin: '0 0 16px 0' }}>AI Chat</h3>
                <p style={{ color: '#666', margin: '0' }}>
                    AIチャット機能を使用するには、.envファイルにVITE_ANTHROPIC_API_KEYを設定してください。
                </p>
            </div>
        );
    }

    return (
        <>
            <style>{`
                @keyframes blink {
                    0%, 50% { opacity: 1; }
                    51%, 100% { opacity: 0; }
                }
            `}</style>
            <div style={{
                padding: '10px',
                backgroundColor: '#f5f5f5',
                color: '#333',
                textAlign: 'left',
                height: '100vh',
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden'
            }}>
                <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    backgroundColor: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '4px',
                    padding: '10px',
                    marginBottom: '10px'
                }}>
                    {messages.length === 0 && (
                        <p style={{ color: '#666', fontStyle: 'italic', margin: '0' }}>
                            Claudeとチャットを開始しましょう。データ分析について質問してみてください。
                        </p>
                    )}
                    {messages.map((message, index) => {
                        const isLastMessage = index === messages.length - 1;
                        const isStreamingMessage = isLastMessage && message.role === 'assistant' && isLoading;

                        return (
                            <div key={index} style={{
                                marginBottom: '10px',
                                padding: '8px',
                                backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f1f8e9',
                                borderRadius: '4px',
                                color: '#333'
                            }}>
                                <strong style={{ color: '#333' }}>{message.role === 'user' ? 'あなた' : 'Claude'}:</strong>
                                <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', color: '#333' }}>
                                    {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                                    {isStreamingMessage && (
                                        <span style={{
                                            opacity: 0.7,
                                            animation: 'blink 1s infinite',
                                            marginLeft: '2px'
                                        }}>▊</span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                    {isLoading && messages.length === 0 && (
                        <div style={{
                            padding: '8px',
                            backgroundColor: '#f1f8e9',
                            borderRadius: '4px',
                            fontStyle: 'italic',
                            color: '#666'
                        }}>
                            Claude is thinking...
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <form onSubmit={handleSubmit} style={{ 
                    display: 'flex', 
                    gap: '10px',
                    flexShrink: 0
                }}>
                    <textarea
                        value={input}
                        onChange={handleInputChange}
                        onKeyPress={handleKeyPress}
                        placeholder="Claudeに質問してください..."
                        style={{
                            flex: 1,
                            padding: '10px',
                            border: '1px solid #ddd',
                            borderRadius: '4px',
                            resize: 'none',
                            height: '60px',
                            backgroundColor: '#fff',
                            color: '#333'
                        }}
                        disabled={isLoading}
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !input.trim()}
                        style={{
                            padding: '10px 20px',
                            backgroundColor: isLoading || !input.trim() ? '#ccc' : '#007bff',
                            color: 'white',
                            border: 'none',
                            borderRadius: '4px',
                            cursor: isLoading || !input.trim() ? 'not-allowed' : 'pointer',
                            height: '60px'
                        }}
                    >
                        {isLoading ? 'Claude 回答中...' : '送信'}
                    </button>
                </form>
            </div>
        </>
    );
}
