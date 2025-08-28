import { atom } from 'jotai';
import { remoteStateAtom } from './modelingRemoteAtoms';
import { localStateAtom } from './modelingLocalAtoms';
import type { Chat, ChatState } from './modelingRemoteAtoms';

// ===== 統合ビューAtoms（リモート状態とローカル状態を結合） =====
// 現在のチャット（リモート状態から取得）
export const currentChatAtom = atom((get) => {
  const remoteState = get(remoteStateAtom);
  const localState = get(localStateAtom);
  return localState.selectedChatId ? remoteState.chats[localState.selectedChatId] : undefined;
});

// 現在のチャット状態（互換性のため残す - チャットそのものから状態部分を抽出）
export const currentChatStateAtom = atom((get) => {
  const chat = get(currentChatAtom);
  if (!chat) return null;
  
  return {
    messages: chat.messages,
    tables: chat.tables,
    chartSpecs: chat.chartSpecs,
    mapSpecs: chat.mapSpecs
  } as ChatState;
});

// 現在のテーブルのグラフ表示状態
// chartSpecが存在するかどうかで判断
export const currentTableShowGraphAtom = atom((get) => {
  const chat = get(currentChatAtom);
  const chatState = get(currentChatStateAtom);
  const selectedTable = chat?.selectedTable;
  
  if (!chat || !chatState || !selectedTable) {
    return false;
  }
  
  // chartSpecが存在すればグラフを表示
  return !!chatState.chartSpecs?.[selectedTable];
});

// ===== 便利な操作用Atoms（両方の状態を使用） =====
// チャット作成（リモートとローカル両方を更新）
export const createChatAtom = atom(
  null,
  async (get, set) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    
    const chatCount = Object.keys(remoteState.chats).length;
    const newChat: Chat = {
      id: `chat-${Date.now()}`,
      title: `チャット ${chatCount + 1}`,
      createdAt: new Date(),
      selectedTable: null,
      messages: [],
      tables: {},
    };
    
    // リモート状態更新
    set(remoteStateAtom, {
      ...remoteState,
      chats: {
        ...remoteState.chats,
        [newChat.id]: newChat
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
    
    const remainingChats = Object.fromEntries(
      Object.entries(remoteState.chats).filter(([id]) => id !== chatId)
    );
    const remainingSessions = Object.fromEntries(
      Object.entries(localState.sessions).filter(([id]) => id !== chatId)
    );
    
    const remainingChatIds = Object.keys(remainingChats);
    const firstRemainingId = remainingChatIds[0] || null;
    
    // リモート状態更新
    set(remoteStateAtom, {
      chats: remainingChats
    });
    
    // ローカル状態更新
    set(localStateAtom, {
      ...localState,
      selectedChatId: localState.selectedChatId === chatId
        ? firstRemainingId
        : localState.selectedChatId,
      sessions: remainingSessions
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
    
    if (!chatId || !remoteState.chats[chatId]) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chats: {
        ...remoteState.chats,
        [chatId]: {
          ...remoteState.chats[chatId],
          selectedTable: tableName
        }
      }
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
    
    if (!chatId || !remoteState.chats[chatId]) return;
    
    // Deep merge for mapSpecs
    let mergedMapSpecs = remoteState.chats[chatId].mapSpecs;
    if (updates.mapSpecs) {
      mergedMapSpecs = { ...remoteState.chats[chatId].mapSpecs };
      
      // Deep merge each table's mapSpec
      for (const [tableName, newMapSpec] of Object.entries(updates.mapSpecs)) {
        const existingMapSpec = mergedMapSpecs?.[tableName] || {};
        mergedMapSpecs[tableName] = {
          ...existingMapSpec,
          ...newMapSpec,
          // Deep merge tableStyles if present
          tableStyles: newMapSpec.tableStyles ? {
            ...existingMapSpec.tableStyles,
            ...newMapSpec.tableStyles
          } : existingMapSpec.tableStyles
        };
      }
    }
    
    const updatedChat = {
      ...remoteState.chats[chatId],
      ...updates,
      mapSpecs: mergedMapSpecs
    };
    
    
    set(remoteStateAtom, {
      ...remoteState,
      chats: {
        ...remoteState.chats,
        [chatId]: updatedChat
      }
    });
  }
);

// メッセージ更新（ChatState更新）
export const updateMessagesAtom = atom(
  null,
  (get, set, { chatId, messages }: { chatId: string; messages: import('../types/message').StructuredMessage[] }) => {
    const remoteState = get(remoteStateAtom);
    const chat = remoteState.chats[chatId];
    
    if (!chat) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chats: {
        ...remoteState.chats,
        [chatId]: {
          ...chat,
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
  (get, set, { chatId, record }: { chatId: string; record: import('./modelingRemoteAtoms').Table }) => {
    const remoteState = get(remoteStateAtom);
    const chat = remoteState.chats[chatId];
    
    if (!chat) return;
    
    set(remoteStateAtom, {
      ...remoteState,
      chats: {
        ...remoteState.chats,
        [chatId]: {
          ...chat,
          tables: {
            ...(chat.tables || {}),
            [record.tableName]: record
          }
        }
      }
    });
  }
);