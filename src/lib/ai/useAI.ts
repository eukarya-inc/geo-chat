import { useSyncExternalStore, useCallback, useState, useEffect } from 'react';
import { aiStore } from './AIStore';
import type { StructuredMessage } from '../../types/message';
import type { DBContext } from '../duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/modelingRemoteAtoms';

interface UseAIOptions {
  chatId: string;
  schema?: string | null;
  dbContext?: DBContext | null;
  apiKey?: string;
  selectedTable?: string | null;
  onMessagesChange?: (messages: StructuredMessage[]) => void;
  onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
  getCurrentChatState?: () => ChatState | null;
}

export function useAI({
  chatId,
  schema,
  dbContext,
  apiKey,
  selectedTable,
  onMessagesChange,
  onChartUpdate,
  getCurrentChatState
}: UseAIOptions) {
  const [input, setInput] = useState('');
  const resolvedApiKey = apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;

  const session = useSyncExternalStore(
    aiStore.subscribe.bind(aiStore),
    () => aiStore.getChatSession(chatId),
    () => aiStore.getChatSession(chatId)
  );

  const isAnyLoading = useSyncExternalStore(
    aiStore.subscribe.bind(aiStore),
    () => aiStore.isAnyLoading(),
    () => aiStore.isAnyLoading()
  );

  useEffect(() => {
    aiStore.getOrCreateSession(chatId, schema || null);
  }, [chatId, schema]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const sendMessage = useCallback(async (message: string) => {
    if (!resolvedApiKey) return;
    
    await aiStore.sendMessage(chatId, message, {
      apiKey: resolvedApiKey,
      dbContext: dbContext || undefined,
      schema,
      selectedTable,
      onMessagesChange,
      onChartUpdate,
      getCurrentChatState
    });
  }, [chatId, resolvedApiKey, dbContext, schema, selectedTable, onMessagesChange, onChartUpdate, getCurrentChatState]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const messageToSend = input.trim();
    setInput('');
    await sendMessage(messageToSend);
  }, [input, sendMessage]);

  const handleStop = useCallback(() => {
    aiStore.abort(chatId);
  }, [chatId]);

  const handleSuggestedPromptClick = useCallback((promptText: string) => {
    if (input.trim() === promptText.trim()) {
      const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
      handleSubmit(syntheticEvent);
    } else {
      setInput(promptText);
    }
  }, [input, handleSubmit]);

  return {
    messages: session?.messages || [],
    isLoading: session?.isLoading || false,
    error: session?.error || null,
    isAnyLoading,
    input,
    handleInputChange,
    handleSubmit,
    handleStop,
    handleSuggestedPromptClick,
    sendMessage,
    isApiKeyConfigured: Boolean(resolvedApiKey),
  };
}