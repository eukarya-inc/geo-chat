import { useCallback } from 'react';
import { useAIChat } from '../../lib/ai/useAIChat';
import { aiStore } from '../../lib/ai/AIStore';
import Chat from './Chat';
import EmptyChat from './EmptyChat';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { StructuredMessage } from '../../types/message';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/remoteAtoms';
import type { TableStyle } from '../map';

interface AIChatProps {
    dbContext: DBContext | null;
    apiKey?: string;
    chatId?: string | null;
    schemaName?: string | null;
    onMessagesChange: (messages: StructuredMessage[]) => void;
    updateChatMessages?: (chatId: string, messages: StructuredMessage[]) => void;
    onSendMessageReady?: (sendMessage: (message: string) => void) => void;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
    onChartDelete?: (tableName: string) => Promise<void>;
    getCurrentChatState?: () => ChatState | null;
    onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>;
    onMapStyleDelete?: (tableName: string) => Promise<void>;
    remoteFileComponent?: (onClose: () => void, onShowUrlGuide?: () => void) => React.ReactNode;
    onConversationCompleted?: () => void;
    waitForDbContext?: () => Promise<DBContext>;
    onApiKeyChange?: (value: string) => void;
    onApiKeySave?: (apiKey: string) => Promise<boolean>;
    showApiKeyInput?: boolean;
}

export default function AIChat({
    dbContext,
    apiKey,
    chatId,
    schemaName,
    onMessagesChange,
    updateChatMessages,
    onSendMessageReady,
    selectedTable,
    onTableSelect,
    onChartUpdate,
    onChartDelete,
    getCurrentChatState,
    onMapStyleUpdate,
    onMapStyleDelete,
    remoteFileComponent,
    onConversationCompleted,
    waitForDbContext,
    onApiKeyChange,
    onApiKeySave,
    showApiKeyInput,
}: AIChatProps) {
    const effectiveChatId = chatId || 'default';

    const handleMessagesChange = useCallback(
        (messages: StructuredMessage[]) => {
            // Update AIStore's session messages
            aiStore.updateMessages(effectiveChatId, messages);

            if (chatId && updateChatMessages) {
                updateChatMessages(chatId, messages);
            }
            onMessagesChange(messages);
        },
        [effectiveChatId, chatId, updateChatMessages, onMessagesChange]
    );

    const { messages, isLoading, isAnyLoading, input, handleInputChange, handleSubmit, handleStop, sendMessage } =
        useAIChat({
            chatId: effectiveChatId,
            schema: schemaName,
            dbContext,
            apiKey,
            selectedTable,
            onMessagesChange: handleMessagesChange,
            onChartUpdate,
            onChartDelete,
            getCurrentChatState,
            onMapStyleUpdate,
            onMapStyleDelete,
            onConversationCompleted,
        });

    // Notify parent about sendMessage availability
    if (onSendMessageReady && sendMessage) {
        onSendMessageReady(sendMessage);
    }

    const hasMessages = messages.length > 0;

    if (!hasMessages) {
        return (
            <EmptyChat
                dbContext={dbContext}
                apiKey={apiKey}
                schemaName={schemaName}
                onApiKeyChange={onApiKeyChange}
                onApiKeySave={onApiKeySave}
                showApiKeyInput={showApiKeyInput}
                waitForDbContext={waitForDbContext}
                remoteFileComponent={remoteFileComponent}
                onSendMessage={sendMessage}
            />
        );
    }

    return (
        <Chat
            dbContext={dbContext}
            apiKey={apiKey}
            schemaName={schemaName}
            messages={messages}
            isLoading={isLoading}
            isAnyLoading={isAnyLoading}
            input={input}
            handleInputChange={handleInputChange}
            handleSubmit={handleSubmit}
            handleStop={handleStop}
            sendMessage={sendMessage}
            selectedTable={selectedTable}
            onTableSelect={onTableSelect}
            getCurrentChatState={getCurrentChatState}
            remoteFileComponent={remoteFileComponent}
        />
    );
}
