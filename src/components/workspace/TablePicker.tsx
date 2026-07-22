import { useAtom, useAtomValue } from 'jotai';

import { selectedTableAtom, tablesAtom } from '@/store/atoms';

/** Small dropdown, shared by the Table/Chart/Map tabs, for choosing the table to visualize. */
export function TablePicker() {
    const tables = useAtomValue(tablesAtom);
    const [selected, setSelected] = useAtom(selectedTableAtom);

    if (tables.length === 0) return null;

    return (
        <label className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Table</span>
            <select
                value={selected ?? ''}
                onChange={e => setSelected(e.target.value || null)}
                className="border-input bg-background h-8 rounded-md border px-2 font-mono text-xs"
            >
                {tables.map(name => (
                    <option key={name} value={name}>
                        {name}
                    </option>
                ))}
            </select>
        </label>
    );
}

/** Shared empty-state hint shown when no table is available/selected. */
export function NoTableHint() {
    return (
        <div className="text-muted-foreground flex h-full items-center justify-center p-8 text-center text-sm">
            Load data in the SQL tab first.
        </div>
    );
}
