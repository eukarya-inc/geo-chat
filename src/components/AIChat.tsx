import { useState, useRef, useEffect, useMemo } from 'react';
import { type AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { TaskLoop, type Message } from '../lib/TaskLoop';

interface AIChatProps {
    db: AsyncDuckDB;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export default function AIChat({ db }: AIChatProps) {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [streamingMessage, setStreamingMessage] = useState<string>('');
    const [isStreaming, setIsStreaming] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;

    // Create TaskLoop instance (memoized to prevent recreation on re-renders)
    const taskLoop = useMemo(() => {
        if (!apiKey) return null;
        return new TaskLoop({ apiKey });
    }, [apiKey]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, streamingMessage]);

    const sendMessage = async () => {
        if (!input.trim() || !apiKey || !taskLoop) return;

        const userMessage: Message = { role: 'user', content: input };
        const currentInput = input;
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setLoading(true);
        setIsStreaming(true);
        setStreamingMessage('');

        try {
            await taskLoop.sendMessage(currentInput, {
                onStreamingUpdate: (content: string) => {
                    setStreamingMessage(content);
                },
                onComplete: (assistantMessage: Message) => {
                    setMessages(prev => [...prev, assistantMessage]);
                    setStreamingMessage('');
                    setIsStreaming(false);
                    setLoading(false);
                },
                onError: (error: Error) => {
                    console.error('TaskLoop Error:', error);
                    const errorMessage: Message = {
                        role: 'assistant',
                        content: 'エラーが発生しました。APIキーが正しく設定されているか確認してください。'
                    };
                    setMessages(prev => [...prev, errorMessage]);
                    setStreamingMessage('');
                    setIsStreaming(false);
                    setLoading(false);
                }
            });
        } catch (error) {
            console.error('TaskLoop Send Error:', error);
            const errorMessage: Message = {
                role: 'assistant',
                content: 'エラーが発生しました。APIキーが正しく設定されているか確認してください。'
            };
            setMessages(prev => [...prev, errorMessage]);
            setStreamingMessage('');
            setIsStreaming(false);
            setLoading(false);
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    };

    if (!apiKey) {
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
                padding: '20px',
                backgroundColor: '#f5f5f5',
                borderRadius: '8px',
                margin: '20px 0',
                color: '#333',
                textAlign: 'left'
            }}>
                <h3 style={{ color: '#333', margin: '0 0 16px 0' }}>AI Chat with Claude</h3>

            <div style={{
                height: '300px',
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
                {messages.map((message, index) => (
                    <div key={index} style={{
                        marginBottom: '10px',
                        padding: '8px',
                        backgroundColor: message.role === 'user' ? '#e3f2fd' : '#f1f8e9',
                        borderRadius: '4px',
                        color: '#333'
                    }}>
                        <strong style={{ color: '#333' }}>{message.role === 'user' ? 'あなた' : 'Claude'}:</strong>
                        <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', color: '#333' }}>
                            {message.content}
                        </div>
                    </div>
                ))}
                {isStreaming && streamingMessage && (
                    <div style={{
                        marginBottom: '10px',
                        padding: '8px',
                        backgroundColor: '#f1f8e9',
                        borderRadius: '4px',
                        color: '#333'
                    }}>
                        <strong style={{ color: '#333' }}>Claude:</strong>
                        <div style={{ marginTop: '4px', whiteSpace: 'pre-wrap', color: '#333' }}>
                            {streamingMessage}
                            <span style={{ 
                                opacity: 0.7, 
                                animation: 'blink 1s infinite',
                                marginLeft: '2px'
                            }}>▊</span>
                        </div>
                    </div>
                )}
                {loading && !isStreaming && (
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

            <div style={{ display: 'flex', gap: '10px' }}>
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Claudeに質問してください..."
                    style={{
                        flex: 1,
                        padding: '10px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        resize: 'vertical',
                        minHeight: '40px',
                        backgroundColor: '#fff',
                        color: '#333'
                    }}
                    disabled={loading || isStreaming}
                />
                <button
                    onClick={sendMessage}
                    disabled={loading || isStreaming || !input.trim()}
                    style={{
                        padding: '10px 20px',
                        backgroundColor: loading || isStreaming || !input.trim() ? '#ccc' : '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: loading || isStreaming || !input.trim() ? 'not-allowed' : 'pointer'
                    }}
                >
                    {loading ? '送信中...' : isStreaming ? 'Claude 回答中...' : '送信'}
                </button>
            </div>
        </div>
        </>
    );
}
