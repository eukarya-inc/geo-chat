import { useSyncExternalStore, useCallback, useState, useEffect } from 'react';
import { aiStore } from './AIStore';
import type { StructuredMessage } from '../../types/message';
import type { DBContext } from '../duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/remoteAtoms';
import type { TableStyle } from '../../components/map';

interface UseAIChatOptions {
    chatId?: string | null;
    schema?: string | null;
    dbContext?: DBContext | null;
    apiKey?: string;
    selectedTable?: string | null;
    onMessagesChange?: (messages: StructuredMessage[]) => void;
    onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
    onChartDelete?: (tableName: string) => Promise<void>;
    getCurrentChatState?: () => ChatState | null;
    onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>;
    onMapStyleDelete?: (tableName: string) => Promise<void>;
    onConversationCompleted?: () => void;
}

export function useAIChat({
    chatId,
    schema,
    dbContext,
    apiKey,
    selectedTable,
    onMessagesChange,
    onChartUpdate,
    onChartDelete,
    getCurrentChatState,
    onMapStyleUpdate,
    onMapStyleDelete,
    onConversationCompleted,
}: UseAIChatOptions) {
    const [input, setInput] = useState('');
    const resolvedApiKey = apiKey || import.meta.env.VITE_ANTHROPIC_API_KEY;

    const session = useSyncExternalStore(
        aiStore.subscribe.bind(aiStore),
        () => (chatId ? aiStore.getChatSession(chatId) : undefined),
        () => (chatId ? aiStore.getChatSession(chatId) : undefined)
    );

    const isAnyLoading = useSyncExternalStore(
        aiStore.subscribe.bind(aiStore),
        () => aiStore.isAnyLoading(),
        () => aiStore.isAnyLoading()
    );

    useEffect(() => {
        if (!chatId) return;

        aiStore.getOrCreateSession(chatId, schema || null);

        // Register chat context for simplified sendMessage
        if (resolvedApiKey) {
            aiStore.registerChatContext(chatId, {
                apiKey: resolvedApiKey,
                dbContext: dbContext || undefined,
                schema,
                selectedTable,
                onMessagesChange,
                onChartUpdate,
                onChartDelete,
                getCurrentChatState,
                onMapStyleUpdate,
                onMapStyleDelete,
                onMessageComplete: onConversationCompleted,
            });
        }
    }, [
        chatId,
        schema,
        resolvedApiKey,
        dbContext,
        selectedTable,
        onMessagesChange,
        onChartUpdate,
        onChartDelete,
        getCurrentChatState,
        onMapStyleUpdate,
        onMapStyleDelete,
        onConversationCompleted,
    ]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        setInput(e.target.value);
    }, []);

    const sendMessage = useCallback(
        async (
            message: string,
            targetChatId?: string,
            overrideDbContext?: DBContext,
            overrideSchema?: string | null,
            overrideOptions?: {
                onMessagesChange?: (messages: StructuredMessage[]) => void;
            }
        ) => {
            if (!resolvedApiKey) return;

            // Use provided chatId, fallback to hook's chatId
            const effectiveChatId = targetChatId || chatId;
            if (!effectiveChatId) {
                console.error('No chatId provided for sendMessage');
                return;
            }

            await aiStore.sendMessage(effectiveChatId, message, {
                apiKey: resolvedApiKey,
                dbContext: overrideDbContext || dbContext || undefined,
                schema: overrideSchema !== undefined ? overrideSchema : schema,
                selectedTable,
                onMessagesChange: overrideOptions?.onMessagesChange || onMessagesChange,
                onChartUpdate,
                onChartDelete,
                getCurrentChatState,
                onMapStyleUpdate,
                onMapStyleDelete,
                onMessageComplete: onConversationCompleted,
            });
        },
        [
            chatId,
            resolvedApiKey,
            dbContext,
            schema,
            selectedTable,
            onMessagesChange,
            onChartUpdate,
            onChartDelete,
            getCurrentChatState,
            onMapStyleUpdate,
            onMapStyleDelete,
            onConversationCompleted,
        ]
    );

    const handleSubmit = useCallback(
        async (e: React.FormEvent) => {
            e.preventDefault();
            if (!input.trim()) return;

            const messageToSend = input.trim();
            setInput('');
            await sendMessage(messageToSend);
        },
        [input, sendMessage]
    );

    const handleStop = useCallback(() => {
        if (chatId) {
            aiStore.abort(chatId);
        }
    }, [chatId]);

    const handleSuggestedPromptClick = useCallback(
        (promptText: string) => {
            if (input.trim() === promptText.trim()) {
                const syntheticEvent = { preventDefault: () => {} } as React.FormEvent;
                handleSubmit(syntheticEvent);
            } else {
                setInput(promptText);
            }
        },
        [input, handleSubmit]
    );

    // Provide a sendMessage function even when chatId is not provided
    // This allows EmptyChat to work without a chatId

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
