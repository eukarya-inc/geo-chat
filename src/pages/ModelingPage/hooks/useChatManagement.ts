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
  chatStatesAtom,
  currentChatStateAtom,
  type ChatState
} from '../../../store/modelingAtoms';
import type { StructuredMessage } from '../../../types/message';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import { chatIdToSchemaName } from '../utils/schemaUtils';
import type { Chat as ChatListChat } from '../../../components/chat/ChatList';
import type { StyleSpecification } from 'maplibre-gl';

export function useChatManagement(
  dbContext: DBContext | null
) {
  const chats = useAtomValue(chatsAtom);
  const chatStates = useAtomValue(chatStatesAtom);
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

  // Convert to ChatList format
  const chatsWithMessages = useMemo((): ChatListChat[] => {
    return chats.map(chat => ({
      ...chat,
      messages: chatStates[chat.id]?.messages || [],
      selectedTable: chat.selectedTable,
      mapState: chatStates[chat.id]?.mapConfig ? {
        center: chatStates[chat.id].mapConfig?.center,
        zoom: chatStates[chat.id].mapConfig?.zoom,
        bearing: chatStates[chat.id].mapConfig?.bearing,
        pitch: chatStates[chat.id].mapConfig?.pitch,
        style: chatStates[chat.id].mapConfig?.style as StyleSpecification | undefined,
      } : undefined,
      tableStyles: chatStates[chat.id]?.tableStyles,
      extraMapStyle: chatStates[chat.id]?.extraMapStyle,
    }));
  }, [chats, chatStates]);

  // Current chat with full state
  const currentChatWithState = useMemo((): ChatListChat | undefined => {
    if (!currentChat || !currentChatState) return undefined;
    return {
      ...currentChat,
      messages: currentChatState.messages,
      selectedTable: currentChat.selectedTable,
      mapState: currentChatState.mapConfig ? {
        center: currentChatState.mapConfig.center,
        zoom: currentChatState.mapConfig.zoom,
        bearing: currentChatState.mapConfig.bearing,
        pitch: currentChatState.mapConfig.pitch,
        style: currentChatState.mapConfig.style as StyleSpecification | undefined,
      } : undefined,
      tableStyles: currentChatState.tableStyles,
      extraMapStyle: currentChatState.extraMapStyle,
    };
  }, [currentChat, currentChatState]);

  // Initialize first chat if no chats exist
  useEffect(() => {
    if (dbContext && chats.length === 0) {
      const initializeFirstChat = async () => {
        try {
          const firstChat = await createChat('graph');
          
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
  const createNewChat = async (type: 'graph' | 'map') => {
    if (!dbContext) {
      console.error('DBContext is not initialized');
      return;
    }

    try {
      const newChat = await createChat(type);

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

    deleteChat(chatId);

    // If this was the selected chat, notify about the new selection
    if (selectedChatId === chatId) {
      const remainingChats = chats.filter(chat => chat.id !== chatId);
      if (remainingChats.length > 0) {
        const nextChat = remainingChats[0];
        const nextSchemaName = chatIdToSchemaName(nextChat.id);
        // Notify table change
        dbContext.notifyTableChange(undefined, nextSchemaName);
      }
    }
  };

  // Handle chat selection
  const selectChatHandler = async (chatId: string) => {
    if (!dbContext) return;

    // Find the chat being selected
    const targetChat = chats.find(chat => chat.id === chatId);
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
      // Extract base chat data and chat states
      const baseChatData = newChats.map((chat) => ({
        id: chat.id,
        title: chat.title,
        type: chat.type,
        createdAt: chat.createdAt,
        selectedTable: chat.selectedTable || null,
      }));
      const newChatStates: Record<string, ChatState> = {};
      
      newChats.forEach(chat => {
        newChatStates[chat.id] = {
          messages: chat.messages,
          tableHistory: [], // Initialize empty table history
          mapConfig: chat.mapState ? {
            center: chat.mapState.center || [139.7, 35.7],
            zoom: chat.mapState.zoom || 10,
            bearing: chat.mapState.bearing,
            pitch: chat.mapState.pitch,
            style: chat.mapState.style,
          } : undefined,
          tableStyles: chat.tableStyles,
          extraMapStyle: chat.extraMapStyle,
          showGraph: {},
        };
      });
      
      setRemoteState({
        chats: baseChatData,
        chatStates: newChatStates
      });
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
      // Get the current state from remote state atom
      const remoteState = chatStates;
      const currentId = localState.selectedChatId;
      return currentId ? remoteState[currentId] : null;
    }, [chatStates, localState.selectedChatId]),
  };
}