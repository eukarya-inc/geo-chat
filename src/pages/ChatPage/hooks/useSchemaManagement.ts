import { useState, useEffect } from 'react';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../../lib/duckdb/dbContext';
import type { Chat } from '../../../components/chat/ChatList';

export function useSchemaManagement(dbContext: DBContext | null, schemaName: string | null, chats: Chat[]) {
    const [connection, setConnection] = useState<Awaited<ReturnType<AsyncDuckDB['connect']>> | null>(null);

    // Combined schema switching and connection setup
    useEffect(() => {
        if (!dbContext || !schemaName) return;

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
                // Create new connection with the new schema
                const conn = await dbContext.createManagedConnection(schemaName);
                currentConnection = conn;

                if (!isCleanedUp) {
                    // Ensure connection is fully ready before setting it
                    await new Promise(resolve => setTimeout(resolve, 100));

                    setConnection(conn);

                    // Restore table selection for this chat
                    const targetChat = chats.find(
                        chat => `chat_${chat.id.replace(/[^a-zA-Z0-9]/g, '_')}` === schemaName
                    );
                    if (targetChat?.selectedTable) {
                        try {
                            // Check if table exists in this schema
                            await conn.query(`SELECT 1 FROM "${targetChat.selectedTable}" LIMIT 0`);
                            // Table exists, will be restored by useTableSelection hook
                        } catch {
                            // Table not found in schema, clear it
                            console.log(`Table ${targetChat.selectedTable} not found in schema ${schemaName}`);
                        }
                    }

                    // Notify table change after connection is established with a longer delay
                    if (dbContext) {
                        setTimeout(() => {
                            dbContext.notifyTableChange(undefined, schemaName);
                        }, 500);
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
    }, [schemaName, dbContext]); // Only depend on schemaName and dbContext

    return {
        connection,
    };
}
