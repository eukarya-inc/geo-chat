import type { DBContext } from '../lib/duckdb/dbContext';
import { getTableInfo, formatTableInfoForAI } from './tableInfo';

/**
 * Extracts a data URL from input text if it's a valid URL for data import
 * Returns the URL string if valid, null otherwise
 * Accepts any HTTP/HTTPS URL that can be parsed
 */
export function extractDataUrl(text: string): string | null {
    if (!text || typeof text !== 'string') {
        return null;
    }

    const trimmed = text.trim();

    try {
        const url = new URL(trimmed);
        // Only accept HTTP and HTTPS protocols
        if (url.protocol === 'http:' || url.protocol === 'https:') {
            return url.href;
        }
        return null;
    } catch {
        // Not a valid URL
        return null;
    }
}

/**
 * Creates a table from a URL and generates a message for the chat
 */
export async function createTableFromUrl(
    url: string,
    dbContext: DBContext,
    schema: string | null = null
): Promise<{ tableName: string; message: string }> {
    // Use the dbContext method to create the table
    const tableName = await dbContext.createTableFromUrl(url, schema);

    // Get detailed table information for AI context
    const tableInfo = await getTableInfo(dbContext, tableName, schema);
    const tableInfoText = formatTableInfoForAI(tableInfo);

    // Create message with both marker and detailed info
    // The marker is for backward compatibility and the info is for AI context
    const message = `<!--TABLE_CREATED:${tableName}--><!--TABLE_INFO_START-->\n${tableInfoText}\n<!--TABLE_INFO_END-->`;

    return { tableName, message };
}
