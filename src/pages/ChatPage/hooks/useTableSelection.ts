import { useState, useEffect, useCallback } from 'react';
import { useSetAtom, useAtomValue } from 'jotai';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import { selectTableAtom, currentChatAtom } from '../../../store/atoms';

export function useTableSelection(
    dbContext: DBContext | null,
    schemaName: string | null,
    connection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null
) {
    const [selectedTable, setSelectedTable] = useState<string | null>(null);
    const [prevSchemaName, setPrevSchemaName] = useState<string | null>(null);
    const setTableInAtom = useSetAtom(selectTableAtom);
    const currentChat = useAtomValue(currentChatAtom);

    // Clear selected table immediately when schema changes
    useEffect(() => {
        if (prevSchemaName !== schemaName && prevSchemaName !== null) {
            // Schema has changed, immediately clear the selected table
            setSelectedTable(null);
        }
        setPrevSchemaName(schemaName);
    }, [schemaName, prevSchemaName]);

    // Handle table selection and update both local state and Jotai atom
    const handleTableSelection = useCallback((tableName: string | null) => {
        setSelectedTable(tableName);
        
        // Update the selected table in Jotai atom
        if (schemaName) {
            setTableInAtom(tableName);
        }
    }, [schemaName, setTableInAtom]);

    // Subscribe to table changes from dbContext
    useEffect(() => {
        if (!dbContext) return;

        const unsubscribe = dbContext.onTableChange(async (tableName?: string, schema?: string | null) => {
            // Only process table changes for the current schema
            if (schema !== schemaName) {
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
                }, 800);
            }
        });

        return () => {
            unsubscribe();
        };
    }, [dbContext, handleTableSelection, schemaName]);

    // Restore selected table when switching chats (only after connection is ready)
    useEffect(() => {
        const restoreTableSelection = async () => {
            // Only restore if we have a connection and this is the right chat
            if (connection && currentChat && `chat_${currentChat.id.replace(/[^a-zA-Z0-9]/g, '_')}` === schemaName && dbContext) {
                if (currentChat.selectedTable) {
                    // Check if the table actually exists in this schema
                    try {
                        const isValid = await dbContext.validateTable(currentChat.selectedTable, schemaName);
                        if (isValid) {
                            // Table exists, restore the selection
                            setSelectedTable(currentChat.selectedTable);
                        } else {
                            // Table doesn't exist in this schema, clear selection
                            setSelectedTable(null);
                            setTableInAtom(null);
                        }
                    } catch (error) {
                        console.log('Error validating table during restoration:', error);
                        setSelectedTable(null);
                        setTableInAtom(null);
                    }
                } else {
                    // No saved table for this chat
                    setSelectedTable(null);
                }
            }
        };

        restoreTableSelection();
    }, [connection, currentChat, dbContext, schemaName, setTableInAtom]);

    return {
        selectedTable,
        setSelectedTable,
        handleTableSelection,
    };
}