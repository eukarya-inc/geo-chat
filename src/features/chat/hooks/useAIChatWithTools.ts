import { useState, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store/hooks';
import { addMessage } from '@/store/slices/chatSlice';
import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { generateSystemPrompt } from '@/lib/ai/systemPrompt';
import { getDatasetContext } from '@/lib/ai/utils/datasetContext';
import { getAITools, type ToolContext } from '@/lib/ai/tools';
import { useDuckDB } from '@/hooks/useDuckDB';
import type { CoreMessage } from 'ai';

interface UseAIChatOptions {
  onStream?: (chunk: string) => void;
  onToolCall?: (toolName: string, args: any, result: any) => void;
}

export function useAIChatWithTools(model?: any, apiKey?: string) {
  const dispatch = useAppDispatch();
  const messages = useAppSelector(state => state.chat.messages);
  const datasets = useAppSelector(state => state.data.datasets);
  const activeDatasetId = useAppSelector(state => state.data.activeDatasetId);
  const { executeQuery, isInitialized: isDuckDBReady } = useDuckDB();
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [lastToolCall, setLastToolCall] = useState<any>(null);

  // Create tool context
  const createToolContext = useCallback((): ToolContext => {
    return {
      duckdb: {
        executeQuery,
        getTableNames: async () => {
          try {
            const result = await executeQuery("SELECT table_name FROM information_schema.tables WHERE table_schema = 'main'");
            return result.map(row => row.table_name);
          } catch (error) {
            console.error('Failed to get table names:', error);
            return [];
          }
        },
        getTableSchema: async (tableName: string) => {
          try {
            return await executeQuery(`DESCRIBE ${tableName}`);
          } catch (error) {
            console.error(`Failed to describe table ${tableName}:`, error);
            return [];
          }
        },
      },
      state: {
        datasets,
        activeDatasetId,
      },
    };
  }, [executeQuery, datasets, activeDatasetId]);

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

      // Check if DuckDB is ready
      if (!isDuckDBReady) {
        dispatch(addMessage({
          role: 'assistant',
          content: 'The database is still initializing. Please wait a moment and try again.',
        }));
        setIsLoading(false);
        return;
      }

      // Get API key from localStorage if not provided
      const finalApiKey = apiKey || localStorage.getItem('anthropic_api_key');
      if (!finalApiKey && !model) {
        throw new Error('No API key found. Please configure your Anthropic API key.');
      }

      // For testing, use provided model or create real one
      const aiModel = model || (() => {
        const anthropic = createAnthropic({
          apiKey: finalApiKey!,
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

      // Get tools with context
      const toolContext = createToolContext();
      const tools = getAITools(toolContext);

      // Generate dataset context for system prompt
      const datasetContext = getDatasetContext(datasets);

      // Stream the response with tools
      const result = await streamText({
        model: aiModel,
        messages: coreMessages,
        system: generateSystemPrompt(datasetContext),
        tools,
        toolChoice: 'auto',
        onChunk: ({ chunk }) => {
          if (options?.onStream && chunk.type === 'text-delta') {
            options.onStream(chunk.textDelta);
          }
        }
      });

      // Process the response
      let assistantMessage = '';
      const toolCalls: any[] = [];

      for await (const part of result.fullStream) {
        if (part.type === 'text-delta') {
          assistantMessage += part.textDelta;
        } else if (part.type === 'tool-call') {
          // Track tool calls
          toolCalls.push({
            name: part.toolName,
            args: part.args,
            result: null,
          });
          setLastToolCall(toolCalls[toolCalls.length - 1]);
        }
      }

      // Get the final text and tool results
      const finalText = await result.text;
      const toolResults = await result.toolResults;
      
      // Update tool calls with results
      if (toolResults && toolResults.length > 0) {
        toolResults.forEach((result, index) => {
          if (toolCalls[index]) {
            toolCalls[index].result = result;
            if (options?.onToolCall) {
              options.onToolCall(toolCalls[index].name, toolCalls[index].args, result);
            }
          }
        });
      }

      // Use the final text from the AI response
      dispatch(addMessage({
        role: 'assistant',
        content: finalText || assistantMessage || 'I completed the analysis.',
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      }));

    } catch (err) {
      setError(err as Error);
      dispatch(addMessage({
        role: 'assistant',
        content: `I encountered an error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      }));
    } finally {
      setIsLoading(false);
    }
  }, [messages, dispatch, model, apiKey, createToolContext, isDuckDBReady]);

  return {
    messages,
    isLoading,
    error,
    sendMessage,
    lastToolCall
  };
}