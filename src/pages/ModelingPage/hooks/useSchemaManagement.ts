import { useState, useEffect } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { Chat } from '../../../components/chat/ChatList';

export function useSchemaManagement(
    dbContext: DBContext | null,
    selectedChatId: string | null,
    chats: Chat[]
) {
    const [connection, setConnection] = useState<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);
    const [connectionTimestamp, setConnectionTimestamp] = useState<number>(Date.now());

    // Combined schema switching and connection setup
    useEffect(() => {
        if (!dbContext || !selectedChatId) return;

        let currentConnection: Awaited<ReturnType<AsyncDuckDB['connect']>> | null = null;
        let isCleanedUp = false;

        const switchSchemaAndConnect = async () => {
            // First close any existing connection
            if (connection) {
                try {
                    await connection.close();
                } catch (e) {
                    console.error('Error closing previous connection:', e);
                }
                setConnection(null);
            }

            // Wait a bit longer to ensure all connections are fully closed
            await new Promise(resolve => setTimeout(resolve, 200));

            try {
                // Switch schema first
                await dbContext.switchToSchema(selectedChatId);

                // Create new connection with the new schema
                const conn = await dbContext.createManagedConnection(selectedChatId);
                currentConnection = conn;

                if (!isCleanedUp) {
                    setConnection(conn);
                    setConnectionTimestamp(Date.now());
                    
                    // Restore table selection for this chat
                    const targetChat = chats.find(chat => chat.id === selectedChatId);
                    if (targetChat?.selectedTable) {
                        try {
                            // Check if table exists in this schema
                            await conn.query(`SELECT 1 FROM "${targetChat.selectedTable}" LIMIT 0`);
                        } catch {
                            // Table not found in schema, don't update the selection here
                            // Let the parent component handle this
                        }
                    }
                    
                    // Notify table change after connection is established
                    if (dbContext) {
                        setTimeout(() => {
                            dbContext.notifyTableChange(undefined, selectedChatId);
                        }, 300);
                    }
                }
            } catch (error) {
                console.error('Error switching schema and creating connection:', error);
                setConnection(null);
            }
        };

        switchSchemaAndConnect();

        return () => {
            isCleanedUp = true;
            if (currentConnection) {
                currentConnection.close().catch(() => {});
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedChatId, dbContext]); // Only depend on selectedChatId and dbContext

    return {
        connection,
        connectionTimestamp,
        setConnectionTimestamp,
    };
}