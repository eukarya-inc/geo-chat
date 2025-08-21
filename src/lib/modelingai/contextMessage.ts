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
    // Get all tables in the current schema
    const tables = await dbContext.getTables(schemaName);
    
    if (!tables || tables.length === 0) {
      return null;
    }

    // Build context message without HTML comments
    let contextMessage = `現在のデータベースコンテキスト:\n`;
    contextMessage += `スキーマ: ${schemaName}\n`;
    contextMessage += `\n利用可能なテーブル:\n`;
    
    for (const table of tables) {
      contextMessage += `- ${table}`;
      if (table === selectedTable) {
        contextMessage += ` (現在選択中)`;
      }
      contextMessage += '\n';
    }
    
    // Add detailed info about selected table
    if (selectedTable && tables.some(t => t === selectedTable)) {
      contextMessage += `\n現在選択中のテーブル: ${selectedTable}\n`;
      
      try {
        // Get table schema
        const columns = await dbContext.getTableColumns(selectedTable, schemaName);
        if (columns && columns.length > 0) {
          contextMessage += `\nテーブルスキーマ:\n`;
          for (const column of columns) {
            contextMessage += `- ${column.name}: ${column.type}\n`;
          }
        }
        
        // Get sample data (first 5 rows)
        const sampleQuery = `SELECT * FROM "${schemaName}"."${selectedTable}" LIMIT 5`;
        const result = await dbContext.executeQuery(sampleQuery, schemaName);
        
        if (result && result.length > 0) {
          contextMessage += `\nサンプルデータ (先頭5件):\n`;
          contextMessage += '```json\n';
          contextMessage += JSON.stringify(result, null, 2);
          contextMessage += '\n```\n';
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
  return message.includes('現在のデータベースコンテキスト:');
}

/**
 * Remove context markers from a message for display
 */
export function removeContextMarkers(message: string): string {
  // No longer needed since we don't use markers
  return message;
}