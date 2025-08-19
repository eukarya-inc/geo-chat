import { useState, useEffect, useCallback } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { Chat } from '../../../components/chat/ChatList';

export function useTableSelection(
    dbContext: DBContext | null,
    selectedChatId: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null,
    setConnectionTimestamp: React.Dispatch<React.SetStateAction<number>>,
    updateChatState: (updates: Partial<Chat>) => void
) {
    const [selectedTable, setSelectedTable] = useState<string | null>(null);

    // Handle table selection and update chat state
    const handleTableSelection = useCallback((tableName: string | null) => {
        setSelectedTable(tableName);
        
        // Update the selected table in the current chat
        if (selectedChatId && tableName !== undefined) {
            updateChatState({ selectedTable: tableName });
        }
    }, [selectedChatId, updateChatState]);

    // Subscribe to table changes from dbContext
    useEffect(() => {
        if (!dbContext) return;

        const unsubscribe = dbContext.onTableChange(async (tableName?: string, schema?: string | null) => {
            // Only process table changes for the current chat's schema
            if (schema !== selectedChatId) {
                return;
            }

            // Force consistency across all connections
            try {
                await dbContext.forceConsistency();
            } catch {
                // Error forcing consistency
            }

            // Auto-select the newly created table with a delay to ensure data is ready
            if (tableName) {
                // Wait longer for the table data to be fully committed and visible
                setTimeout(() => {
                    handleTableSelection(tableName);
                    // Force a connection timestamp update to refresh the Table component
                    setConnectionTimestamp(Date.now());
                }, 800);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [dbContext, handleTableSelection, selectedChatId, setConnectionTimestamp]);

    // Clear selected table when switching chats
    useEffect(() => {
        if (!connection) {
            setSelectedTable(null);
        }
    }, [connection]);

    return {
        selectedTable,
        setSelectedTable,
        handleTableSelection,
    };
}