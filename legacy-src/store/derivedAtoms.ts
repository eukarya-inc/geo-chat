import { atom } from 'jotai';
import {
    remoteStateAtom,
    type Chat,
    type ChatState,
    type ChatStateUpdate,
    type ChartSpecs,
    type MapSpecs,
    type TableSpecs,
    type TableName,
} from './remoteAtoms';
import { selectedChatIdAtom, localStateAtom } from './localAtoms';
import type { ChartSpec } from '../types/chart';
import type { TableSpec } from '../types/table';

// ===== Integrated View Atoms (combining remote and local state) =====
// Current chat (retrieved from remote state)
export const currentChatAtom = atom(
    get => {
        const remoteState = get(remoteStateAtom);
        const selectedChatId = get(selectedChatIdAtom);
        if (!selectedChatId || !remoteState.chats[selectedChatId]) {
            return null;
        }
        return remoteState.chats[selectedChatId];
    },
    (get, set, arg: Chat | ((prev: Chat | null) => Chat | null)) => {
        const selectedChatId = get(selectedChatIdAtom);
        if (!selectedChatId) return;

        // The updater function is passed to set(remoteStateAtom) to ensure it receives the latest state.
        // This prevents race conditions when multiple asynchronous operations update the state concurrently.
        set(remoteStateAtom, prevRemoteState => {
            const currentChat = prevRemoteState.chats[selectedChatId] ?? get(currentChatAtom);
            const newChat = typeof arg === 'function' ? arg(currentChat) : arg;

            if (!newChat) {
                return prevRemoteState;
            }

            return {
                ...prevRemoteState,
                chats: {
                    ...prevRemoteState.chats,
                    [selectedChatId]: newChat,
                },
            };
        });
    }
);

// Current dashboard (retrieved from remote state)
export const currentDashboardAtom = atom(get => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);
    return localState.selectedDashboardId ? remoteState.dashboards[localState.selectedDashboardId] : undefined;
});

// Current chat state (kept for compatibility - extracts state portion from chat itself)
export const currentChatStateAtom = atom<ChatState | null>(get => {
    const chat = get(currentChatAtom);
    if (!chat) return null;

    return {
        messages: chat.messages,
        tables: chat.tables,
        chartSpecs: chat.chartSpecs,
        mapSpecs: chat.mapSpecs,
        tableSpecs: chat.tableSpecs,
    };
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
// Create chat (updates remote state and sessions, but does NOT auto-select)
export const createChatAtom = atom(null, async (get, set) => {
    const remoteState = get(remoteStateAtom);
    const localState = get(localStateAtom);

    const chatCount = Object.keys(remoteState.chats).length;
    const newChat: Chat = {
        id: `chat_${Date.now()}`,
        title: `Chat ${chatCount + 1}`,
        createdAt: new Date(),
        selectedTable: null,
        isTitleDefault: true,
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

    // Update local state - create session but DON'T auto-select
    set(localStateAtom, {
        ...localState,
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

// Rename chat (updates remote state)
export const renameChatAtom = atom(
    null,
    (get, set, { chatId, newTitle, isDefault = false }: { chatId: string; newTitle: string; isDefault?: boolean }) => {
        const remoteState = get(remoteStateAtom);
        const chat = remoteState.chats[chatId];

        if (!chat) return;

        set(remoteStateAtom, {
            ...remoteState,
            chats: {
                ...remoteState.chats,
                [chatId]: {
                    ...chat,
                    title: newTitle,
                    isTitleDefault: isDefault,
                },
            },
        });
    }
);

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
export const updateChatStateAtom = atom(null, (get, set, updates: ChatStateUpdate) => {
    const localState = get(localStateAtom);
    const chatId = localState.selectedChatId;

    if (!chatId) return;

    // Use updater function pattern to ensure we always work with the latest state
    // This prevents race conditions when multiple updates happen concurrently
    set(remoteStateAtom, prevRemoteState => {
        const currentChat = prevRemoteState.chats[chatId];
        if (!currentChat) return prevRemoteState;

        // Merge chartSpecs - updates are merged per table to preserve other tables' specs
        const mergedChartSpecs = mergeChartSpecs(currentChat.chartSpecs, updates.chartSpecs);

        // Merge mapSpecs - deep merge to preserve existing properties
        const mergedMapSpecs = mergeMapSpecs(currentChat.mapSpecs, updates.mapSpecs);

        // Merge tableSpecs - updates are merged per table to preserve other tables' specs
        const mergedTableSpecs = mergeTableSpecs(currentChat.tableSpecs, updates.tableSpecs);

        // Create updated chat with merged specs
        const updatedChat = {
            ...currentChat,
            ...updates,
            chartSpecs: mergedChartSpecs,
            mapSpecs: mergedMapSpecs,
            tableSpecs: mergedTableSpecs,
        };

        return {
            ...prevRemoteState,
            chats: {
                ...prevRemoteState.chats,
                [chatId]: updatedChat,
            },
        };
    });
});

// Helper: Merge chart specs per table (preserves specs for other tables)
function mergeChartSpecs(
    existing: ChartSpecs | undefined,
    updates: Record<TableName, ChartSpec | null> | undefined
): ChartSpecs {
    // Start with existing specs to preserve all tables
    const merged = { ...(existing || {}) };

    if (!updates) return merged;

    // Merge each table's spec
    for (const [tableName, newChartSpec] of Object.entries(updates)) {
        // null means deletion
        if (newChartSpec === null) {
            delete merged[tableName];
        } else {
            merged[tableName] = newChartSpec;
        }
    }

    return merged;
}

// Helper: Deep merge map specs per table
function mergeMapSpecs(existing: MapSpecs | undefined, updates: MapSpecs | undefined): MapSpecs | undefined {
    if (!updates) return existing;

    const merged = { ...(existing || {}) };

    // Deep merge each table's mapSpec
    for (const [tableName, newMapSpec] of Object.entries(updates)) {
        const existingMapSpec = merged[tableName] || {};
        merged[tableName] = {
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

    return merged;
}

// Helper: Merge table specs per table (similar to chart specs)
function mergeTableSpecs(
    existing: TableSpecs | undefined,
    updates: Record<TableName, TableSpec | null> | undefined
): TableSpecs | undefined {
    if (!updates) return existing;

    const merged = { ...(existing || {}) };

    // Merge each table's spec
    for (const [tableName, newTableSpec] of Object.entries(updates)) {
        // null means deletion
        if (newTableSpec === null) {
            delete merged[tableName];
        } else {
            merged[tableName] = newTableSpec;
        }
    }

    return merged;
}

// Update messages (updates ChatState)
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
                    messages,
                },
            },
        });
    }
);

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
export const addTableHistoryAtom = atom(
    null,
    (get, set, { chatId, record }: { chatId: string; record: import('./remoteAtoms').Table }) => {
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
    }
);

// Current chat messages (derived state)
export const currentChatMessagesAtom = atom(get => {
    const currentChat = get(currentChatAtom);
    return currentChat?.messages ?? [];
});
