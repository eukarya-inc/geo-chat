import { getDefaultStore } from 'jotai';

import type { TableMapStyle } from '@/lib/map/mapSpec';
import {
    activeTabAtom,
    chartSpecsAtom,
    mapStylesAtom,
    refreshTablesAtom,
    selectedTableAtom,
    type WorkspaceTab,
} from '@/store/atoms';

/**
 * The narrow surface the tools use to touch app state. Tools stay framework-free
 * (no React, no jotai imports) and receive this object; `defaultToolContext()`
 * implements it over the global jotai store so a tool call from the agent loop
 * updates the same atoms the UI reads.
 */
export interface ToolContext {
    /** Re-read the DuckDB table list into `tablesAtom` (call after DDL). */
    refreshTables: () => Promise<void>;
    setSelectedTable: (table: string) => void;
    setActiveTab: (tab: WorkspaceTab) => void;
    getChartSpec: (table: string) => object | undefined;
    setChartSpec: (table: string, spec: object) => void;
    getMapStyle: (table: string) => TableMapStyle | undefined;
    setMapStyle: (table: string, style: TableMapStyle) => void;
}

export function defaultToolContext(): ToolContext {
    // The app deliberately uses jotai's DEFAULT store (no <Provider> in main.tsx)
    // so this non-React tool code and the React UI share the exact same atoms.
    // Do NOT introduce a scoped Provider without wiring it here, or tool-driven
    // state changes (setActiveTab, setMapStyle, ...) won't reach the UI.
    const store = getDefaultStore();
    return {
        refreshTables: () => store.set(refreshTablesAtom),
        setSelectedTable: table => store.set(selectedTableAtom, table),
        setActiveTab: tab => store.set(activeTabAtom, tab),
        getChartSpec: table => store.get(chartSpecsAtom)[table],
        setChartSpec: (table, spec) => store.set(chartSpecsAtom, prev => ({ ...prev, [table]: spec })),
        getMapStyle: table => store.get(mapStylesAtom)[table],
        setMapStyle: (table, style) => store.set(mapStylesAtom, prev => ({ ...prev, [table]: style })),
    };
}
