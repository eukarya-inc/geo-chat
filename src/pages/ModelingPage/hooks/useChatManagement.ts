import { useState, useCallback, useEffect } from 'react';
import type { Chat } from '../../../components/chat/ChatList';
import type { StructuredMessage } from '../../../types/message';
import type { DBContext } from '../../../lib/duckdb/dbContext';

export function useChatManagement(
    dbContext: DBContext | null
) {
    const [chats, setChats] = useState<Chat[]>([]);
    const [selectedChatId, setSelectedChatId] = useState<string | null>(null);

    // Get current chat
    const currentChat = chats.find(chat => chat.id === selectedChatId);
    
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

                    await dbContext.createSchema(firstChat.id);
                    await dbContext.switchToSchema(firstChat.id);

                    setChats([firstChat]);
                    setSelectedChatId(firstChat.id);

                    setTimeout(() => {
                        dbContext.notifyTableChange(undefined, firstChat.id);
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
            await dbContext.createSchema(newChat.id);
            await dbContext.switchToSchema(newChat.id);

            setChats([...chats, newChat]);
            setSelectedChatId(newChat.id);

            // Notify table change to refresh table list
            dbContext.notifyTableChange(undefined, newChat.id);
        } catch (error) {
            console.error('Error creating new chat:', error);
        }
    };

    const deleteChat = async (chatId: string) => {
        if (!dbContext) return;

        // Delete the schema associated with the chat
        await dbContext.deleteSchema(chatId);

        setChats(chats.filter(chat => chat.id !== chatId));
        if (selectedChatId === chatId) {
            const remainingChats = chats.filter(chat => chat.id !== chatId);
            if (remainingChats.length > 0) {
                const nextChat = remainingChats[0];
                await selectChat(nextChat.id);
            } else {
                setSelectedChatId(null);
                // Reset to main schema
                await dbContext.resetToMain();
            }

            // Notify table change
            dbContext.notifyTableChange(undefined, selectedChatId);
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