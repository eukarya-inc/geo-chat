import { atom } from 'jotai';
import { retrieveEncryptedApiKey, storeEncryptedApiKey } from '../utils/encryption';
import type { Layout } from 'react-grid-layout';

// ===== Local state type definitions (client-side only) =====
export interface SessionState {
    // This interface defines the state of a chat session
    isLoading: boolean;
    error: Error | null;
    input: string;
    streamingText: string;
}

export interface LocalState {
    selectedChatId: string | null;
    selectedDashboardId: string | null;
    sessions: Record<string, SessionState>;
    dashboardLayouts: Record<string, Layout[]>;
    isSidebarOpen: boolean;
    chatWidthPercentage: number; // Chat panel width in percentage (default: 50)

    // API key (saved locally for security)
    apiKey: string;
    showApiKeyInput: boolean;
}

// ===== Local state atoms =====
// IMPORTANT: localStorage persistence is disabled to prevent data accumulation issues
// Reasons for disabling localStorage:
// 1. Data accumulation: Chat sessions, dashboard layouts, and other state continuously grow over time
// 2. No cleanup mechanism: Old/deleted chats remain in localStorage indefinitely
// 3. Storage management complexity: Users have no clear way to manage or delete accumulated data
// 4. Potential storage quota issues: localStorage has size limits (typically 5-10MB)
// 5. Privacy concerns: Sensitive data (chat history, SQL queries) persisting locally
//
// Future consideration: If persistence is needed, implement:
// - Server-side state management with proper cleanup
// - Explicit user-controlled persistence (e.g., "Save session" button)
// - Automatic cleanup of old/unused data
// - Clear UI for storage management
//
// Note: API key persistence is handled separately via encrypted storage (see apiKeyAtom)
export const localStateAtom = atom<LocalState>({
    selectedChatId: null,
    sessions: {},
    selectedDashboardId: null,
    dashboardLayouts: {},
    isSidebarOpen: true,
    chatWidthPercentage: 50,
    apiKey: '',
    showApiKeyInput: false,
});

// ===== Derived atoms from local state =====
export const selectedChatIdAtom = atom(
    get => get(localStateAtom).selectedChatId,
    (get, set, update: string | null) => {
        const state = get(localStateAtom);
        set(localStateAtom, { ...state, selectedChatId: update });
    }
);

export const sessionStateAtom = atom(
    get => get(localStateAtom).sessions,
    (get, set, update: Record<string, SessionState>) => {
        const state = get(localStateAtom);
        set(localStateAtom, { ...state, sessions: update });
    }
);

export const selectedDashboardIdAtom = atom(
    get => get(localStateAtom).selectedDashboardId,
    (get, set, update: string | null) => {
        const state = get(localStateAtom);
        set(localStateAtom, { ...state, selectedDashboardId: update });
    }
);

export const dashboardLayoutsAtom = atom(
    get => get(localStateAtom).dashboardLayouts,
    (get, set, update: Record<string, Layout[]>) => {
        const state = get(localStateAtom);
        set(localStateAtom, { ...state, dashboardLayouts: update });
    }
);

export const isSidebarOpenAtom = atom(
    get => get(localStateAtom).isSidebarOpen,
    (get, set, update: boolean) => {
        const state = get(localStateAtom);
        set(localStateAtom, { ...state, isSidebarOpen: update });
    }
);

export const chatWidthPercentageAtom = atom(
    get => get(localStateAtom).chatWidthPercentage,
    (get, set, update: number) => {
        const state = get(localStateAtom);
        set(localStateAtom, { ...state, chatWidthPercentage: update });
    }
);

// For backward compatibility
export const localSessionsAtom = sessionStateAtom;

// API key dedicated atom (encrypted and managed separately)
// Note: Jotai v2 doesn't support async storage, so wrapped synchronously
export const apiKeyAtom = atom<string>('');

// Effect atom for API key initialization
export const initApiKeyAtom = atom(null, async (_get, set) => {
    try {
        const decryptedKey = await retrieveEncryptedApiKey();
        set(apiKeyAtom, decryptedKey || '');
        set(localStateAtom, prev => ({
            ...prev,
            apiKey: decryptedKey || '',
            showApiKeyInput: !decryptedKey,
        }));
    } catch {
        set(apiKeyAtom, '');
    }
});

// Atom for saving API key
export const saveApiKeyAtom = atom(null, async (_get, set, value: string) => {
    await storeEncryptedApiKey(value); // Empty string will remove from localStorage
    set(apiKeyAtom, value);
    set(localStateAtom, prev => ({
        ...prev,
        apiKey: value,
        showApiKeyInput: !value, // Show input if value is empty
    }));
});

// ===== Local State Operation Atoms =====
// Session state update (local state only)
export const updateSessionAtom = atom(
    null,
    (get, set, { chatId, updates }: { chatId: string; updates: Partial<LocalState['sessions'][string]> }) => {
        const localState = get(localStateAtom);
        const session = localState.sessions[chatId];

        if (!session) return;

        set(localStateAtom, {
            ...localState,
            sessions: {
                ...localState.sessions,
                [chatId]: { ...session, ...updates },
            },
        });
    }
);

// ===== View Mode Atom =====
// Manages the current view mode for the main content area
export const viewModeAtom = atom<'chat' | 'dashboard-list' | 'dashboard'>('chat');

// ===== Chat Mode Atom =====
// Manages the chat interface mode (normal or simple)
export const chatModeAtom = atom<'normal' | 'simple'>('normal');
