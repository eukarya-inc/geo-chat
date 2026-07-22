import { useAtomValue } from 'jotai';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useMemo, useRef, useState } from 'react';

import { executeQuery, type QueryColumn } from '@/lib/duckdb/db';
import { selectedTableAtom } from '@/store/atoms';
import { NoTableHint, TablePicker } from './TablePicker';

const ROW_LIMIT = 10000;
const ROW_HEIGHT = 28;
const MIN_COL_WIDTH = 140;

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function TablePanel() {
    const table = useAtomValue(selectedTableAtom);
    const [columns, setColumns] = useState<QueryColumn[]>([]);
    const [rows, setRows] = useState<Record<string, unknown>[]>([]);
    const [error, setError] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!table) {
            setColumns([]);
            setRows([]);
            return;
        }
        let cancelled = false;
        setError(null);
        executeQuery(`SELECT * FROM "${table}" LIMIT ${ROW_LIMIT}`)
            .then(res => {
                if (cancelled) return;
                setColumns(res.columns);
                setRows(res.rows);
            })
            .catch(e => {
                if (cancelled) return;
                setError(e instanceof Error ? e.message : String(e));
            });
        return () => {
            cancelled = true;
        };
    }, [table]);

    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20,
    });

    const gridStyle = useMemo(
        () => ({ gridTemplateColumns: `repeat(${columns.length}, minmax(${MIN_COL_WIDTH}px, 1fr))` }),
        [columns.length]
    );

    if (!table) return <NoTableHint />;

    return (
        <div className="flex h-full min-h-0 flex-col gap-2 p-3">
            <div className="flex items-center justify-between">
                <TablePicker />
                <span className="text-muted-foreground text-xs">
                    {rows.length} row{rows.length === 1 ? '' : 's'}
                    {rows.length >= ROW_LIMIT ? ' (capped)' : ''}
                </span>
            </div>

            {error ? (
                <div className="text-destructive p-4 text-sm">{error}</div>
            ) : (
                <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto rounded-md border">
                    <div className="min-w-max">
                        {/* Header */}
                        <div className="bg-muted sticky top-0 z-10 grid" style={gridStyle}>
                            {columns.map(col => (
                                <div key={col.name} className="border-b px-3 py-1.5 font-medium whitespace-nowrap">
                                    <span className="text-sm">{col.name}</span>
                                    <span className="text-muted-foreground ml-1 text-xs font-normal">{col.type}</span>
                                </div>
                            ))}
                        </div>
                        {/* Virtualized rows */}
                        <div style={{ height: `${virtualizer.getTotalSize()}px`, position: 'relative' }}>
                            {virtualizer.getVirtualItems().map(item => {
                                const row = rows[item.index];
                                return (
                                    <div
                                        key={item.key}
                                        className="hover:bg-muted/50 absolute grid w-full"
                                        style={{
                                            ...gridStyle,
                                            top: 0,
                                            transform: `translateY(${item.start}px)`,
                                            height: `${ROW_HEIGHT}px`,
                                        }}
                                    >
                                        {columns.map(col => (
                                            <div
                                                key={col.name}
                                                className="truncate border-b px-3 py-1 font-mono text-xs"
                                                title={formatCell(row[col.name])}
                                            >
                                                {formatCell(row[col.name])}
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
