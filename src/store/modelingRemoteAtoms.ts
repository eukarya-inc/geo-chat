import { atom } from 'jotai';
import type { StructuredMessage } from '../types/message';
import type { TableStyle } from '../components/map';
import type { ChartSpec } from '../types/chart';
import type { StyleSpecification } from 'maplibre-gl';

// ===== リモート状態の型定義（サーバー同期対象） =====
export interface Table {
  tableName: string;
  sql: string;
  createdAt: Date;
  source: 'file' | 'sql' | 'ai';  // ファイルアップロード、SQL直接実行、AI生成
  fileUrl?: string;  // ファイルアップロードの場合のURL
}

// For backward compatibility
export type TableCreationRecord = Table;

// Map specification per table
export interface MapSpec {
  style?: StyleSpecification;  // Base style (replaces extraStyle)
  tableStyles?: Record<string, TableStyle>;  // Table-specific styles to be combined with base style
}

// Consolidated Chat type that includes both metadata and state
export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  selectedTable: string | null;
  
  // State fields (previously in ChatState)
  messages: StructuredMessage[];
  tables: Record<string, Table>;  // Changed from tableHistory array to tables Record
  chartSpecs?: Record<string, ChartSpec>;
  mapSpecs?: Record<string, MapSpec>;
}

// ChatState is now just an alias for backward compatibility during migration
export type ChatState = Omit<Chat, 'id' | 'title' | 'createdAt' | 'selectedTable'>;

export interface RemoteState {
  chats: Record<string, Chat>;  // Changed from Chat[] to Record<string, Chat>
}

// ===== リモート状態Atoms =====
// サーバー同期用（atomWithStorageは使わない）
export const remoteStateAtom = atom<RemoteState>({
  chats: {}
});

// 派生atom（読み取り専用）
export const chatsAtom = atom((get) => get(remoteStateAtom).chats);

// For backward compatibility - returns chat states keyed by ID
export const chatStatesAtom = atom((get) => {
  const chats = get(remoteStateAtom).chats;
  const states: Record<string, ChatState> = {};
  for (const [id, chat] of Object.entries(chats)) {
    states[id] = {
      messages: chat.messages,
      tables: chat.tables,
      chartSpecs: chat.chartSpecs,
      mapSpecs: chat.mapSpecs
    };
  }
  return states;
});


// 同期用の監視atom（リモート状態のみ）
export const remoteStateForSyncAtom = atom((get) => get(remoteStateAtom));
