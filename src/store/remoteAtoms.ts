import { atom } from 'jotai';
import type { StructuredMessage } from '../types/message';
import type { TableStyle } from '../components/map';
import type { ChartSpec } from '../types/chart';
import type { StyleSpecification } from 'maplibre-gl';
import type { Layout } from 'react-grid-layout';

// ===== Remote state type definitions (server sync target) =====
export interface Table {
  tableName: string;
  sql: string;
  mergedSql: string; // SQL to reproduce the table without intermediate tables
  createdAt: Date;
  source: 'file' | 'sql' | 'ai';  // File upload, direct SQL execution, AI generated
  fileUrl?: string;  // URL for file upload
  schema?: string | null; // Schema where the table resides
  dependencies: string[]; // Dependent table names (normalized, same schema)
}

// For backward compatibility
export type TableCreationRecord = Table;

// Map specification per table
export interface MapSpec {
  style?: StyleSpecification;  // Base style (replaces extraStyle)
  tableStyles?: Record<string, TableStyle>;  // Table-specific styles to be combined with base style
}

// Dashboard visualization
export interface DashboardVisualization {
  id: string;
  type: 'chart' | 'map' | 'table';
  title: string;
  chartSpec?: ChartSpec;
  mapSpec?: MapSpec;
  tableName?: string; // Table name for map/table visualizations
  geometryColumn?: string; // Geometry column for map visualizations
  sql?: string; // SQL query used to generate the visualization
  createdAt: Date;
}

// Dashboard
export interface Dashboard {
  id: string;
  title: string;
  createdAt: Date;
  visualizations: DashboardVisualization[];
  layout: Layout[];
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
  dashboards: Record<string, Dashboard>;  // Dashboard storage
}

// ===== Remote State Atoms =====
// For server sync (not using atomWithStorage)
export const remoteStateAtom = atom<RemoteState>({
  chats: {},
  dashboards: {}
});

// Derived atom (read-only)
export const chatsAtom = atom((get) => get(remoteStateAtom).chats);

// Dashboard atoms
export const dashboardsAtom = atom((get) => get(remoteStateAtom).dashboards);

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


// Monitoring atom for sync (remote state only)
export const remoteStateForSyncAtom = atom((get) => get(remoteStateAtom));
