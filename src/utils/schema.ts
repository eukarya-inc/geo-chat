// Utility function to convert chatId to schema name
// This maintains the naming convention for chat-based schemas
export function chatIdToSchemaName(chatId: string | null | undefined): string | null {
    if (!chatId) return null;

    // Sanitize chatId by replacing non-alphanumeric characters with underscores
    const sanitized = chatId.replace(/[^a-zA-Z0-9]/g, '_');

    // If already starts with 'chat_', return as-is to avoid duplication
    if (sanitized.startsWith('chat_')) {
        return sanitized;
    }

    return `chat_${sanitized}`;
}

/**
 * Generate duckdb:// URL for a table
 * Format: duckdb://schema.table or duckdb://table
 */
export function createDuckDBUrl(tableName: string, schema: string | null | undefined): string {
    return schema ? `duckdb://${schema}.${tableName}` : `duckdb://${tableName}`;
}

/**
 * Parse duckdb:// URL to extract schema and table name
 * Format: duckdb://schema.table or duckdb://table
 * Can also handle paths like duckdb://schema.table/path (extracts only schema.table part)
 * @returns Object with schemaName (null if not present) and tableName
 */
export function parseDuckDBUrl(url: string): { schemaName: string | null; tableName: string } | null {
    if (!url.startsWith('duckdb://')) {
        return null;
    }

    let path = url.replace('duckdb://', '');

    // If path contains '/', extract only the part before the first '/'
    // This handles URLs like duckdb://schema.table/{z}/{x}/{y}.pbf
    const slashIndex = path.indexOf('/');
    if (slashIndex !== -1) {
        path = path.substring(0, slashIndex);
    }

    // Check if path contains schema (schema.table format)
    if (path.includes('.')) {
        const parts = path.split('.');
        const schemaName = parts[0];
        const tableName = parts.slice(1).join('.'); // Handle table names with dots
        return { schemaName, tableName };
    }

    // Format: duckdb://table (no schema)
    return { schemaName: null, tableName: path };
}
