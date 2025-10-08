import { atom } from 'jotai';
import { remoteStateAtom } from './remoteAtoms';
import { localStateAtom } from './localAtoms';
import type { Chat, ChatState } from './remoteAtoms';

// ===== Integrated View Atoms (combining remote and local state) =====
// Current chat (retrieved from remote state)
export const currentChatAtom = atom(get => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    return localState.selectedChatId ? remoteState.chats[localState.selectedChatId] : undefined;
});

// Current dashboard (retrieved from remote state)
export const currentDashboardAtom = atom(get => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    return localState.selectedDashboardId ? remoteState.dashboards[localState.selectedDashboardId] : undefined;
});

// Current chat state (kept for compatibility - extracts state portion from chat itself)
export const currentChatStateAtom = atom(get => {
    const chat = get(currentChatAtom);
    if (!chat) return null;

    return {
        messages: chat.messages,
        tables: chat.tables,
        chartSpecs: chat.chartSpecs,
        mapSpecs: chat.mapSpecs,
    } as ChatState;
});

// Current table graph display state
// Determined by whether chartSpec exists
export const currentTableShowGraphAtom = atom(get => {
    const chat = get(currentChatAtom);
    const chatState = get(currentChatStateAtom);
    const selectedTable = chat?.selectedTable;

    if (!chat || !chatState || !selectedTable) {
        return false;
    }

    // Display graph if chartSpec exists
    return !!chatState.chartSpecs?.[selectedTable];
});

// ===== Convenient Operation Atoms (using both states) =====
// Create chat (updates both remote and local)
export const createChatAtom = atom(null, async (get, set) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);

    const chatCount = Object.keys(remoteState.chats).length;
    const newChat: Chat = {
        id: `chat-${Date.now()}`,
        title: `Chat ${chatCount + 1}`,
        createdAt: new Date(),
        selectedTable: null,
        messages: [],
        tables: {},
    };

    // Update remote state
    set(remoteStateAtom, {
        ...remoteState,
        chats: {
            ...remoteState.chats,
            [newChat.id]: newChat,
        },
    });

    // Update local state
    set(localStateAtom, {
        ...localState,
        selectedChatId: newChat.id,
        sessions: {
            ...localState.sessions,
            [newChat.id]: {
                isLoading: false,
                error: null,
                input: '',
                streamingText: '',
            },
        },
    });

    return newChat;
});

// Delete chat (updates both remote and local)
export const deleteChatAtom = atom(null, (get, set, chatId: string) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);

    const remainingChats = Object.fromEntries(Object.entries(remoteState.chats).filter(([id]) => id !== chatId));
    const remainingSessions = Object.fromEntries(Object.entries(localState.sessions).filter(([id]) => id !== chatId));

    const remainingChatIds = Object.keys(remainingChats);
    const firstRemainingId = remainingChatIds[0] || null;

    // Update remote state
    set(remoteStateAtom, prev => ({
        ...prev,
        chats: remainingChats,
    }));

    // Update local state
    set(localStateAtom, {
        ...localState,
        selectedChatId: localState.selectedChatId === chatId ? firstRemainingId : localState.selectedChatId,
        sessions: remainingSessions,
    });
});

// Select table (updates current chat)
export const selectTableAtom = atom(null, (get, set, tableName: string | null) => {
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
                selectedTable: tableName,
            },
        },
    });
});

// Update chat state (updates current chat)
export const updateChatStateAtom = atom(null, (get, set, updates: Partial<ChatState>) => {
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
                tableStyles: newMapSpec.tableStyles
                    ? {
                          ...existingMapSpec.tableStyles,
                          ...newMapSpec.tableStyles,
                      }
                    : existingMapSpec.tableStyles,
            };
        }
    }

    const updatedChat = {
        ...remoteState.chats[chatId],
        ...updates,
        mapSpecs: mergedMapSpecs,
    };

    set(remoteStateAtom, {
        ...remoteState,
        chats: {
            ...remoteState.chats,
            [chatId]: updatedChat,
        },
    });
});

// Update messages (updates ChatState)
export const updateMessagesAtom = atom(null, (get, set, { chatId, messages }: { chatId: string; messages: import('../types/message').StructuredMessage[] }) => {
    const remoteState = get(remoteStateAtom);
    const chat = remoteState.chats[chatId];

    if (!chat) return;

    set(remoteStateAtom, {
        ...remoteState,
        chats: {
            ...remoteState.chats,
            [chatId]: {
                ...chat,
                messages,
            },
        },
    });
});

// Select chat (updates local state only)
export const selectChatAtom = atom(null, (get, set, chatId: string) => {
    const localState = get(localStateAtom);
    set(localStateAtom, {
        ...localState,
        selectedChatId: chatId,
    });
});

// Select dashboard (updates local state only)
export const selectDashboardAtom = atom(null, (get, set, dashboardId: string | null) => {
    const localState = get(localStateAtom);
    set(localStateAtom, {
        ...localState,
        selectedDashboardId: dashboardId,
    });
});

// Add table creation history
export const addTableHistoryAtom = atom(null, (get, set, { chatId, record }: { chatId: string; record: import('./remoteAtoms').Table }) => {
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
                    [record.tableName]: record,
                },
            },
        },
    });
});
