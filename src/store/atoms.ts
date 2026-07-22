import { atom } from 'jotai';

import { getTables } from '@/lib/duckdb/db';

/** Names of user tables currently in the `main` schema. */
export const tablesAtom = atom<string[]>([]);

/** Write-only atom: re-queries DuckDB and refreshes `tablesAtom`. */
export const refreshTablesAtom = atom(null, async (_get, set) => {
    const tables = await getTables();
    set(tablesAtom, tables);
});
