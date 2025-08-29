import { useEffect, useRef } from 'react';
import { useSetAtom } from 'jotai';
import { addTableHistoryAtom } from '../../../store/derivedAtoms';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { SQLHistoryEntry } from '../../../lib/duckdb/sqlHistoryManager';

export function useTableHistorySync(
    dbContext: DBContext | null,
    selectedChatId: string | null
) {
    const addTableHistory = useSetAtom(addTableHistoryAtom);
    const lastProcessedRef = useRef<Set<string>>(new Set());

    useEffect(() => {
        if (!dbContext || !selectedChatId) return;

        // Subscribe to SQL history changes
        const unsubscribe = dbContext.getSQLHistory().subscribe(() => {
            const history = dbContext.getSQLHistory().getAllHistory();
            
            // Process only CREATE TABLE entries
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
                    
                    // Add to Jotai state
                    addTableHistory({
                        chatId: selectedChatId,
                        record: {
                            tableName: entry.tableName,
                            sql: entry.sql,
                            createdAt: new Date(entry.timestamp),
                            source: entry.source === 'remote-file' ? 'file' : 
                                    entry.source === 'ai-chat' ? 'ai' : 'sql',
                            fileUrl: undefined // We don't have URL info in SQL history
                        }
                    });
                }
            });
        });

        // Clear processed entries when chat changes
        // Copy the ref to a local variable to avoid the warning
        const processedSet = lastProcessedRef.current;
        return () => {
            unsubscribe();
            processedSet.clear();
        };
    }, [dbContext, selectedChatId, addTableHistory]);
}