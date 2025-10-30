import { useCallback, useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import {
    chatsAtom,
    localStateAtom,
    currentChatAtom,
    createChatAtom,
    deleteChatAtom,
    renameChatAtom,
    selectChatAtom,
    updateMessagesAtom,
    updateChatStateAtom,
    currentChatStateAtom,
    type Chat,
    type ChatState,
} from '../../../store/atoms';
import type { StructuredMessage } from '../../../types/message';
import type { DBContext } from '../../../lib/duckdb/dbContext';

export function useChatManagement(dbContext: DBContext | null) {
    const chatsRecord = useAtomValue(chatsAtom); // Now a Record<string, Chat>
    const localState = useAtomValue(localStateAtom);
    const currentChat = useAtomValue(currentChatAtom);
    const currentChatState = useAtomValue(currentChatStateAtom);
    const createChat = useSetAtom(createChatAtom);
    const deleteChat = useSetAtom(deleteChatAtom);
    const renameChat = useSetAtom(renameChatAtom);
    const selectChat = useSetAtom(selectChatAtom);
    const updateMessages = useSetAtom(updateMessagesAtom);
    const updateChatState = useSetAtom(updateChatStateAtom);

    const selectedChatId = localState.selectedChatId;

    // Convert Record to array and sort by createdAt for ChatList format
    const chatsWithMessages = useMemo((): Chat[] => {
        return Object.values(chatsRecord).sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
    }, [chatsRecord]);

    // Current chat with full state
    const currentChatWithState = useMemo((): Chat | undefined => {
        if (!currentChat || !currentChatState) return undefined;
        return {
            ...currentChat,
            messages: currentChatState.messages,
            selectedTable: currentChat.selectedTable,
            mapSpecs: currentChatState.mapSpecs,
            isTitleDefault: currentChat.isTitleDefault,
        };
    }, [currentChat, currentChatState]);

    // Note: Chat is no longer automatically created on initialization.
    // Chat will be created when the user sends their first message.

    // Create schema for the selected chat when dbContext becomes available
    useEffect(() => {
        if (!dbContext || !selectedChatId) {
            return;
        }

        const createSchemaForChat = async () => {
            try {
                const schemaName = chatIdToSchemaName(selectedChatId);
                if (schemaName) {
                    await dbContext.createSchema(schemaName);
                    setTimeout(() => {
                        dbContext.notifyTableChange(undefined, schemaName);
                    }, 0);
                }
            } catch (error) {
                console.error('Error creating schema for chat:', error);
            }
        };

        createSchemaForChat();
    }, [dbContext, selectedChatId]); // Create schema when dbContext or selectedChatId changes

    // Update messages for a specific chat
    const updateChatMessages = useCallback(
        (chatId: string, messages: StructuredMessage[]) => {
            updateMessages({ chatId, messages });
        },
        [updateMessages]
    );

    // Chat management functions
    const createNewChat = async (db?: DBContext | null): Promise<string | undefined> => {
        // Use provided dbContext or fallback to hook's dbContext
        const effectiveDb = db || dbContext;

        if (!effectiveDb) {
            console.error('DBContext is not initialized');
            return undefined;
        }

        try {
            const newChat = await createChat();

            // Create schema for the new chat
            const schemaName = chatIdToSchemaName(newChat.id);
            if (schemaName) {
                await effectiveDb.createSchema(schemaName);
            }

            // Notify table change to refresh table list
            effectiveDb.notifyTableChange(undefined, schemaName);

            // Return the new chat ID
            return newChat.id;
        } catch (error) {
            console.error('Error creating new chat:', error);
            return undefined;
        }
    };

    const deleteChatHandler = async (chatId: string) => {
        if (!dbContext) return;

        // Delete the schema associated with the chat
        const schemaName = chatIdToSchemaName(chatId);
        if (schemaName) {
            await dbContext.deleteSchema(schemaName);
        }

        // If this was the selected chat, handle selection before deletion
        if (selectedChatId === chatId) {
            const remainingChatIds = Object.keys(chatsRecord).filter(id => id !== chatId);
            if (remainingChatIds.length > 0) {
                // Select the first remaining chat
                const nextChatId = remainingChatIds[0];
                selectChat(nextChatId);
                const nextSchemaName = chatIdToSchemaName(nextChatId);
                // Notify table change
                dbContext.notifyTableChange(undefined, nextSchemaName);
            } else {
                // No remaining chats - clear selection
                selectChat('');
            }
        }

        // Now delete the chat
        deleteChat(chatId);
    };

    // Handle chat selection
    const selectChatHandler = async (chatId: string) => {
        // Set the selected chat ID
        // Note: We don't check if targetChat exists because the chat might be
        // newly created and not yet in chatsRecord due to async state updates
        selectChat(chatId);
    };

    // Handle chat rename
    const renameChatHandler = (chatId: string, newTitle: string, isDefault?: boolean) => {
        renameChat({ chatId, newTitle, isDefault });
    };

    // Update chat state (for compatibility with existing code)
    const updateChatStateWrapper = useCallback(
        (updates: Partial<ChatState>) => {
            updateChatState(updates);
        },
        [updateChatState]
    );

    return {
        chats: chatsWithMessages,
        selectedChatId,
        currentChat: currentChatWithState,
        createNewChat,
        deleteChat: deleteChatHandler,
        renameChat: renameChatHandler,
        selectChat: selectChatHandler,
        updateChatMessages,
        updateChatState: updateChatStateWrapper,
        getCurrentChatState: useCallback(() => {
            // Get the current chat and extract its state
            const currentId = localState.selectedChatId;
            const chat = currentId ? chatsRecord[currentId] : null;
            if (!chat) return null;

            return {
                messages: chat.messages,
                tables: chat.tables,
                chartSpecs: chat.chartSpecs,
                mapSpecs: chat.mapSpecs,
            } as ChatState;
        }, [chatsRecord, localState.selectedChatId]),
    };
}

// Utility function to convert chatId to schema name
// This maintains the naming convention for chat-based schemas
export function chatIdToSchemaName(chatId: string | null | undefined): string | null {
    if (!chatId) return null;
    return `chat_${chatId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}
