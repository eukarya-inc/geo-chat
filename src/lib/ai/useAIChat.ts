import { useState, useCallback } from 'react';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, streamText } from 'ai';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import { completionTool, type SuggestedPrompt } from './tools/completionTool';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

export function useAIChat(db?: AsyncDuckDB | null) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<SuggestedPrompt[]>([]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const handleTextDelta = useCallback((textDelta: string, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>) => {
    const newContent = fullContent + textDelta;
    setMessages(prev => {
      const updated = [...prev];
      updated[updated.length - 1] = { role: 'assistant', content: newContent };
      return updated;
    });
    return newContent;
  }, []);

  const handleToolCall = useCallback((part: any, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>, setSuggestedPrompts: React.Dispatch<React.SetStateAction<SuggestedPrompt[]>>) => {
    const args = part.args as Record<string, unknown>;
    let newContent = fullContent;
    
    if (part.toolName === 'completion') {
      // Handle completion tool call
      if (args?.suggestedPrompts) {
        setSuggestedPrompts(args.suggestedPrompts as SuggestedPrompt[]);
      }
      // Don't add completion message here to avoid duplicates
    } else {
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

  const handleToolResult = useCallback((part: any, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>) => {
    let newContent = fullContent;
    
    if (part.toolName !== 'completion') {
      const result = part.result as any;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **エラー:** ${result.error}\n`;
      } else if (result?.data) {
        // Truncate long results
        const data = Array.isArray(result.data) ? result.data : [result.data];
        const dataStr = JSON.stringify(data, null, 2);
        
        if (dataStr.length > 500) {
          const truncated = dataStr.substring(0, 500) + '...';
          const rowCount = Array.isArray(result.data) ? result.data.length : 1;
          resultText = `\n✅ **結果:** (${rowCount}行)\n\`\`\`json\n${truncated}\n\`\`\`\n`;
        } else {
          resultText = `\n✅ **結果:**\n\`\`\`json\n${dataStr}\n\`\`\`\n`;
        }
      }
      
      newContent += resultText;
      setMessages(prev => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: 'assistant', content: newContent };
        return updated;
      });
    }
    return newContent;
  }, []);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();

    if (!input.trim() || !apiKey || isLoading) return;

    const userMessage: CoreMessage = { role: 'user', content: input.trim() };
    // const currentInput = input.trim();

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setSuggestedPrompts([]);
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
        tools: { 
          ...(db && { duckdb_query: createDuckDBTool(db) }),
          completion: completionTool
        },
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
            fullContent = handleTextDelta(part.textDelta, fullContent, setMessages);
            break;

          case 'tool-call':
            fullContent = handleToolCall(part, fullContent, setMessages, setSuggestedPrompts);
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
    isLoading,
    error,
    isApiKeyConfigured,
    suggestedPrompts,
    handleSuggestedPromptClick,
  };
}
