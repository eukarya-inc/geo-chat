import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addMessage } from '@/store/slices/chatSlice';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateSystemPrompt } from '@/lib/ai/systemPrompt';
import type { CoreMessage } from 'ai';

interface UseAIChatOptions {
  onStream?: (chunk: string) => void;
}

export function useAIChat(model?: any, apiKey?: string) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector(state => state.chat.messages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastToolCall, setLastToolCall] = useState<any>(null);

  const sendMessage = useCallback(async (
    content: string, 
    options?: UseAIChatOptions
  ) => {
    setIsLoading(true);
    setError(null);

    try {
      // Add user message
      dispatch(addMessage({
        role: 'user',
        content
      }));

      // For testing, use provided model or create real one
      const aiModel = model || (() => {
        const anthropic = createAnthropic({
          apiKey: apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY,
          headers: {
            'anthropic-dangerous-direct-browser-access': 'true',
          },
        });
        return anthropic('claude-3-5-sonnet-20241022');
      })();

      // Convert our messages to CoreMessage format
      const coreMessages: CoreMessage[] = messages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

      // Add the new message
      coreMessages.push({ role: 'user', content });

      // Stream the response
      const result = await streamText({
        model: aiModel,
        messages: coreMessages,
        system: generateSystemPrompt(),
        onChunk: ({ chunk }) => {
          if (options?.onStream && chunk.type === 'text-delta') {
            options.onStream(chunk.textDelta);
          }
        }
      });

      // Process the response
      let assistantMessage = '';
      let toolCall = null;

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          assistantMessage += part.textDelta;
        } else if (part.type === 'tool-call') {
          toolCall = {
            name: part.toolName,
            args: part.args
          };
          setLastToolCall(toolCall);
        }
      }

      // Add assistant message
      dispatch(addMessage({
        role: 'assistant',
        content: assistantMessage || 'How can I help with your GIS analysis?'
      }));

    } catch (err) {
      setError(err as Error);
      dispatch(addMessage({
        role: 'assistant',
        content: 'I encountered an error processing your request.'
      }));
    } finally {
      setIsLoading(false);
    }
  }, [messages, dispatch, model, apiKey]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    lastToolCall
  };
}
