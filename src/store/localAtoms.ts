import { atom } from 'jotai';
// import { atomWithStorage } from 'jotai/utils';
import { retrieveEncryptedApiKey, storeEncryptedApiKey } from '../utils/encryption';

// ===== Local state type definitions (client-side only) =====
export interface LocalState {
    selectedChatId: string | null;
    selectedDashboardId: string | null;

    // API key (saved locally for security)
    apiKey: string;
    showApiKeyInput: boolean;

    // AI sessions (temporary execution state)
    sessions: Record<
        string,
        {
            isLoading: boolean;
            error: Error | null;
            input: string;
            streamingText: string;
        }
    >;
}

// ===== Local State Atoms =====
// Local persistence (localStorage) temporarily disabled
// export const localStateAtom = atomWithStorage<LocalState>('links-bi-local-state', {
export const localStateAtom = atom<LocalState>({
    selectedChatId: null,
    selectedDashboardId: null,
    apiKey: '',
    showApiKeyInput: true,
    sessions: {},
});

// API key dedicated atom (encrypted and managed separately)
// Note: Jotai v2 doesn't support async storage, so wrapped synchronously
export const apiKeyAtom = atom<string>('');

// Effect atom for API key initialization
export const initApiKeyAtom = atom(null, async (get, set) => {
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
export const saveApiKeyAtom = atom(null, async (get, set, value: string) => {
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
export const viewModeAtom = atom<'chat-list' | 'chat' | 'dashboard-list' | 'dashboard'>('chat');
