import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

import { convertArrowToJS } from './arrowConverter';
import { hasBOM, removeBOM } from './bomUtils';
import { extensionForKind, readerCall, readerKindForUrl } from './fileReader';
import { getGlobalDB } from './globalDB';

export interface QueryColumn {
    name: string;
    type: string;
}

export interface QueryResult {
    columns: QueryColumn[];
    rows: Record<string, unknown>[];
    rowCount: number;
    durationMs: number;
}

// One shared connection for the whole app. DuckDB-WASM is effectively
// single-threaded, so we serialize all statements through a promise chain:
// concurrent callers simply await their turn in submission order.
let connPromise: Promise<AsyncDuckDBConnection> | null = null;
let tail: Promise<unknown> = Promise.resolve();

async function getConnection(): Promise<AsyncDuckDBConnection> {
    if (!connPromise) {
        connPromise = getGlobalDB().then(db => db.connect());
    }
    return connPromise;
}

/** Runs `task` after all previously enqueued tasks, regardless of their outcome. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = tail.then(task, task);
    tail = run.then(
        () => undefined,
        () => undefined
    );
    return run;
}

/** Executes a single SQL statement and returns its rows plus timing/metadata. */
export function executeQuery(sql: string): Promise<QueryResult> {
    return enqueue(async () => {
        const conn = await getConnection();
        const start = performance.now();
        const result = await conn.query(sql);
        const durationMs = performance.now() - start;

        const columns: QueryColumn[] =
            result.schema?.fields?.map(f => ({
                name: f.name,
                type: f.type?.toString() ?? '',
            })) ?? [];

        const rows = result.toArray().map(row => convertArrowToJS(row) as Record<string, unknown>);

        return { columns, rows, rowCount: rows.length, durationMs };
    });
}

/**
 * Runs a tile query and returns the raw MVT bytes from its single `mvt` column,
 * bypassing `convertArrowToJS` entirely so the binary blob is never replaced
 * with the `"<geometry>"` placeholder. Uses the same serialization queue as
 * every other statement. Returns null for empty tiles.
 */
export function getTileBytes(sql: string): Promise<Uint8Array | null> {
    return enqueue(async () => {
        const conn = await getConnection();
        const result = await conn.query(sql);
        if (result.numRows === 0) return null;

        const value = result.getChild('mvt')?.get(0) as Uint8Array | null | undefined;
        if (!value || value.length === 0) return null;

        // Copy off any shared/underlying ArrayBuffer to avoid detachment issues.
        return new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength));
    });
}

/** Lists user tables in the `main` schema (internal schemas excluded). */
export async function getTables(): Promise<string[]> {
    const result = await executeQuery(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'main' ORDER BY table_name"
    );
    return result.rows.map(r => String(r.table_name));
}

/** Returns the column names and types of a table. */
export async function getTableSchema(table: string): Promise<QueryColumn[]> {
    const result = await executeQuery(`DESCRIBE "${table.replace(/"/g, '""')}"`);
    return result.rows.map(r => ({
        name: String(r.column_name),
        type: String(r.column_type),
    }));
}

/**
 * Creates a table from a remote file. The bytes are fetched and registered as
 * an in-memory virtual file first, so every format works cross-origin without
 * the httpfs extension. The reader is chosen from the URL's extension.
 */
export async function createTableFromUrl(url: string, tableName: string): Promise<void> {
    const db = await getGlobalDB();
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
    }
    const bytes = new Uint8Array(await response.arrayBuffer());

    const kind = readerKindForUrl(url);
    // Keep the correct extension on the virtual name so GDAL (ST_Read) can pick
    // the right driver by file extension.
    const virtualName = `import_${Date.now()}.${extensionForKind(kind)}`;
    await db.registerFileBuffer(virtualName, bytes);

    try {
        const safeName = tableName.replace(/"/g, '""');
        await executeQuery(`CREATE TABLE "${safeName}" AS SELECT * FROM ${readerCall(kind, virtualName)}`);
        await fixBomColumns(tableName);
    } finally {
        await db.dropFile(virtualName).catch(() => undefined);
    }
}

/** Renames any columns whose names carry a leading BOM (common with CSV). */
async function fixBomColumns(tableName: string): Promise<void> {
    const columns = await getTableSchema(tableName);
    if (!columns.some(c => hasBOM(c.name))) return;

    const safeName = tableName.replace(/"/g, '""');
    const selectList = columns
        .map(c => {
            const clean = removeBOM(c.name);
            return clean !== c.name
                ? `"${c.name.replace(/"/g, '""')}" AS "${clean.replace(/"/g, '""')}"`
                : `"${c.name.replace(/"/g, '""')}"`;
        })
        .join(', ');

    const temp = `${safeName}__bomfix`;
    await executeQuery(`CREATE TABLE "${temp}" AS SELECT ${selectList} FROM "${safeName}"`);
    await executeQuery(`DROP TABLE "${safeName}"`);
    await executeQuery(`ALTER TABLE "${temp}" RENAME TO "${safeName}"`);
}
