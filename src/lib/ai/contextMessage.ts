import type { DBContext } from '../duckdb/dbContext';

/**
 * Generate a hidden context message with current database state
 */
export async function generateContextMessage(
    dbContext: DBContext | null,
    schemaName: string | null,
    selectedTable: string | null
): Promise<string | null> {
    if (!dbContext || !schemaName) {
        return null;
    }

    try {
        // Get current date and timezone information
        const now = new Date();
        const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        const isoString = now.toISOString();

        // Get all tables in the current schema
        const tables = await dbContext.getTables(schemaName);

        // Build context message without HTML comments
        let contextMessage = `Current database context:\n`;
        contextMessage += `Current Date and Time (actual user's current time): ${isoString}\n`;
        contextMessage += `Timezone: ${timezone}\n`;
        contextMessage += `Schema: ${schemaName}\n`;
        contextMessage += `\nAvailable tables:\n`;

        if (!tables || tables.length === 0) {
            contextMessage += `No tables are currently available in the database.\n`;
        } else {
            for (const table of tables) {
                contextMessage += `- ${table}`;
                if (table === selectedTable) {
                    contextMessage += ` (currently selected)`;
                }
                contextMessage += '\n';
            }
        }

        // Add detailed info about selected table
        if (selectedTable && tables.some(t => t === selectedTable)) {
            contextMessage += `\nCurrently selected table: ${selectedTable}\n`;

            try {
                // Get table schema
                const columns = await dbContext.getTableColumns(selectedTable, schemaName);
                if (columns && columns.length > 0) {
                    contextMessage += `\nTable schema:\n`;
                    for (const column of columns) {
                        contextMessage += `- ${column.name}: ${column.type}\n`;
                    }
                }

                // Get sample data (reduced to 3 rows to save tokens)
                const sampleLimit = 3;
                const sampleQuery = `SELECT * FROM "${schemaName}"."${selectedTable}" LIMIT ${sampleLimit}`;
                const result = await dbContext.executeQuery(sampleQuery, schemaName);

                if (result && result.length > 0) {
                    const columnCount = Object.keys(result[0]).length;
                    const shouldSummarize = columnCount > 15;

                    if (shouldSummarize) {
                        // For tables with many columns, show only key columns to reduce token usage
                        const summarizedResult = result.map(row => {
                            const keys = Object.keys(row);
                            // Show first 5 columns + last 3 columns
                            const importantKeys = [...keys.slice(0, 5), ...keys.slice(-3)];
                            const summarized: Record<string, unknown> = {};

                            importantKeys.forEach(key => {
                                summarized[key] = row[key];
                            });

                            // Add indicator for omitted columns
                            if (keys.length > importantKeys.length) {
                                summarized['_omitted_'] =
                                    `... ${keys.length - importantKeys.length} more columns (use DESCRIBE to see all)`;
                            }

                            return summarized;
                        });

                        contextMessage += `\nSample data (${sampleLimit} rows, showing key columns of ${columnCount} total):\n`;
                        contextMessage += `Note: Some columns omitted to save space. Use duckdb_query to see full data.\n`;
                        contextMessage += '```json\n';
                        contextMessage += JSON.stringify(summarizedResult, null, 2);
                        contextMessage += '\n```\n';
                    } else {
                        // For tables with few columns, show all data
                        contextMessage += `\nSample data (first ${sampleLimit} rows - NOT the complete dataset):\n`;
                        contextMessage += `Note: This is a small sample. Use duckdb_query to query the full dataset for accurate analysis.\n`;
                        contextMessage += '```json\n';
                        contextMessage += JSON.stringify(result, null, 2);
                        contextMessage += '\n```\n';
                    }
                }
            } catch (error) {
                // If we can't get schema or sample data, just continue without it
                console.warn('Could not get table details:', error);
            }
        }

        return contextMessage;
    } catch (error) {
        console.error('Error generating context message:', error);
        return null;
    }
}

/**
 * Check if a message is a context message
 */
export function isContextMessage(message: string): boolean {
    // Since we no longer use markers, check for the context header
    return message.includes('Current database context:');
}

/**
 * Remove context markers from a message for display
 */
export function removeContextMarkers(message: string): string {
    // No longer needed since we don't use markers
    return message;
}
