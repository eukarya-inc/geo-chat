import { atom } from 'jotai';
import type { StructuredMessage } from '../types/message';
import type { TableStyle, ExtraStyle } from '../components/map';
import type { ChartSpec } from '../types/chart';

// ===== リモート状態の型定義（サーバー同期対象） =====
export interface Chat {
  id: string;
  title: string;
  createdAt: Date;
  selectedTable: string | null;
}

export interface TableCreationRecord {
  tableName: string;
  sql: string;
  createdAt: Date;
  source: 'file' | 'sql' | 'ai';  // ファイルアップロード、SQL直接実行、AI生成
  fileUrl?: string;  // ファイルアップロードの場合のURL
}

export interface ChatState {
  messages: StructuredMessage[];

  // テーブル作成履歴
  tableHistory: TableCreationRecord[];

  // グラフチャット用（地図も含む）
  chartSpecs?: Record<string, ChartSpec>;
  showGraph?: Record<string, boolean>;  // テーブルごとのグラフ表示状態

  // 地図設定（グラフの一種として統合）
  mapConfig?: {
    center: [number, number];
    zoom: number;
    bearing?: number;
    pitch?: number;
    style?: unknown;
  };
  tableStyles?: Record<string, TableStyle>;
  extraMapStyle?: ExtraStyle;
}

export interface RemoteState {
  chats: Chat[];
  chatStates: Record<string, ChatState>;
}

// ===== リモート状態Atoms =====
// サーバー同期用（atomWithStorageは使わない）
export const remoteStateAtom = atom<RemoteState>({
  chats: [],
  chatStates: {}
});

// 派生atom（読み取り専用）
export const chatsAtom = atom((get) => get(remoteStateAtom).chats);
export const chatStatesAtom = atom((get) => get(remoteStateAtom).chatStates);


// 同期用の監視atom（リモート状態のみ）
export const remoteStateForSyncAtom = atom((get) => get(remoteStateAtom));
