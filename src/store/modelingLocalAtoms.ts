import { atom } from 'jotai';
// import { atomWithStorage } from 'jotai/utils';
import { retrieveEncryptedApiKey, storeEncryptedApiKey } from '../utils/encryption';

// ===== ローカル状態の型定義（クライアント完結） =====
export interface LocalState {
  selectedChatId: string | null;
  
  // APIキー（セキュリティのためローカル保存）
  apiKey: string;
  showApiKeyInput: boolean;
  
  // AIセッション（一時的な実行状態）
  sessions: Record<string, {
    isLoading: boolean;
    error: Error | null;
    input: string;
    streamingText: string;
  }>;
  
  // UI表示設定（ユーザー環境依存）
  ui: {
    showSQL: boolean;
    sqlAreaHeight: number;
    tableAreaHeight: number;
  };
}

// ===== ローカル状態Atoms =====
// ローカル永続化（localStorage使用）を一旦無効化
// export const localStateAtom = atomWithStorage<LocalState>('links-bi-local-state', {
export const localStateAtom = atom<LocalState>({
  selectedChatId: null,
  apiKey: '',
  showApiKeyInput: true,
  sessions: {},
  ui: {
    showSQL: false,
    sqlAreaHeight: 200,
    tableAreaHeight: 300
  }
});

// APIキー専用atom（暗号化して別管理）
// 注: Jotai v2では非同期ストレージはサポートされていないため、同期的にラップ
export const apiKeyAtom = atom<string>('');

// APIキー初期化用のeffect atom
export const initApiKeyAtom = atom(
  null,
  async (get, set) => {
    try {
      const decryptedKey = await retrieveEncryptedApiKey();
      set(apiKeyAtom, decryptedKey || '');
      set(localStateAtom, prev => ({
        ...prev,
        apiKey: decryptedKey || '',
        showApiKeyInput: !decryptedKey
      }));
    } catch {
      set(apiKeyAtom, '');
    }
  }
);

// APIキー保存用atom
export const saveApiKeyAtom = atom(
  null,
  async (get, set, value: string) => {
    await storeEncryptedApiKey(value); // Empty string will remove from localStorage
    set(apiKeyAtom, value);
    set(localStateAtom, prev => ({
      ...prev,
      apiKey: value,
      showApiKeyInput: !value // Show input if value is empty
    }));
  }
);

// ===== ローカル状態操作用Atoms =====
// UI状態更新（ローカル状態のみ）
export const updateUIStateAtom = atom(
  null,
  (get, set, updates: Partial<LocalState['ui']>) => {
    const localState = get(localStateAtom);
    set(localStateAtom, {
      ...localState,
      ui: {
        ...localState.ui,
        ...updates
      }
    });
  }
);

// セッション状態更新（ローカル状態のみ）
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
        [chatId]: { ...session, ...updates }
      }
    });
  }
);