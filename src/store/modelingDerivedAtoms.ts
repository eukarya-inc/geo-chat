import { atom } from 'jotai';
import { remoteStateAtom } from './modelingRemoteAtoms';
import { localStateAtom } from './modelingLocalAtoms';
import type { ChatState } from './modelingRemoteAtoms';

// ===== 統合ビューAtoms（リモート状態とローカル状態を結合） =====
// 現在のチャット（リモート状態から取得）
export const currentChatAtom = atom((get) => {
  const remoteState = get(remoteStateAtom);
  const localState = get(localStateAtom);
  return remoteState.chats.find(c => c.id === localState.selectedChatId);
});

// 現在のチャット状態
export const currentChatStateAtom = atom((get) => {
  const remoteState = get(remoteStateAtom);
  const localState = get(localStateAtom);
  return localState.selectedChatId 
    ? remoteState.chatStates[localState.selectedChatId]
    : null;
});

// 現在のテーブルのグラフ表示状態
export const currentTableShowGraphAtom = atom((get) => {
  const chat = get(currentChatAtom);
  const chatState = get(currentChatStateAtom);
  const selectedTable = chat?.selectedTable;
  
  if (!chat || !chatState || !selectedTable || chat.type !== 'graph') {
    return false;
  }
  
  return chatState.showGraph?.[selectedTable] ?? false;  // デフォルトは非表示
});

// ===== 便利な操作用Atoms（両方の状態を使用） =====
// チャット作成（リモートとローカル両方を更新）
export const createChatAtom = atom(
  null,
  async (get, set, type: 'graph' | 'map') => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    
    const newChat = {
      id: `chat-${Date.now()}`,
      title: `${type === 'graph' ? 'グラフ' : '地図'}チャット ${remoteState.chats.length + 1}`,
      type,
      createdAt: new Date(),
      selectedTable: null
    };
    
    const newChatState = {
      messages: [],
      tableHistory: [],
      showGraph: {},
    };
    
    // リモート状態更新
    set(remoteStateAtom, {
      ...remoteState,
      chats: [...remoteState.chats, newChat],
      chatStates: {
        ...remoteState.chatStates,
        [newChat.id]: newChatState
      }
    });
    
    // ローカル状態更新
    set(localStateAtom, {
      ...localState,
      selectedChatId: newChat.id,
      sessions: {
        ...localState.sessions,
        [newChat.id]: {
          isLoading: false,
          error: null,
          input: '',
          streamingText: ''
        }
      }
    });
    
    return newChat;
  }
);

// チャット削除（リモートとローカル両方を更新）
export const deleteChatAtom = atom(
  null,
  (get, set, chatId: string) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    
    const remainingChats = remoteState.chats.filter(chat => chat.id !== chatId);
    const remainingChatStates = Object.fromEntries(
      Object.entries(remoteState.chatStates).filter(([id]) => id !== chatId)
    );
    const remainingSessions = Object.fromEntries(
      Object.entries(localState.sessions).filter(([id]) => id !== chatId)
    );
    
    // リモート状態更新
    set(remoteStateAtom, {
      chats: remainingChats,
      chatStates: remainingChatStates
    });
    
    // ローカル状態更新
    set(localStateAtom, {
      ...localState,
      selectedChatId: localState.selectedChatId === chatId
        ? (remainingChats[0]?.id || null)
        : localState.selectedChatId,
      sessions: remainingSessions
    });
  }
);

// グラフ表示切り替え（現在の選択を使用）
export const toggleTableGraphAtom = atom(
  null,
  (get, set, tableName: string) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    const chatId = localState.selectedChatId;
    
    if (!chatId) return;
    
    const chatState = remoteState.chatStates[chatId];
    if (!chatState) return;
    
    const currentShow = chatState.showGraph?.[tableName] ?? false;
    
    set(remoteStateAtom, {
      ...remoteState,
      chatStates: {
        ...remoteState.chatStates,
        [chatId]: {
          ...chatState,
          showGraph: {
            ...chatState.showGraph,
            [tableName]: !currentShow
          }
        }
      }
    });
  }
);

// グラフ表示を明示的に設定
export const setTableGraphAtom = atom(
  null,
  (get, set, { tableName, show }: { tableName: string; show: boolean }) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    const chatId = localState.selectedChatId;
    
    if (!chatId) return;
    
    const chatState = remoteState.chatStates[chatId];
    if (!chatState) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chatStates: {
        ...remoteState.chatStates,
        [chatId]: {
          ...chatState,
          showGraph: {
            ...chatState.showGraph,
            [tableName]: show
          }
        }
      }
    });
  }
);

// テーブル選択（現在のチャットを更新）
export const selectTableAtom = atom(
  null,
  (get, set, tableName: string | null) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    const chatId = localState.selectedChatId;
    
    if (!chatId) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chats: remoteState.chats.map(chat =>
        chat.id === chatId
          ? { ...chat, selectedTable: tableName }
          : chat
      )
    });
  }
);

// チャット状態更新（現在のチャットを更新）
export const updateChatStateAtom = atom(
  null,
  (get, set, updates: Partial<ChatState>) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    const chatId = localState.selectedChatId;
    
    if (!chatId) return;
    
    const currentChatState = remoteState.chatStates[chatId];
    if (!currentChatState) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chatStates: {
        ...remoteState.chatStates,
        [chatId]: {
          ...currentChatState,
          ...updates
        }
      }
    });
  }
);

// メッセージ更新（ChatState更新）
export const updateMessagesAtom = atom(
  null,
  (get, set, { chatId, messages }: { chatId: string; messages: import('../types/message').StructuredMessage[] }) => {
    const remoteState = get(remoteStateAtom);
    const chatState = remoteState.chatStates[chatId];
    
    if (!chatState) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chatStates: {
        ...remoteState.chatStates,
        [chatId]: {
          ...chatState,
          messages
        }
      }
    });
  }
);

// チャット選択（ローカル状態のみ更新）
export const selectChatAtom = atom(
  null,
  (get, set, chatId: string) => {
    const localState = get(localStateAtom);
    set(localStateAtom, {
      ...localState,
      selectedChatId: chatId
    });
  }
);

// テーブル作成履歴追加
export const addTableHistoryAtom = atom(
  null,
  (get, set, { chatId, record }: { chatId: string; record: import('./modelingRemoteAtoms').TableCreationRecord }) => {
    const remoteState = get(remoteStateAtom);
    const chatState = remoteState.chatStates[chatId];
    
    if (!chatState) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chatStates: {
        ...remoteState.chatStates,
        [chatId]: {
          ...chatState,
          tableHistory: [...(chatState.tableHistory || []), record]
        }
      }
    });
  }
);