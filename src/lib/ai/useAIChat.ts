import { useState, useCallback } from 'react';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, streamText } from 'ai';
import { generateSystemPrompt } from './systemPrompt';

export function useAIChat() {
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
        maxTokens: 1000,
        maxRetries: 30,
      });

      let fullContent = '';
      const assistantMessage: CoreMessage = { role: 'assistant', content: '' };

      // Add placeholder for streaming message
      setMessages(prev => [...prev, assistantMessage]);

      for await (const textPart of result.textStream) {
        fullContent += textPart;

        // Update the last message (assistant's response) with streaming content
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: fullContent };
          return updated;
        });
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
      const errorMsg = err instanceof Error ? err.message : 'エラーが発生しました';
      setError(err instanceof Error ? err : new Error(errorMsg));

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'エラーが発生しました。APIキーが正しく設定されているか確認してください。'
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, apiKey, isLoading, messages]);

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
