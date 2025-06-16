import { useRef, useEffect } from 'react';
import { type AsyncDuckDB } from '@duckdb/duckdb-wasm';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { useAIChat } from '../lib/ai/useAIChat';

interface AIChatProps {
    db: AsyncDuckDB;
}

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
        suggestedPrompts,
        handleSuggestedPromptClick,
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
                
                /* Markdown styling */
                .markdown-content h1, .markdown-content h2, .markdown-content h3, 
                .markdown-content h4, .markdown-content h5, .markdown-content h6 {
                    margin: 1em 0 0.5em 0;
                    font-weight: bold;
                    color: #333;
                }
                
                .markdown-content p {
                    margin: 0.5em 0;
                    line-height: 1.5;
                }
                
                .markdown-content code {
                    background-color: #f4f4f4;
                    padding: 2px 6px;
                    border-radius: 3px;
                    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                    font-size: 0.9em;
                }
                
                .markdown-content pre {
                    background-color: #f8f8f8;
                    border: 1px solid #e1e1e1;
                    border-radius: 4px;
                    padding: 12px;
                    overflow-x: auto;
                    margin: 1em 0;
                }
                
                .markdown-content pre code {
                    background-color: transparent;
                    padding: 0;
                    border-radius: 0;
                }
                
                .markdown-content ul, .markdown-content ol {
                    margin: 0.5em 0;
                    padding-left: 2em;
                }
                
                .markdown-content li {
                    margin: 0.2em 0;
                }
                
                .markdown-content blockquote {
                    border-left: 4px solid #ddd;
                    margin: 1em 0;
                    padding-left: 1em;
                    color: #666;
                }
                
                .markdown-content table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1em 0;
                }
                
                .markdown-content th, .markdown-content td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                
                .markdown-content th {
                    background-color: #f2f2f2;
                    font-weight: bold;
                }
                
                .markdown-content strong {
                    font-weight: bold;
                }
                
                .markdown-content em {
                    font-style: italic;
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
                                <div style={{ marginTop: '4px', color: '#333' }}>
                                    {message.role === 'user' ? (
                                        <div style={{ whiteSpace: 'pre-wrap' }}>
                                            {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                                        </div>
                                    ) : (
                                        <div className="markdown-content">
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                rehypePlugins={[rehypeHighlight]}
                                            >
                                                {typeof message.content === 'string' ? message.content : JSON.stringify(message.content, null, 2)}
                                            </ReactMarkdown>
                                        </div>
                                    )}
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

                {suggestedPrompts.length > 0 && (
                    <div style={{
                        marginBottom: '10px',
                        padding: '10px',
                        backgroundColor: 'white',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        flexShrink: 0
                    }}>
                        <div style={{
                            fontSize: '14px',
                            fontWeight: 'bold',
                            marginBottom: '8px',
                            color: '#333'
                        }}>
                            おすすめの質問:
                        </div>
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '6px'
                        }}>
                            {suggestedPrompts.map((prompt) => (
                                <button
                                    key={prompt.id}
                                    onClick={() => handleSuggestedPromptClick(prompt.text)}
                                    style={{
                                        padding: '8px 12px',
                                        textAlign: 'left',
                                        backgroundColor: '#f8f9fa',
                                        border: '1px solid #e9ecef',
                                        borderRadius: '4px',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        color: '#495057',
                                        transition: 'background-color 0.2s',
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor = '#e9ecef';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor = '#f8f9fa';
                                    }}
                                    title={prompt.description}
                                >
                                    {prompt.text}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

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
