import { useAtomValue, useSetAtom } from 'jotai';
import { Loader2, Play } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { createTableFromUrl, executeQuery, type QueryResult } from '@/lib/duckdb/db';
import { useDuckDB } from '@/lib/duckdb/useDuckDB';
import { refreshTablesAtom, tablesAtom } from '@/store/atoms';

const MAX_DISPLAY_ROWS = 500;
const SAMPLE_URL = `${import.meta.env.BASE_URL}data/japan_cities.parquet`;

/** True when the statement is not a plain read (used to trigger a table refresh). */
function isMutation(sql: string): boolean {
    const head = sql.trim().replace(/^\(+/, '').slice(0, 12).toUpperCase();
    return !(head.startsWith('SELECT') || head.startsWith('WITH') || head.startsWith('DESCRIBE'));
}

function formatCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

export function SqlPanel() {
    const { status, error: initError } = useDuckDB();
    const tables = useAtomValue(tablesAtom);
    const refreshTables = useSetAtom(refreshTablesAtom);

    const [sql, setSql] = useState('SELECT 1 AS hello;');
    const [result, setResult] = useState<QueryResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [running, setRunning] = useState(false);

    // Import form state.
    const [importUrl, setImportUrl] = useState('');
    const [importName, setImportName] = useState('');
    const [importing, setImporting] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    useEffect(() => {
        if (status === 'ready') void refreshTables();
    }, [status, refreshTables]);

    const run = useCallback(async () => {
        const trimmed = sql.trim();
        if (!trimmed || running) return;
        setRunning(true);
        setError(null);
        try {
            const res = await executeQuery(trimmed);
            setResult(res);
            if (isMutation(trimmed)) await refreshTables();
        } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
            setResult(null);
        } finally {
            setRunning(false);
        }
    }, [sql, running, refreshTables]);

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            void run();
        }
    };

    const importFromUrl = useCallback(async () => {
        if (!importUrl.trim() || !importName.trim() || importing) return;
        setImporting(true);
        setImportError(null);
        try {
            await createTableFromUrl(importUrl.trim(), importName.trim());
            await refreshTables();
            setImportUrl('');
            setImportName('');
        } catch (e) {
            setImportError(e instanceof Error ? e.message : String(e));
        } finally {
            setImporting(false);
        }
    }, [importUrl, importName, importing, refreshTables]);

    if (status === 'initializing') {
        return (
            <div className="text-muted-foreground flex h-full items-center justify-center gap-2 text-sm">
                <Loader2 className="size-4 animate-spin" />
                Initializing DuckDB…
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="text-destructive flex h-full items-center justify-center p-8 text-center text-sm">
                Failed to initialize DuckDB: {initError}
            </div>
        );
    }

    return (
        <div className="flex h-full min-h-0 flex-col gap-3 p-3">
            {/* Import from URL */}
            <div className="flex flex-col gap-2 rounded-md border p-3">
                <div className="flex flex-wrap items-end gap-2">
                    <div className="flex min-w-48 flex-1 flex-col gap-1">
                        <label className="text-muted-foreground text-xs">File URL</label>
                        <Input
                            value={importUrl}
                            onChange={e => setImportUrl(e.target.value)}
                            placeholder="https://…/data.parquet"
                            className="h-8"
                        />
                    </div>
                    <div className="flex w-40 flex-col gap-1">
                        <label className="text-muted-foreground text-xs">Table name</label>
                        <Input
                            value={importName}
                            onChange={e => setImportName(e.target.value)}
                            placeholder="my_table"
                            className="h-8"
                        />
                    </div>
                    <Button size="sm" onClick={() => void importFromUrl()} disabled={importing}>
                        {importing && <Loader2 className="animate-spin" />}
                        Import from URL
                    </Button>
                </div>
                <p className="text-muted-foreground text-xs">
                    Try the bundled sample:{' '}
                    <button
                        type="button"
                        className="text-primary underline underline-offset-2"
                        onClick={() => {
                            setImportUrl(SAMPLE_URL);
                            setImportName('japan_cities');
                        }}
                    >
                        {SAMPLE_URL}
                    </button>
                </p>
                {importError && <p className="text-destructive text-xs">{importError}</p>}
            </div>

            {/* Table list */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-muted-foreground text-xs">Tables:</span>
                {tables.length === 0 ? (
                    <span className="text-muted-foreground text-xs italic">none yet</span>
                ) : (
                    tables.map(name => (
                        <button
                            key={name}
                            type="button"
                            className="bg-secondary text-secondary-foreground hover:bg-secondary/80 rounded px-2 py-0.5 font-mono text-xs"
                            onClick={() => setSql(`SELECT * FROM "${name}" LIMIT 100`)}
                        >
                            {name}
                        </button>
                    ))
                )}
            </div>

            {/* Editor */}
            <div className="flex flex-col gap-2">
                <Textarea
                    value={sql}
                    onChange={e => setSql(e.target.value)}
                    onKeyDown={onKeyDown}
                    spellCheck={false}
                    className="min-h-24 font-mono text-sm"
                    placeholder="Write SQL, then press Run (Cmd/Ctrl+Enter)"
                />
                <div className="flex items-center gap-3">
                    <Button size="sm" onClick={() => void run()} disabled={running}>
                        {running ? <Loader2 className="animate-spin" /> : <Play />}
                        Run
                    </Button>
                    <span className="text-muted-foreground text-xs">Cmd/Ctrl+Enter</span>
                    {error ? (
                        <span className="text-destructive text-xs">{error}</span>
                    ) : result ? (
                        <span className="text-muted-foreground text-xs">
                            {result.rowCount} row{result.rowCount === 1 ? '' : 's'} in {result.durationMs.toFixed(1)} ms
                        </span>
                    ) : null}
                </div>
            </div>

            {/* Results */}
            <div className="min-h-0 flex-1 overflow-auto rounded-md border">
                {result && result.columns.length > 0 ? (
                    <table className="w-full border-collapse text-sm">
                        <thead className="bg-muted sticky top-0">
                            <tr>
                                {result.columns.map(col => (
                                    <th
                                        key={col.name}
                                        className="border-b px-3 py-1.5 text-left font-medium whitespace-nowrap"
                                    >
                                        <span>{col.name}</span>
                                        <span className="text-muted-foreground ml-1 text-xs font-normal">
                                            {col.type}
                                        </span>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {result.rows.slice(0, MAX_DISPLAY_ROWS).map((row, i) => (
                                <tr key={i} className="hover:bg-muted/50">
                                    {result.columns.map(col => (
                                        <td
                                            key={col.name}
                                            className="border-b px-3 py-1 font-mono text-xs whitespace-nowrap"
                                        >
                                            {formatCell(row[col.name])}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="text-muted-foreground flex h-full items-center justify-center text-sm">
                        {result ? 'Statement executed (no result set).' : 'Run a query to see results.'}
                    </div>
                )}
                {result && result.rowCount > MAX_DISPLAY_ROWS && (
                    <div className="text-muted-foreground bg-muted/50 border-t px-3 py-1.5 text-xs">
                        Showing first {MAX_DISPLAY_ROWS} of {result.rowCount} rows.
                    </div>
                )}
            </div>
        </div>
    );
}
