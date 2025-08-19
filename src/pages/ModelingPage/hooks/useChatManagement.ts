import { useState, useCallback, useEffect, useMemo } from 'react';
import type { Chat } from '../../../components/chat/ChatList';
import type { StructuredMessage } from '../../../types/message';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import { chatIdToSchemaName } from '../utils/schemaUtils';

export function useChatManagement(
    dbContext: DBContext | null
) {
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

    // Get current chat with all properties
    const currentChatFull = chats.find(chat => chat.id === selectedChatId);
    
    // Create a stable reference for current chat without messages
    // This prevents re-renders when messages update during streaming
    const currentChat = useMemo(() => {
        if (!currentChatFull) return undefined;
        
        // Return chat data without messages to prevent unnecessary re-renders
        return {
            id: currentChatFull.id,
            title: currentChatFull.title,
            type: currentChatFull.type,
            createdAt: currentChatFull.createdAt,
            messages: [], // Provide empty array to maintain type compatibility
            selectedTable: currentChatFull.selectedTable,
            tableStyles: currentChatFull.tableStyles,
            extraMapStyle: currentChatFull.extraMapStyle,
            mapState: currentChatFull.mapState
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        selectedChatId, // Only re-create when chat ID changes
        currentChatFull?.selectedTable,
        // Stringify objects for stable comparison
        JSON.stringify(currentChatFull?.tableStyles),
        JSON.stringify(currentChatFull?.extraMapStyle),
        JSON.stringify(currentChatFull?.mapState)
    ]);
    
    // Initialize first chat if no chats exist
    useEffect(() => {
        if (dbContext && chats.length === 0) {
            const initializeFirstChat = async () => {
                try {
                    const firstChat: Chat = {
                        id: `chat-${Date.now()}`,
                        title: 'グラフチャット 1',
                        type: 'graph',
                        createdAt: new Date(),
                        messages: [],
                        selectedTable: null
                    };

                    const schemaName = chatIdToSchemaName(firstChat.id);
                    if (schemaName) {
                        await dbContext.createSchema(schemaName);
                    }

                    setChats([firstChat]);
                    setSelectedChatId(firstChat.id);

                    setTimeout(() => {
                        const schemaName = chatIdToSchemaName(firstChat.id);
                        dbContext.notifyTableChange(undefined, schemaName);
                    }, 0);
                } catch (error) {
                    console.error('Error creating initial chat:', error);
                }
            };

            initializeFirstChat();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dbContext]); // Only depend on dbContext to avoid re-creating chats

    // Update messages for a specific chat
    const updateChatMessages = useCallback((chatId: string, messages: StructuredMessage[]) => {
        setChats(prevChats =>
            prevChats.map(chat =>
                chat.id === chatId
                    ? { ...chat, messages }
                    : chat
            )
        );
    }, []);

    // Chat management functions
    const createNewChat = async (type: 'graph' | 'map') => {
        if (!dbContext) {
            console.error('DBContext is not initialized');
            return;
        }

        try {
            const typeLabel = type === 'graph' ? 'グラフ' : '地図';
            const newChat: Chat = {
                id: `chat-${Date.now()}`,
                title: `${typeLabel}チャット ${chats.length + 1}`,
                type,
                createdAt: new Date(),
                messages: [],
                selectedTable: null
            };

            // Create schema for the new chat
            const schemaName = chatIdToSchemaName(newChat.id);
            if (schemaName) {
                await dbContext.createSchema(schemaName);
            }

            setChats([...chats, newChat]);
            setSelectedChatId(newChat.id);

            // Notify table change to refresh table list
            dbContext.notifyTableChange(undefined, schemaName);
        } catch (error) {
            console.error('Error creating new chat:', error);
        }
    };

    const deleteChat = async (chatId: string) => {
        if (!dbContext) return;

        // Delete the schema associated with the chat
        const schemaName = chatIdToSchemaName(chatId);
        if (schemaName) {
            await dbContext.deleteSchema(schemaName);
        }

        setChats(chats.filter(chat => chat.id !== chatId));
        if (selectedChatId === chatId) {
            const remainingChats = chats.filter(chat => chat.id !== chatId);
            if (remainingChats.length > 0) {
                const nextChat = remainingChats[0];
                await selectChat(nextChat.id);
            } else {
                setSelectedChatId(null);
                // No chats left, components will use null schema (main)
            }

            // Notify table change
            dbContext.notifyTableChange(undefined, chatIdToSchemaName(selectedChatId));
        }
    };

    // Handle chat selection
    const selectChat = async (chatId: string) => {
        if (!dbContext) return;

        // Find the chat being selected
        const targetChat = chats.find(chat => chat.id === chatId);
        if (!targetChat) return;

        // Set the selected chat ID
        setSelectedChatId(chatId);
    };

    // Update chat state
    const updateChatState = useCallback((updates: Partial<Chat>) => {
        if (!selectedChatId) return;
        
        setChats(prevChats =>
            prevChats.map(chat =>
                chat.id === selectedChatId
                    ? { ...chat, ...updates }
                    : chat
            )
        );
    }, [selectedChatId]);

    return {
        chats,
        setChats,
        selectedChatId,
        setSelectedChatId,
        currentChat,
        createNewChat,
        deleteChat,
        selectChat,
        updateChatMessages,
        updateChatState,
    };
}