import { useState, useCallback } from 'react';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, streamText } from 'ai';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

export function useAIChat(db?: AsyncDuckDB | null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);


  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || !apiKey || isLoading) return;

    const userMessage: CoreMessage = { role: 'user', content: input.trim() };
    // const currentInput = input.trim();

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);

    try {
      const anthropicClient = createAnthropic({
        apiKey: apiKey,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });

      const allMessages = [...messages, userMessage];

      const result = streamText({
        model: anthropicClient('claude-3-5-sonnet-20241022'),
        system: generateSystemPrompt(),
        messages: allMessages,
        tools: { ...(db && {  duckdb_query: createDuckDBTool(db) }) },
        maxSteps: 50,
        maxTokens: 1000,
        maxRetries: 30,
      });

      let fullContent = '';
      const assistantMessage: CoreMessage = { role: 'assistant', content: '' };

      // Add placeholder for streaming message
      setMessages(prev => [...prev, assistantMessage]);

      // Use fullStream to handle both text and tool calls
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullContent += part.textDelta;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: fullContent };
              return updated;
            });
            break;

          case 'tool-call':
            // Show tool call execution
            const args = part.args as any;
            const toolCallText = `\n\n🔧 **SQL実行中:** \`${args?.sql || 'クエリ実行中'}\`\n`;
            fullContent += toolCallText;
            setMessages(prev => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: 'assistant', content: fullContent };
              return updated;
            });
            break;
        }
      }

      // Ensure final content is set
      if (!fullContent) {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: 'エラーが発生しました' };
          return updated;
        });
      }

    } catch (err) {
      console.error('Chat error:', err);
      const errorMsg = err instanceof Error ? err.message : 'エラーが発生しました';
      setError(err instanceof Error ? err : new Error(errorMsg));

      // Update the current assistant message with error info instead of adding new message
      setMessages(prev => {
        const updated = [...prev];
        if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
          const currentContent = updated[updated.length - 1].content;
          updated[updated.length - 1] = {
            role: 'assistant',
            content: currentContent + `\n\n❌ **エラーが発生しました:** ${errorMsg}`
          };
        } else {
          updated.push({
            role: 'assistant',
            content: `❌ **エラーが発生しました:** ${errorMsg}`
          });
        }
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  }, [input, apiKey, isLoading, messages, db]);

  const isApiKeyConfigured = Boolean(apiKey);

  return {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    isLoading,
    error,
    isApiKeyConfigured,
  };
}
