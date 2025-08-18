import { useState, useCallback } from 'react';
import { createAIStreamGenerator, type StreamPart } from './streamGenerator';
import { messageConverter } from './messageConverter';
import { formatSQLCompact } from '../../utils/sqlFormatter';
import type { DBContext } from '../duckdb/dbContext';
import type { StructuredMessage, DuckDBToolInput, DuckDBToolResult } from '../../types/message';

export function useAIChat(
  dbContext: DBContext | null,
  customApiKey?: string,
  messages: StructuredMessage[] = [],
  onMessagesChange?: (messages: StructuredMessage[]) => void
) {
  const apiKey = customApiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleStop = useCallback(() => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
      setIsLoading(false);
    }
  }, [abortController]);

  // Process stream parts and update messages
  const processStreamPart = useCallback((
    part: StreamPart,
    currentMessages: StructuredMessage[],
    streamingText: string
  ): [StructuredMessage[], string] => {
    const lastMessage = currentMessages[currentMessages.length - 1];
    if (lastMessage.role !== 'assistant') {
      return [currentMessages, streamingText];
    }

    const updatedMessages = [...currentMessages];
    let newStreamingText = streamingText;

    switch (part.type) {
      case 'text-delta':
        // Accumulate streaming text
        newStreamingText = streamingText + part.textDelta;
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          streaming: newStreamingText
        };
        break;

      case 'tool-call': {
        // Commit streaming text if exists and add tool call
        const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
        
        if (streamingText) {
          existingContent.push({ type: 'text' as const, text: streamingText });
        }
        
        existingContent.push({
          type: 'tool_use' as const,
          id: part.toolCallId,
          name: part.toolName,
          input: part.args
        });

        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          content: existingContent,
          streaming: ''
        };
        newStreamingText = '';
        break;
      }

      case 'tool-result': {
        // Commit streaming text if exists and add tool result
        const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
        
        if (streamingText) {
          existingContent.push({ type: 'text' as const, text: streamingText });
        }

        // Add tool result as a separate block
        existingContent.push({
          type: 'tool_result' as const,
          id: part.toolCallId,
          name: part.toolName,
          result: part.result
        });

        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          content: existingContent,
          streaming: ''
        };
        newStreamingText = '';
        break;
      }

      case 'error': {
        // Add error message
        const errorText = part.error === 'aborted' 
          ? '⏹️ **処理が停止されました**'
          : `❌ **エラーが発生しました:** ${part.error}`;
        
        const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
        if (streamingText) {
          existingContent.push({ type: 'text' as const, text: streamingText });
        }
        existingContent.push({ type: 'text' as const, text: errorText });
        
        updatedMessages[updatedMessages.length - 1] = {
          ...lastMessage,
          content: existingContent,
          streaming: undefined
        };
        newStreamingText = '';
        break;
      }

      case 'finish':
        // Commit any remaining streaming text
        if (streamingText) {
          const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
          existingContent.push({ type: 'text' as const, text: streamingText });
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            content: existingContent,
            streaming: undefined
          };
        } else {
          // Clear streaming property
          updatedMessages[updatedMessages.length - 1] = {
            ...lastMessage,
            streaming: undefined
          };
        }
        newStreamingText = '';
        break;
    }

    return [updatedMessages, newStreamingText];
  }, []);

  // Core message sending logic using the stream generator
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || !apiKey || isLoading) return;

    const userMessage: StructuredMessage = { role: 'user', content: message.trim() };

    // Check if this is a table creation message
    if (messageConverter.hasTableCreatedMarker(message)) {
      const newMessages = [...messages, userMessage];
      onMessagesChange?.(newMessages);
      return;
    }

    // Add user message
    const newMessages = [...messages, userMessage];
    onMessagesChange?.(newMessages);

    setIsLoading(true);
    setError(null);

    // Create abort controller
    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Convert messages to CoreMessage format
      const coreMessages = messageConverter.toCoreMessages(newMessages);

      // Create the stream generator
      const generator = createAIStreamGenerator({
        messages: coreMessages,
        apiKey,
        dbContext: dbContext || undefined,
        abortSignal: controller.signal
      });

      // Initialize assistant message
      const assistantMessage: StructuredMessage = { 
        role: 'assistant', 
        content: [], 
        streaming: '' 
      };
      
      let currentMessages = [...newMessages, assistantMessage];
      let streamingText = '';
      onMessagesChange?.(currentMessages);

      // Process the stream
      for await (const part of generator) {
        [currentMessages, streamingText] = processStreamPart(part, currentMessages, streamingText);
        onMessagesChange?.(currentMessages);
      }

      // Log the conversation (for debugging)
      const assistantContent = currentMessages[currentMessages.length - 1].content;
      let fullContent = '';
      
      if (Array.isArray(assistantContent)) {
        for (const block of assistantContent) {
          if (block.type === 'text') {
            fullContent += block.text;
          } else if (block.type === 'tool_use' && block.name === 'duckdb_query') {
            const input = block.input as DuckDBToolInput;
            const formattedSQL = formatSQLCompact(input.sql);
            fullContent += `\n\n🔧 **SQL実行中:**\n\`\`\`sql\n${formattedSQL}\n\`\`\`\n`;
            
            // Add result if available
            if ('result' in block) {
              const result = (block as { result: unknown }).result as DuckDBToolResult;
              if (result?.error) {
                fullContent += `\n❌ **エラー:** ${result.error}\n\n`;
              } else if (result?.data) {
                const rowCount = Array.isArray(result.data) ? result.data.length : 1;
                fullContent += `\n✅ **結果:** (${rowCount}行)\n`;
                
                // Add table created marker if applicable
                if (result.createdTable) {
                  fullContent += `<!--TABLE_CREATED:${result.createdTable}-->\n`;
                }
              }
            }
          }
        }
      }

      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        messages: [
          { role: 'user', content: message },
          { role: 'assistant', content: assistantContent, fullContent }
        ]
      }, null, 2));

    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'エラーが発生しました';
      setError(err instanceof Error ? err : new Error(errorMsg));
      
      // This shouldn't happen as errors are handled in the generator
      // but keep as fallback
      const errorContent = `❌ **エラーが発生しました:** ${errorMsg}`;
      const currentMessages: StructuredMessage[] = [...newMessages, {
        role: 'assistant',
        content: [{ type: 'text' as const, text: errorContent }]
      }];
      onMessagesChange?.(currentMessages);
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  }, [apiKey, isLoading, messages, dbContext, processStreamPart, onMessagesChange]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const messageToSend = input.trim();
    setInput('');
    await sendMessage(messageToSend);
  }, [input, sendMessage]);

  const handleSuggestedPromptClick = useCallback((promptText: string) => {
    if (input.trim() === promptText.trim()) {
      const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
      handleSubmit(syntheticEvent);
    } else {
      setInput(promptText);
    }
  }, [input, handleSubmit]);

  const isApiKeyConfigured = Boolean(apiKey);

  return {
    input,
    handleInputChange,
    handleSubmit,
    handleStop,
    isLoading,
    error,
    isApiKeyConfigured,
    handleSuggestedPromptClick,
    sendMessage,
  };
}