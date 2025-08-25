import { atom } from 'jotai';
import type { StructuredMessage } from '../types/message';
import type { TableStyle } from '../components/map';
import type { ChartSpec } from '../types/chart';
import type { StyleSpecification } from 'maplibre-gl';

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

// Map specification per table
export interface MapSpec {
  style?: StyleSpecification;  // Base style (replaces extraStyle)
  tableStyles?: Record<string, TableStyle>;  // Table-specific styles to be combined with base style
}

export interface ChatState {
  messages: StructuredMessage[];

  // テーブル作成履歴
  tableHistory: TableCreationRecord[];

  // グラフチャット用
  chartSpecs?: Record<string, ChartSpec>;

  // 地図設定（テーブルごとに保存）
  mapSpecs?: Record<string, MapSpec>;
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
