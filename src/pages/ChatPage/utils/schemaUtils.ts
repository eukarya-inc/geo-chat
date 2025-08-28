// Utility function to convert chatId to schema name
// This maintains the naming convention for chat-based schemas
export function chatIdToSchemaName(chatId: string | null | undefined): string | null {
    if (!chatId) return null;
    return `chat_${chatId.replace(/[^a-zA-Z0-9]/g, '_')}`;
}