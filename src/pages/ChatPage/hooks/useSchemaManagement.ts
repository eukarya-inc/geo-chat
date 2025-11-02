import { useEffect, useRef } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { Chat, ChartSpecs } from '../../../store/remoteAtoms';
import { cleanupOrphanedChartSpecs } from './chartSpecCleanup';

export function useSchemaManagement(
    dbContext: DBContext | null,
    chatId: string | null,
    chats: Chat[],
    onChartSpecCleanup?: (cleanedChartSpecs: ChartSpecs) => void
) {
    const connectionRef = useRef<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);

    // Combined schema switching and connection setup
    useEffect(() => {
        if (!dbContext || !chatId) return;

        let isCleanedUp = false;

        const switchSchemaAndConnect = async () => {
            // First close any existing connection from ref
            if (connectionRef.current) {
                try {
                    await connectionRef.current.close();
                } catch (e) {
                    console.error('Error closing previous connection:', e);
                }
                connectionRef.current = null;
            }

            // Wait a bit longer to ensure all connections are fully closed
            await new Promise(resolve => setTimeout(resolve, 200));

            try {
                // Create new connection with the new schema
                const conn = await dbContext.createManagedConnection(chatId);
                connectionRef.current = conn;

                if (!isCleanedUp) {
                    // Ensure connection is fully ready before using it
                    await new Promise(resolve => setTimeout(resolve, 100));

                    // Restore table selection for this chat
                    const targetChat = chats.find(chat => chat.id === chatId);
                    if (targetChat?.selectedTable) {
                        try {
                            // Check if table exists in this schema
                            await conn.query(`SELECT 1 FROM "${targetChat.selectedTable}" LIMIT 0`);
                            // Table exists, will be restored by useTableSelection hook
                        } catch {
                            // Table not found in schema, clear it
                            console.log(`Table ${targetChat.selectedTable} not found in schema ${chatId}`);
                        }
                    }

                    // Notify table change after connection is established with a longer delay
                    if (dbContext) {
                        setTimeout(() => {
                            dbContext.notifyTableChange(undefined, chatId);
                        }, 500);
                    }

                    // Clean up orphaned chartSpecs for tables that no longer exist
                    if (onChartSpecCleanup) {
                        const targetChat = chats.find(chat => chat.id === chatId);
                        // Type guard: check if targetChat has chartSpecs property
                        if (targetChat && 'chartSpecs' in targetChat && targetChat.chartSpecs) {
                            const cleanedChartSpecs = await cleanupOrphanedChartSpecs(
                                targetChat.chartSpecs as ChartSpecs,
                                dbContext,
                                chatId
                            );
                            if (Object.keys(cleanedChartSpecs).length !== Object.keys(targetChat.chartSpecs).length) {
                                onChartSpecCleanup(cleanedChartSpecs);
                            }
                        }
                    }
                } else {
                    // Component unmounted before we could set state, close connection immediately
                    conn.close().catch(e => {
                        console.error('Error closing connection after unmount:', e);
                    });
                    connectionRef.current = null;
                }
            } catch (error) {
                console.error('Error switching schema and creating connection:', error);
                connectionRef.current = null;
            }
        };

        switchSchemaAndConnect();

        return () => {
            isCleanedUp = true;
            if (connectionRef.current) {
                connectionRef.current.close().catch(() => {});
                connectionRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [chatId, dbContext]); // Only depend on chatId and dbContext
}
