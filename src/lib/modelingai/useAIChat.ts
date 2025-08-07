import { useState, useCallback } from 'react';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, streamText } from 'ai';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../duckdb/dbStateManager';
import { completionTool } from './tools/completionTool';
import { formatSQLCompact } from '../../utils/sqlFormatter';
import type { StructuredMessage, DuckDBToolInput, DuckDBToolResult } from '../../types/message';

// Re-export CoreMessage type for components to use
export type { CoreMessage };

export function useAIChat(
  db?: AsyncDuckDB | null,
  dbStateManager?: DBStateManager | null,
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

  const handleTextDelta = useCallback((textDelta: string, streamingText: string, baseMessages: StructuredMessage[]): [string, StructuredMessage[]] => {
    const newStreamingText = streamingText + textDelta;
    // Update the last message's streaming property
    const updatedMessages = [...baseMessages];
    updatedMessages[updatedMessages.length - 1] = {
      ...updatedMessages[updatedMessages.length - 1],
      streaming: newStreamingText
    };
    onMessagesChange?.(updatedMessages);
    return [newStreamingText, updatedMessages];
  }, [onMessagesChange]);

  const handleToolCall = useCallback((part: { toolCallId?: string; toolName: string; args: Record<string, unknown> }, currentStreamingText: string, baseMessages: StructuredMessage[]): [string, StructuredMessage[]] => {
    // If there's streaming text, commit it as a text block first
    const updatedMessages = [...baseMessages];
    const lastMessage = updatedMessages[updatedMessages.length - 1];

    if (lastMessage.role === 'assistant') {
      const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];

      // Add streaming text as a text block if it exists
      if (currentStreamingText) {
        existingContent.push({ type: 'text' as const, text: currentStreamingText });
      }

      // Add tool call as structured content
      existingContent.push({
        type: 'tool_use' as const,
        id: part.toolCallId || `tool_${Date.now()}`,
        name: part.toolName,
        input: part.args
      });

      updatedMessages[updatedMessages.length - 1] = {
        ...lastMessage,
        content: existingContent,
        streaming: ''
      };
    }

    onMessagesChange?.(updatedMessages);
    return ['', updatedMessages]; // Return empty string as streaming text is now committed
  }, [onMessagesChange]);

  const handleToolResult = useCallback((part: { toolCallId?: string; toolName: string; result: Record<string, unknown> }, currentStreamingText: string, baseMessages: StructuredMessage[]): [string, StructuredMessage[]] => {
    // If there's streaming text, commit it as a text block first
    const updatedMessages = [...baseMessages];
    const lastMessage = updatedMessages[updatedMessages.length - 1];

    // Add tool result as structured content
    if (lastMessage.role === 'assistant') {
      const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];

      // Add streaming text as a text block if it exists
      if (currentStreamingText) {
        existingContent.push({ type: 'text' as const, text: currentStreamingText });
      }

      // Add tool result
      existingContent.push({
        type: 'tool_result' as const,
        id: part.toolCallId || `tool_result_${Date.now()}`,
        name: part.toolName,
        result: part.result
      });

      updatedMessages[updatedMessages.length - 1] = {
        ...lastMessage,
        content: existingContent,
        streaming: ''
      };
    }

    onMessagesChange?.(updatedMessages);
    return ['', updatedMessages]; // Return empty string as content is now structured
  }, [onMessagesChange]);

  // Core message sending logic
  const sendMessage = useCallback(async (message: string) => {
    if (!message.trim() || !apiKey || isLoading) return;

    const userMessage: StructuredMessage = { role: 'user', content: message.trim() };

    // Check if this is a table creation message (contains TABLE_CREATED marker)
    const isTableCreationMessage = message.includes('<!--TABLE_CREATED:');

    // Add user message (keep HTML comments for rendering)
    const newMessages = [...messages, userMessage];
    onMessagesChange?.(newMessages);

    // If it's a table creation message, don't send to AI
    if (isTableCreationMessage) {
      return;
    }

    setIsLoading(true);
    setError(null);

    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);

    try {
      const anthropicClient = createAnthropic({
        apiKey: apiKey,
        headers: {
          'anthropic-dangerous-direct-browser-access': 'true',
        },
      });

      // Convert structured messages to CoreMessage format for AI
      const convertToCoreMessages = (msgs: StructuredMessage[]): CoreMessage[] => {
        return msgs
          .map(msg => {
            let content = '';
            if (typeof msg.content === 'string') {
              content = msg.content.replace(/<!--[^>]*-->/g, '').trim();
            } else if (Array.isArray(msg.content)) {
              // Convert structured content to text for AI
              content = msg.content.map(block => {
                if (block.type === 'text') {
                  return block.text;
                }
                return '';
              }).join('');
            }
            return { role: msg.role, content } as CoreMessage;
          })
          .filter(msg => {
            // Filter out messages that are empty after cleaning
            if (typeof msg.content === 'string') {
              return msg.content.length > 0;
            }
            return true;
          });
      };

      // Convert messages for AI (keep original messages for rendering)
      const allMessagesForAI = convertToCoreMessages([...messages, userMessage]);

      const result = streamText({
        model: anthropicClient('claude-3-5-sonnet-20241022'),
        system: generateSystemPrompt(),
        messages: allMessagesForAI,
        tools: {
          ...(db && {
            duckdb_query: createDuckDBTool(db, dbStateManager || undefined, apiKey),
          }),
          completion: completionTool,
        },
        maxSteps: 50,
        maxTokens: 4000,
        maxRetries: 30,
        abortSignal: controller.signal,
      });

      let currentStreamingText = '';
      const assistantMessage: StructuredMessage = { role: 'assistant', content: [], streaming: '' };

      // Add placeholder for streaming message
      let currentMessages = [...newMessages, assistantMessage];
      onMessagesChange?.(currentMessages);

      // Collect response content blocks for logging
      // const logContent: StructuredContent[] = [];

      // Use fullStream to handle both text and tool calls
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            [currentStreamingText, currentMessages] = handleTextDelta(part.textDelta, currentStreamingText, currentMessages);
            break;

          case 'tool-call':
            // Tool call will commit any streaming text and add itself as structured content
            [currentStreamingText, currentMessages] = handleToolCall(part, currentStreamingText, currentMessages);
            break;

          case 'tool-result':
            // Tool result will commit any streaming text and add itself as structured content
            [currentStreamingText, currentMessages] = handleToolResult(part, currentStreamingText, currentMessages);
            break;
        }
      }

      // Commit any remaining streaming text as a final text block
      if (currentStreamingText) {
        const lastMessage = currentMessages[currentMessages.length - 1];
        if (lastMessage.role === 'assistant') {
          const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
          existingContent.push({ type: 'text', text: currentStreamingText });
          const updatedMessage = {
            ...lastMessage,
            content: existingContent,
            streaming: undefined // Remove streaming property when done
          };
          currentMessages = [...newMessages, updatedMessage];
          onMessagesChange?.(currentMessages);
        }
      } else {
        // Even if no remaining streaming text, we need to clear the streaming property
        const lastMessage = currentMessages[currentMessages.length - 1];
        if (lastMessage.role === 'assistant' && lastMessage.streaming !== undefined) {
          const updatedMessage = {
            ...lastMessage,
            streaming: undefined
          };
          currentMessages = [...newMessages, updatedMessage];
          onMessagesChange?.(currentMessages);
        }
      }

      // Get the final structured content for logging
      const assistantContent = currentMessages[currentMessages.length - 1].content;

      // Build full content string for logging (with HTML comments)
      let fullContent = '';
      if (Array.isArray(assistantContent)) {
        for (const block of assistantContent) {
          if (block.type === 'text') {
            fullContent += block.text;
          } else if (block.type === 'tool_use' && block.name === 'duckdb_query') {
            const input = block.input as DuckDBToolInput;
            const formattedSQL = formatSQLCompact(input.sql);
            fullContent += `\n\n🔧 **SQL実行中:**\n\`\`\`sql\n${formattedSQL}\n\`\`\`\n`;
          } else if (block.type === 'tool_result' && block.name === 'duckdb_query') {
            const result = block.result as DuckDBToolResult;
            if (result?.error) {
              fullContent += `\n❌ **エラー:** ${result.error}\n\n`;
            } else if (result?.data) {
              const rowCount = Array.isArray(result.data) ? result.data.length : 1;
              fullContent += `\n✅ **結果:** (${rowCount}行)\n`;
              // Add table created marker if applicable
              if (result.sql) {
                const upperSql = String(result.sql).toUpperCase();
                if (upperSql.includes('CREATE TABLE')) {
                  const tableNameMatch = String(result.sql).match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.)?(\w+)/i);
                  if (tableNameMatch) {
                    fullContent += `<!--TABLE_CREATED:${tableNameMatch[1]}-->\n`;
                  }
                }
              }
            }
          }
        }
      }

      // Log conversation in Claude API response format
      console.log(JSON.stringify({
        timestamp: new Date().toISOString(),
        messages: [
          {
            role: 'user',
            content: message
          },
          {
            role: 'assistant',
            content: assistantContent,  // Structured response blocks
            fullContent: fullContent  // Raw content with HTML comments
          }
        ]
      }, null, 2));

    } catch (err) {
      // Handle abort error specifically
      if (err instanceof Error && err.name === 'AbortError') {
        const currentMessages: StructuredMessage[] = [...newMessages, {
          role: 'assistant',
          content: [{ type: 'text' as const, text: '⏹️ **処理が停止されました**' }]
        }];
        onMessagesChange?.(currentMessages);
        return;
      }

      const errorMsg = err instanceof Error ? String(err.message) : 'エラーが発生しました';
      setError(err instanceof Error ? err : new Error(errorMsg));

      // Add error as structured content
      const errorContent = errorMsg.includes('\n')
        ? `❌ **エラーが発生しました:**\n\`\`\`\n${errorMsg}\n\n\`\`\``
        : `❌ **エラーが発生しました:** ${errorMsg}\n\n`;

      const currentMessages: StructuredMessage[] = [...newMessages, {
        role: 'assistant',
        content: [{ type: 'text' as const, text: errorContent }]
      }];
      onMessagesChange?.(currentMessages);
    } finally {
      setIsLoading(false);
      setAbortController(null);
    }
  }, [apiKey, isLoading, messages, db, dbStateManager, handleTextDelta, handleToolCall, handleToolResult, onMessagesChange]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const messageToSend = input.trim();
    setInput('');
    await sendMessage(messageToSend);
  }, [input, sendMessage]);

  const handleSuggestedPromptClick = useCallback((promptText: string) => {
    if (input.trim() === promptText.trim()) {
      // If the suggestion matches current input, submit directly
      const syntheticEvent = {
        preventDefault: () => {},
      } as React.FormEvent;
      handleSubmit(syntheticEvent);
    } else {
      // Otherwise, just set the input
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
