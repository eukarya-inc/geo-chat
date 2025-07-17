import { useState, useCallback } from 'react';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, streamText } from 'ai';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../duckdb/dbStateManager';
import { completionTool } from './tools/completionTool';

export function useAIChat(db?: AsyncDuckDB | null, dbStateManager?: DBStateManager | null, customApiKey?: string) {
  const apiKey = customApiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;
  const [messages, setMessages] = useState<CoreMessage[]>([]);
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

  const handleTextDelta = useCallback((textDelta: string, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>) => {
    const newContent = fullContent + textDelta;
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', content: newContent };
      return updated;
    });
    return newContent;
  }, []);

  const handleToolCall = useCallback((part: { toolName: string; args: Record<string, unknown> }, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>) => {
    const args = part.args;
    let newContent = fullContent;

    if (part.toolName === 'duckdb_query') {
      // Handle DuckDB tool call
      const toolCallText = `\n\n🔧 **SQL実行中:** \`${(args?.sql as string) || 'クエリ実行中'}\`\n`;
      newContent += toolCallText;
    }

    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', content: newContent };
      return updated;
    });
    return newContent;
  }, []);

  const handleToolResult = useCallback((part: { toolName: string; result: Record<string, unknown> }, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>) => {
    let newContent = fullContent;
    if (part.toolName === 'duckdb_query') {
      // Handle DuckDB query results
      const result = part.result;
      let resultText = '';

      if (result?.error) {
        resultText = `\n❌ **エラー:** ${result.error}\n`;
      } else if (result?.data) {
        const data = Array.isArray(result.data) ? result.data : [result.data];
        const rowCount = Array.isArray(result.data) ? result.data.length : 1;

        // Smart truncation based on data size and type
        if (rowCount > 100) {
          // For very large datasets, show summary + first few rows + last few rows
          const firstRows = data.slice(0, 3);
          const lastRows = data.slice(-2);
          const sampleData = [...firstRows, { "...": `${rowCount - 5} more rows` }, ...lastRows];
          const dataStr = JSON.stringify(sampleData, null, 2);
          resultText = `\n<!--SQL_RESULT_START-->\n✅ **結果:** (${rowCount}行 - 抜粋表示)\n<!--SQL_RESULT_CONTENT_START-->\n\`\`\`json\n${dataStr}\n\`\`\`\n\n📊 **データサマリー:** 全${rowCount}行のうち最初の3行と最後の2行を表示。完全なデータを確認するには、LIMITクエリまたは集計クエリをお試しください。\n<!--SQL_RESULT_CONTENT_END-->\n<!--SQL_RESULT_END-->\n`;
        } else if (rowCount > 20) {
          // For medium datasets, show first 10 and indicate there are more
          const firstRows = data.slice(0, 10);
          const dataStr = JSON.stringify(firstRows, null, 2);
          resultText = `\n<!--SQL_RESULT_START-->\n✅ **結果:** (${rowCount}行 - 最初の10行を表示)\n<!--SQL_RESULT_CONTENT_START-->\n\`\`\`json\n${dataStr}\n\`\`\`\n\n📋 残り${rowCount - 10}行があります。すべてを確認するには、データの絞り込みまたは集計をお試しください。\n<!--SQL_RESULT_CONTENT_END-->\n<!--SQL_RESULT_END-->\n`;
        } else {
          // For small datasets, show all data but with size limit
          const dataStr = JSON.stringify(data, null, 2);

          if (dataStr.length > 8000) {
            // Even small datasets can have very wide rows - truncate but show more than before
            const truncated = dataStr.substring(0, 8000) + '...';
            resultText = `\n<!--SQL_RESULT_START-->\n✅ **結果:** (${rowCount}行 - 表示が切り詰められています)\n<!--SQL_RESULT_CONTENT_START-->\n\`\`\`json\n${truncated}\n\`\`\`\n\n⚠️ データが長すぎるため一部が省略されました。特定の列のみを選択するか、データを集計してみてください。\n<!--SQL_RESULT_CONTENT_END-->\n<!--SQL_RESULT_END-->\n`;
          } else {
            resultText = `\n<!--SQL_RESULT_START-->\n✅ **結果:** (${rowCount}行)\n<!--SQL_RESULT_CONTENT_START-->\n\`\`\`json\n${dataStr}\n\`\`\`\n<!--SQL_RESULT_CONTENT_END-->\n<!--SQL_RESULT_END-->\n`;
          }
        }

        // Add column information if available
        if ('columns' in result && Array.isArray(result.columns) && 'columnCount' in result) {
          const columns = result.columns as string[];
          const columnCount = result.columnCount as number;
          resultText += `\n📋 **カラム情報:** ${columnCount}列 (${columns.slice(0, 5).join(', ')}${columns.length > 5 ? ', ...' : ''})\n`;
        }

        // Add suggestions for working with the data
        if ('suggestions' in result && Array.isArray(result.suggestions)) {
          const suggestions = result.suggestions as string[];
          if (suggestions.length > 0) {
            resultText += `\n💡 **提案:**\n${suggestions.map((s: string) => `• ${s}`).join('\n')}\n`;
          }
        }
      }

      newContent += resultText;
    }

    setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: newContent };
        return updated;
      });
    return newContent;
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

      // Remove HTML comment markers before sending to AI
      const cleanMessages = (msgs: CoreMessage[]): CoreMessage[] => {
        return msgs.map(msg => ({
          ...msg,
          content: typeof msg.content === 'string' 
            ? msg.content.replace(/<!--[^>]*-->/g, '').trim()
            : msg.content
        }) as CoreMessage);
      };
      
      const allMessages = cleanMessages([...messages, userMessage]);

      const result = streamText({
        model: anthropicClient('claude-3-5-sonnet-20241022'),
        system: generateSystemPrompt(),
        messages: allMessages,
        tools: {
          ...(db && {
            duckdb_query: createDuckDBTool(db, dbStateManager || undefined),
          }),
          completion: completionTool,
        },
        maxSteps: 50,
        maxTokens: 4000,
        maxRetries: 30,
        abortSignal: controller.signal,
      });

      let fullContent = '';
      const assistantMessage: CoreMessage = { role: 'assistant', content: '' };

      // Add placeholder for streaming message
      setMessages(prev => [...prev, assistantMessage]);

      // Use fullStream to handle both text and tool calls
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'text-delta':
            fullContent = handleTextDelta(part.textDelta, fullContent, setMessages);
            break;

          case 'tool-call':
            fullContent = handleToolCall(part, fullContent, setMessages);
            break;

          case 'tool-result':
            fullContent = handleToolResult(part, fullContent, setMessages);
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
      // Handle abort error specifically
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          if (updated.length > 0 && updated[updated.length - 1].role === 'assistant') {
            updated[updated.length - 1] = {
              role: 'assistant',
              content: updated[updated.length - 1].content + '\n\n⏹️ **処理が停止されました**'
            };
          }
          return updated;
        });
        return;
      }

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
      setAbortController(null);
    }
  }, [input, apiKey, isLoading, messages, db, dbStateManager, handleTextDelta, handleToolCall]);

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
    messages,
    input,
    handleInputChange,
    handleSubmit,
    handleStop,
    isLoading,
    error,
    isApiKeyConfigured,
    handleSuggestedPromptClick,
  };
}
