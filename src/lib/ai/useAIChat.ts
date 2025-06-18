import { useState, useCallback } from 'react';
import { createAnthropic } from '@ai-sdk/anthropic';
import { CoreMessage, streamText } from 'ai';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import { completionTool, type SuggestedPrompt } from './tools/completionTool';
import { createVegaLiteTool } from './tools/vegaLiteTool';
import { createMapStyleTool } from './tools/mapStyleTool';
import { createListLayersTool } from './tools/listLayersTool';
import { createDebugLayersTool } from './tools/debugLayersTool';
import { createGeocodingTools } from './tools/geocodingTool';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { MapStyleManager } from '../../utils/mapStyleManager';
import type { DBStateManager } from '../duckdb/dbStateManager';

export function useAIChat(db?: AsyncDuckDB | null, dbStateManager?: DBStateManager | null, mapStyleManager?: MapStyleManager | null, customApiKey?: string) {
  const apiKey = customApiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;
  const [messages, setMessages] = useState<CoreMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [suggestedPrompts, setSuggestedPrompts] = useState<SuggestedPrompt[]>([]);
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

  const handleToolCall = useCallback((part: { toolName: string; args: Record<string, unknown> }, fullContent: string, setMessages: React.Dispatch<React.SetStateAction<CoreMessage[]>>, setSuggestedPrompts: React.Dispatch<React.SetStateAction<SuggestedPrompt[]>>) => {
    const args = part.args;
    let newContent = fullContent;
    
    if (part.toolName === 'completion') {
      // Handle completion tool call
      if (args?.suggestedPrompts) {
        setSuggestedPrompts(args.suggestedPrompts as SuggestedPrompt[]);
      }
      // Don't add completion message here to avoid duplicates
    } else if (part.toolName === 'duckdb_query') {
      // Handle DuckDB tool call
      const toolCallText = `\n\n🔧 **SQL実行中:** \`${(args?.sql as string) || 'クエリ実行中'}\`\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'vega_lite_chart') {
      // Handle VegaLite tool call
      const toolCallText = `\n\n📊 **チャート作成中:** ${(args?.plotType as string) || 'プロット'}チャートを生成中...\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'update_map_style') {
      // Handle map style tool call
      const toolCallText = `\n\n🎨 **マップスタイル更新中:** ${(args?.description as string) || 'スタイルを変更中'}\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'list_map_layers') {
      // Handle list layers tool call
      const toolCallText = `\n\n🗺️ **レイヤー情報取得中...**\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'debug_layers') {
      // Handle debug layers tool call
      const toolCallText = `\n\n🔍 **レイヤーデバッグ情報取得中...**\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'debug_database') {
      // Handle debug database tool call
      const toolCallText = `\n\n🔧 **データベースデバッグ中:** ${(args?.action as string) || 'デバッグ実行中'}\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'geocode_address') {
      // Handle single address geocoding
      const toolCallText = `\n\n🌍 **住所をジオコーディング中:** ${(args?.address as string) || 'アドレス処理中'}\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'geocode_multiple_addresses') {
      // Handle batch geocoding
      const count = (args?.addresses as string[])?.length || 0;
      const toolCallText = `\n\n🌍 **複数住所をジオコーディング中:** ${count}件のアドレスを処理中...\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'analyze_table_for_geocoding') {
      // Handle table analysis for geocoding
      const toolCallText = `\n\n🔍 **テーブル分析中:** ${(args?.tableName as string) || 'テーブル'}のジオコーディング可能な列を検索中...\n`;
      newContent += toolCallText;
    } else if (part.toolName === 'add_geocoded_columns_to_table') {
      // Handle adding geocoded columns
      const toolCallText = `\n\n🏗️ **テーブル拡張中:** ${(args?.tableName as string) || 'テーブル'}にジオコーディング列を追加中...\n`;
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
    
    if (part.toolName === 'vega_lite_chart') {
      // Handle VegaLite chart results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **チャート作成エラー:** ${result.error}\n`;
      } else if (result?.vegaSpec) {
        // Add the chart using the special format that MessageRenderer looks for
        const vegaSpecJson = JSON.stringify(result.vegaSpec, null, 2);
        resultText = `\n📊 **チャート完成:**\n\n<!--VEGA_SPEC_START-->\n${vegaSpecJson}\n<!--VEGA_SPEC_END-->\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'duckdb_query') {
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
          resultText = `\n✅ **結果:** (${rowCount}行 - 抜粋表示)\n\`\`\`json\n${dataStr}\n\`\`\`\n\n📊 **データサマリー:** 全${rowCount}行のうち最初の3行と最後の2行を表示。完全なデータを確認するには、LIMITクエリまたは集計クエリをお試しください。\n`;
        } else if (rowCount > 20) {
          // For medium datasets, show first 10 and indicate there are more
          const firstRows = data.slice(0, 10);
          const dataStr = JSON.stringify(firstRows, null, 2);
          resultText = `\n✅ **結果:** (${rowCount}行 - 最初の10行を表示)\n\`\`\`json\n${dataStr}\n\`\`\`\n\n📋 残り${rowCount - 10}行があります。すべてを確認するには、データの絞り込みまたは集計をお試しください。\n`;
        } else {
          // For small datasets, show all data but with size limit
          const dataStr = JSON.stringify(data, null, 2);
          
          if (dataStr.length > 8000) {
            // Even small datasets can have very wide rows - truncate but show more than before
            const truncated = dataStr.substring(0, 8000) + '...';
            resultText = `\n✅ **結果:** (${rowCount}行 - 表示が切り詰められています)\n\`\`\`json\n${truncated}\n\`\`\`\n\n⚠️ データが長すぎるため一部が省略されました。特定の列のみを選択するか、データを集計してみてください。\n`;
          } else {
            resultText = `\n✅ **結果:** (${rowCount}行)\n\`\`\`json\n${dataStr}\n\`\`\`\n`;
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
    } else if (part.toolName === 'update_map_style') {
      // Handle map style update results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **スタイル更新エラー:** ${result.error}\n`;
      } else if (result?.success) {
        resultText = `\n✅ **スタイル更新完了:** ${result.message}\n`;
      } else {
        resultText = `\n⚠️ **スタイル更新:** 結果が不明です\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'list_map_layers') {
      // Handle list layers results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **レイヤー取得エラー:** ${result.error}\n`;
      } else if (result?.success) {
        resultText = `\n✅ **利用可能なレイヤー:** ${result.message}\n`;
        if (result.layers && Array.isArray(result.layers)) {
          resultText += `\`\`\`\n${result.layers.join('\n')}\n\`\`\`\n`;
        }
      } else {
        resultText = `\n⚠️ **レイヤー情報:** 結果が不明です\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'debug_layers') {
      // Handle debug layers results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **デバッグエラー:** ${result.error}\n`;
      } else if (result?.success) {
        resultText = `\n🔍 **デバッグ情報:** ${result.message}\n`;
        if (result.debug) {
          resultText += `\`\`\`json\n${JSON.stringify(result.debug, null, 2)}\n\`\`\`\n`;
        }
      } else {
        resultText = `\n⚠️ **デバッグ情報:** 結果が不明です\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'debug_database') {
      // Handle debug database results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **デバッグエラー:** ${result.error}\n`;
      } else if (result?.success) {
        resultText = `\n🔧 **デバッグ結果:** ${result.message || 'デバッグ完了'}\n`;
        if (result.showTables || result.tests || result.data) {
          resultText += `\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\`\n`;
        }
      } else {
        resultText = `\n⚠️ **デバッグ情報:** 結果が不明です\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'geocode_address') {
      // Handle single address geocoding results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **ジオコーディングエラー:** ${result.error}\n`;
      } else if (result?.success && result?.data) {
        const data = result.data as { latitude: number; longitude: number; display_name: string };
        resultText = `\n✅ **ジオコーディング完了:**\n📍 座標: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}\n📍 住所: ${data.display_name}\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'geocode_multiple_addresses') {
      // Handle batch geocoding results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **バッチジオコーディングエラー:** ${result.error}\n`;
      } else if (result?.success && result?.data) {
        const data = result.data as { results: unknown[]; errors: unknown[] };
        resultText = `\n✅ **バッチジオコーディング完了:** ${data.results.length}件成功, ${data.errors.length}件失敗\n`;
      }
      
      newContent += resultText;
    } else if (part.toolName === 'analyze_table_for_geocoding') {
      // Handle table analysis results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **テーブル分析エラー:** ${result.error}\n`;
      } else if (result?.success && result?.data) {
        const data = result.data as { tableName: string; addressColumns: unknown[]; recommendations: string[] };
        resultText = `\n✅ **テーブル分析完了:** "${data.tableName}"\n`;
        resultText += `📋 住所列候補: ${(data.addressColumns as unknown[]).length}件\n`;
        if (data.recommendations.length > 0) {
          resultText += `💡 **推奨事項:**\n${data.recommendations.map(r => `• ${r}`).join('\n')}\n`;
        }
      }
      
      newContent += resultText;
    } else if (part.toolName === 'add_geocoded_columns_to_table') {
      // Handle table enhancement results
      const result = part.result;
      let resultText = '';
      
      if (result?.error) {
        resultText = `\n❌ **テーブル拡張エラー:** ${result.error}\n`;
      } else if (result?.success && result?.data) {
        const data = result.data as { total: number; successful: number; failed: number };
        resultText = `\n✅ **テーブル拡張完了:**\n📊 ${data.total}件中 ${data.successful}件成功, ${data.failed}件失敗\n`;
        resultText += `✨ 新しい列が追加されました: geocoded_lat, geocoded_lng, geocoded_display_name\n`;
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
    setSuggestedPrompts([]);
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

      const allMessages = [...messages, userMessage];

      const result = streamText({
        model: anthropicClient('claude-3-5-sonnet-20241022'),
        system: generateSystemPrompt(),
        messages: allMessages,
        tools: { 
          ...(db && { 
            duckdb_query: createDuckDBTool(db, dbStateManager || undefined),
            vega_lite_chart: createVegaLiteTool(db, dbStateManager || undefined),
            ...createGeocodingTools(db),
          }),
          ...(mapStyleManager && {
            update_map_style: createMapStyleTool(mapStyleManager),
            list_map_layers: createListLayersTool(mapStyleManager),
            debug_layers: createDebugLayersTool(mapStyleManager)
          }),
          completion: completionTool
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
  }, [input, apiKey, isLoading, messages, db, dbStateManager, mapStyleManager, handleTextDelta, handleToolCall, handleToolResult]);

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
    suggestedPrompts,
    handleSuggestedPromptClick,
  };
}
