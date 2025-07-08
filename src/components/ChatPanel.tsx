import { useState, useEffect } from 'react';
import { useAIChat } from '../features/chat/hooks/useAIChat';
import { ApiKeyConfig } from './ApiKeyConfig';
import { retrieveEncryptedApiKey } from '../utils/encryption';
import './ChatPanel.css';

function ChatPanel() {
  const [input, setInput] = useState('');
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [isCheckingApiKey, setIsCheckingApiKey] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const { messages, isLoading, sendMessage } = useAIChat(undefined, apiKey || undefined);

  useEffect(() => {
    checkApiKey();
  }, []);

  const checkApiKey = async () => {
    try {
      const key = await retrieveEncryptedApiKey();
      setApiKey(key);
    } catch (error) {
      console.error('Failed to retrieve API key:', error);
    } finally {
      setIsCheckingApiKey(false);
    }
  };

  const handleApiKeySet = (key: string) => {
    setApiKey(key || null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const message = input.trim();
    setInput('');
    
    // Send to AI
    await sendMessage(message);
  };

  if (isCheckingApiKey) {
    return (
      <div className="chat-panel">
        <div className="chat-loading">Loading...</div>
      </div>
    );
  }

  if (!apiKey) {
    return (
      <div className="chat-panel">
        <ApiKeyConfig onApiKeySet={handleApiKeySet} />
      </div>
    );
  }

  return (
    <div className={`chat-panel ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="chat-header">
        <h2>GIS Data Analysis Chat</h2>
        <button 
          className="collapse-button"
          onClick={() => setIsCollapsed(!isCollapsed)}
          aria-label={isCollapsed ? 'Expand chat' : 'Collapse chat'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>
      
      {!isCollapsed && (
        <>
          <div className="chat-messages">
            {messages.length === 0 ? (
              <div className="chat-welcome">
                <h3>Welcome! 👋</h3>
                <p>I can help you analyze GIS data. Try:</p>
                <ul>
                  <li>Upload a GeoJSON or Parquet file</li>
                  <li>Ask questions about your spatial data</li>
                  <li>Create maps and charts</li>
                  <li>Run spatial analysis</li>
                </ul>
              </div>
            ) : (
              messages.map(message => (
                <div key={message.id} className={`chat-message ${message.role}`}>
                  <div className="message-content">{message.content}</div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="chat-message assistant loading">
                <div className="loading-dots">
                  <span></span>
                  <span></span>
                  <span></span>
                </div>
              </div>
            )}
          </div>
          
          <form className="chat-input-form" onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about your data..."
              className="chat-input"
              disabled={isLoading}
            />
            <button type="submit" disabled={!input.trim() || isLoading}>
              Send
            </button>
          </form>
        </>
      )}
    </div>
  );
}

export default ChatPanel;
