import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { addTableHistoryAtom } from '../../../store/derivedAtoms';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { SQLHistoryEntry } from '../../../lib/duckdb/sqlHistoryManager';
import {
    buildSingleCreateSqlForTarget,
    extractTableDependencies,
    getCreatedTableName,
} from '../../../utils/mergedSqlBuilder';

// Extract first http(s) URL embedded in a SQL string (e.g., FROM 'https://...', read_csv_auto('https://...'), ST_Read('https://...'))
function extractHttpUrlFromSQL(sql: string): string | undefined {
    const m = sql.match(/'(https?:\/\/[^']+)'/i);
    return m?.[1];
}

export function useTableHistorySync(dbContext: DBContext | null, selectedChatId: string | null) {
    const addTableHistory = useSetAtom(addTableHistoryAtom);
    const lastProcessedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!dbContext || !selectedChatId) {
            return;
        }

        // Process existing history on mount
        const processHistory = () => {
            const history = dbContext.getSQLHistory().getAllHistory();

            // Process only CREATE TABLE entries
            // Build a list of all CREATE TABLE SQLs grouped by schema for mergedSql composition
            const entries = Array.from(history.values());
            const bySchema = new Map<string | null, string[]>();
            const namesBySchema = new Map<string | null, Set<string>>();
            for (const e of entries) {
                const schemaKey = e.schema ?? null;
                const arr = bySchema.get(schemaKey) || [];
                arr.push(e.sql);
                bySchema.set(schemaKey, arr);
                // Track names in this schema for dependency filtering
                const names = namesBySchema.get(schemaKey) || new Set<string>();
                const name = getCreatedTableName(e.sql);
                if (name) names.add(name.toLowerCase());
                namesBySchema.set(schemaKey, names);
            }

            history.forEach((entry: SQLHistoryEntry) => {
                if (entry.tableName && entry.sql) {
                    // Create a unique key for this entry
                    const entryKey = `${entry.tableName}-${entry.timestamp}`;

                    // Skip if we've already processed this entry
                    if (lastProcessedRef.current.has(entryKey)) {
                        return;
                    }

                    // Add to processed set
                    lastProcessedRef.current.add(entryKey);

                    // Build merged SQL that reproduces this table without intermediates
                    let mergedSql = entry.sql;
                    try {
                        const schemaKey = entry.schema ?? null;
                        const sqlsInSchema = bySchema.get(schemaKey) || [];
                        mergedSql = buildSingleCreateSqlForTarget(entry.tableName, sqlsInSchema);
                    } catch (err) {
                        // Fallback to original SQL if merge fails
                        console.warn('Failed to compose mergedSql for table', entry.tableName, err);
                        mergedSql = entry.sql;
                    }

                    // Derive dependencies within the same schema (normalize to lowercase, base table name)
                    let dependencies: string[] = [];
                    try {
                        const depsRaw = extractTableDependencies(entry.sql);
                        const inSchema = namesBySchema.get(entry.schema ?? null) || new Set<string>();
                        dependencies = depsRaw
                            .map(d => d.split('.').pop() || d)
                            .map(d => d.toLowerCase())
                            .filter(d => inSchema.has(d));
                    } catch {
                        dependencies = [];
                    }

                    // Add to Jotai state
                    const fileUrl = extractHttpUrlFromSQL(entry.sql);
                    addTableHistory({
                        chatId: selectedChatId,
                        record: {
                            tableName: entry.tableName,
                            sql: entry.sql,
                            mergedSql,
                            createdAt: new Date(entry.timestamp),
                            source: entry.source === 'remote-file' ? 'file' : entry.source === 'ai-chat' ? 'ai' : 'sql',
                            fileUrl, // Extracted from SQL if present (RemoteFile case)
                            schema: entry.schema ?? null,
                            dependencies,
                        },
                    });
                }
            });
        };

        // Subscribe to SQL history changes
        const unsubscribe = dbContext.getSQLHistory().subscribe(() => {
            processHistory();
        });

        // Process existing history immediately on mount
        processHistory();

        // Clear processed entries when chat changes
        // Copy the ref to a local variable to avoid the warning
        const processedSet = lastProcessedRef.current;
        return () => {
            unsubscribe();
            processedSet.clear();
        };
    }, [dbContext, selectedChatId, addTableHistory]);
}
