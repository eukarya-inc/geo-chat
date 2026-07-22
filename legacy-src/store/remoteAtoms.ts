import { atom } from 'jotai';
import type { StructuredMessage } from '../types/message';
import type { TableStyle as MapTableStyle } from '../components/map';
import type { ChartSpec } from '../types/chart';
import type { TableSpec } from '../types/table';
import type { StyleSpecification } from 'maplibre-gl';
import type { Layout } from 'react-grid-layout';

// ===== Type aliases for clarity =====
// Key for chart/map specs: table name (e.g., "scatter_driver_ratio", "regression_analysis")
export type TableName = string;

// Chart specifications per table
// Future: May be extended to ChartSpec[] for history support
export type ChartSpecs = Record<TableName, ChartSpec>;

// Map specifications per table
export type MapSpecs = Record<TableName, MapSpec>;

// Table specifications per table
export type TableSpecs = Record<TableName, TableSpec>;

// ===== Remote state type definitions (server sync target) =====
export interface Table {
    tableName: string;
    sql: string;
    mergedSql: string; // SQL to reproduce the table without intermediate tables
    createdAt: Date;
    source: 'file' | 'sql' | 'ai'; // File upload, direct SQL execution, AI generated
    fileUrl?: string; // URL for file upload
    schema?: string | null; // Schema where the table resides
    dependencies: string[]; // Dependent table names (normalized, same schema)
}

// For backward compatibility
export type TableCreationRecord = Table;

// Map specification per table
export interface MapSpec {
    title?: string; // Display title for the map
    style?: StyleSpecification; // Base style (replaces extraStyle)
    tableStyles?: Record<string, MapTableStyle>; // Table-specific styles to be combined with base style
}

export type TableStyle = MapTableStyle;

// Dashboard visualization
export interface DashboardVisualization {
    id: string;
    type: 'chart' | 'map' | 'table';
    title: string;
    chartSpec?: ChartSpec;
    mapSpec?: MapSpec;
    // Note: Currently tableId serves the same purpose as tableName (e.g., "table_36dd7").
    // It is named "tableId" to allow for future extensibility where a separate displayName
    // or user-friendly table name might be introduced, while tableId remains the internal identifier.
    tableId?: string; // Table identifier for map/table visualizations
    geometryColumn?: string; // Geometry column for map visualizations
    sql?: string; // SQL query used to generate the visualization
    createdAt: Date;
    chatId: string; // Chat ID (format: "chat_{timestamp}") which also serves as the DuckDB schema name
}

// Dashboard
export interface Dashboard {
    id: string;
    title: string;
    createdAt: Date;
    visualizations: DashboardVisualization[];
    layout: Layout[];
    responsive?: boolean;
}

// Consolidated Chat type that includes both metadata and state
export interface Chat {
    id: string;
    title: string;
    createdAt: Date;
    selectedTable: string | null;
    isTitleDefault?: boolean; // True if title is still the default "Chat N" pattern (not customized by user or AI)

    // State fields (previously in ChatState)
    messages: StructuredMessage[];
    tables: Record<string, Table>; // Changed from tableHistory array to tables Record
    chartSpecs?: ChartSpecs; // Chart specs per table (e.g., scatter plots for each explanatory variable)
    mapSpecs?: MapSpecs; // Map styles per table
    tableSpecs?: TableSpecs; // Table specs per table (for dashboard export)
    chartUserDeleted?: string[]; // List of table keys (schema-table) where user deleted charts
}

// ChatState is now just an alias for backward compatibility during migration
export type ChatState = Omit<Chat, 'id' | 'title' | 'createdAt' | 'selectedTable'>;

// ChatStateUpdate allows null values for deletion (used in updateChatStateAtom)
export type ChatStateUpdate = Partial<Omit<ChatState, 'chartSpecs' | 'mapSpecs' | 'tableSpecs'>> & {
    chartSpecs?: Record<TableName, ChartSpec | null>; // ChartSpec | null for deletion support
    mapSpecs?: MapSpecs;
    tableSpecs?: Record<TableName, TableSpec | null>; // TableSpec | null for deletion support
};

export interface RemoteState {
    chats: Record<string, Chat>; // Changed from Chat[] to Record<string, Chat>
    dashboards: Record<string, Dashboard>; // Dashboard storage
}

// ===== Remote State Atoms =====
// For server sync (not using atomWithStorage)
export const remoteStateAtom = atom<RemoteState>({
    chats: {},
    dashboards: {},
});

// Derived atom (read-only)
export const chatsAtom = atom(get => get(remoteStateAtom).chats);

// Dashboard atoms
export const dashboardsAtom = atom(get => get(remoteStateAtom).dashboards);

// For backward compatibility - returns chat states keyed by ID
export const chatStatesAtom = atom(get => {
    const chats = get(remoteStateAtom).chats;
    const states: Record<string, ChatState> = {};
    for (const [id, chat] of Object.entries(chats)) {
        states[id] = {
            messages: chat.messages,
            tables: chat.tables,
            chartSpecs: chat.chartSpecs,
            mapSpecs: chat.mapSpecs,
            tableSpecs: chat.tableSpecs,
            chartUserDeleted: chat.chartUserDeleted,
        };
    }
    return states;
});

// Monitoring atom for sync (remote state only)
export const remoteStateForSyncAtom = atom(get => get(remoteStateAtom));
