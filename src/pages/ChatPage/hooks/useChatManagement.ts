import { useCallback, useEffect, useMemo } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import {
  chatsAtom,
  localStateAtom,
  currentChatAtom,
  createChatAtom,
  deleteChatAtom,
  selectChatAtom,
  updateMessagesAtom,
  updateChatStateAtom,
  remoteStateAtom,
  currentChatStateAtom,
  type Chat,
  type ChatState
} from '../../../store/atoms';
import type { StructuredMessage } from '../../../types/message';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { Chat as ChatListChat } from '../../../components/chat/ChatList';

export function useChatManagement(
  dbContext: DBContext | null
) {
  const chatsRecord = useAtomValue(chatsAtom);  // Now a Record<string, Chat>
  const [localState, setLocalState] = useAtom(localStateAtom);
  const currentChat = useAtomValue(currentChatAtom);
  const currentChatState = useAtomValue(currentChatStateAtom);
  const createChat = useSetAtom(createChatAtom);
  const deleteChat = useSetAtom(deleteChatAtom);
  const selectChat = useSetAtom(selectChatAtom);
  const updateMessages = useSetAtom(updateMessagesAtom);
  const updateChatState = useSetAtom(updateChatStateAtom);
  const setRemoteState = useSetAtom(remoteStateAtom);

  const selectedChatId = localState.selectedChatId;

  // Convert Record to array and sort by createdAt for ChatList format
  const chatsWithMessages = useMemo((): ChatListChat[] => {
    return Object.values(chatsRecord)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .map(chat => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        messages: chat.messages,
        selectedTable: chat.selectedTable,
        mapSpecs: chat.mapSpecs,
      }));
  }, [chatsRecord]);

  // Current chat with full state
  const currentChatWithState = useMemo((): ChatListChat | undefined => {
    if (!currentChat || !currentChatState) return undefined;
    return {
      ...currentChat,
      messages: currentChatState.messages,
      selectedTable: currentChat.selectedTable,
      mapSpecs: currentChatState.mapSpecs,
    };
  }, [currentChat, currentChatState]);

  // Initialize first chat if no chats exist
  useEffect(() => {
    if (dbContext && Object.keys(chatsRecord).length === 0) {
      const initializeFirstChat = async () => {
        try {
          const firstChat = await createChat();

          const schemaName = chatIdToSchemaName(firstChat.id);
          if (schemaName) {
            await dbContext.createSchema(schemaName);
          }

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
    updateMessages({ chatId, messages });
  }, [updateMessages]);

  // Chat management functions
  const createNewChat = async () => {
    if (!dbContext) {
      console.error('DBContext is not initialized');
      return;
    }

    try {
      const newChat = await createChat();

      // Create schema for the new chat
      const schemaName = chatIdToSchemaName(newChat.id);
      if (schemaName) {
        await dbContext.createSchema(schemaName);
      }

      // Notify table change to refresh table list
      dbContext.notifyTableChange(undefined, schemaName);
    } catch (error) {
      console.error('Error creating new chat:', error);
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
    if (!dbContext) return;

    // Find the chat being selected
    const targetChat = chatsRecord[chatId];
    if (!targetChat) return;

    // Set the selected chat ID
    selectChat(chatId);
  };

  // Update chat state (for compatibility with existing code)
  const updateChatStateWrapper = useCallback((updates: Partial<ChatState>) => {
    updateChatState(updates);
  }, [updateChatState]);

  return {
    chats: chatsWithMessages,
    setChats: (newChats: ChatListChat[]) => {
      // For compatibility - update remote state directly
      const newChatsRecord: Record<string, Chat> = {};

      newChats.forEach(chat => {
        newChatsRecord[chat.id] = {
          id: chat.id,
          title: chat.title,
          createdAt: chat.createdAt,
          selectedTable: chat.selectedTable || null,
          messages: chat.messages,
          tables: {}, // Initialize empty tables record
          chartSpecs: undefined,
          mapSpecs: chat.mapSpecs,
        };
      });

      setRemoteState(prev => ({
        ...prev,
        chats: newChatsRecord
      }));
    },
    selectedChatId,
    setSelectedChatId: (chatId: string | null) => {
      setLocalState(prev => ({
        ...prev,
        selectedChatId: chatId
      }));
    },
    currentChat: currentChatWithState,
    createNewChat,
    deleteChat: deleteChatHandler,
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
        mapSpecs: chat.mapSpecs
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
