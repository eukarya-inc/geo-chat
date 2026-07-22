import { atom } from 'jotai';

import { getTables } from '@/lib/duckdb/db';
import type { TableMapStyle } from '@/lib/map/mapSpec';

/** Names of user tables currently in the `main` schema. */
export const tablesAtom = atom<string[]>([]);

/** The table currently being visualized; shared by the Table/Chart/Map tabs. */
export const selectedTableAtom = atom<string | null>(null);

/**
 * Per-table Vega-Lite spec WITHOUT `data`/`width`/`height` (those are injected
 * at render time). Keyed by table name.
 */
export const chartSpecsAtom = atom<Record<string, object>>({});

/** Per-table declarative map style. Keyed by table name. */
export const mapStylesAtom = atom<Record<string, TableMapStyle>>({});

/**
 * Write-only atom: re-queries DuckDB, refreshes `tablesAtom`, and reconciles the
 * selection — auto-selecting the first table when nothing is selected and
 * clearing/reselecting when the selected table no longer exists.
 */
export const refreshTablesAtom = atom(null, async (get, set) => {
    const tables = await getTables();
    set(tablesAtom, tables);

    const selected = get(selectedTableAtom);
    if (tables.length === 0) {
        if (selected !== null) set(selectedTableAtom, null);
    } else if (!selected || !tables.includes(selected)) {
        set(selectedTableAtom, tables[0]);
    }
});
