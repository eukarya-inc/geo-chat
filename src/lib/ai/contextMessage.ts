import type { DBContext } from '../duckdb/dbContext';

/**
 * Classify columns into basic types for context overview
 */
async function getColumnClassification(
  columns: Array<{name: string; type: string}>,
  dbContext: DBContext,
  tableName: string,
  schema: string | null
): Promise<{summary: string}> {
  const numeric: string[] = [];
  const categorical: string[] = [];
  const datetime: string[] = [];
  const text: string[] = [];
  const other: string[] = [];

  // Classify columns by type
  for (const column of columns) {
    const upperType = column.type.toUpperCase();

    if (['INTEGER', 'BIGINT', 'SMALLINT', 'TINYINT', 'HUGEINT', 'FLOAT', 'DOUBLE', 'REAL', 'DECIMAL', 'NUMERIC'].some(t => upperType.includes(t))) {
      numeric.push(column.name);
    } else if (['DATE', 'TIME', 'TIMESTAMP', 'DATETIME'].some(t => upperType.includes(t))) {
      datetime.push(column.name);
    } else if (['VARCHAR', 'CHAR', 'TEXT', 'STRING'].some(t => upperType.includes(t))) {
      // Quick check for categorical vs text by sampling distinct count
      try {
        const distinctQuery = `SELECT COUNT(DISTINCT "${column.name}") as distinct_count, COUNT(*) as total_count FROM "${schema}"."${tableName}" WHERE "${column.name}" IS NOT NULL LIMIT 1000`;
        const distinctResult = await dbContext.executeQuery(distinctQuery, schema);
        const distinctCount = distinctResult?.[0]?.distinct_count || 0;
        const totalCount = distinctResult?.[0]?.total_count || 0;

        // If distinct count is low relative to total, likely categorical
        if (totalCount > 0 && distinctCount < Math.min(totalCount * 0.1, 20)) {
          categorical.push(column.name);
        } else {
          text.push(column.name);
        }
      } catch {
        // If query fails, default to text
        text.push(column.name);
      }
    } else {
      other.push(column.name);
    }
  }

  // Build concise summary
  const parts: string[] = [];
  if (numeric.length > 0) parts.push(`${numeric.length} numeric`);
  if (categorical.length > 0) parts.push(`${categorical.length} categorical`);
  if (datetime.length > 0) parts.push(`${datetime.length} date/time`);
  if (text.length > 0) parts.push(`${text.length} text`);
  if (other.length > 0) parts.push(`${other.length} other`);

  const summary = parts.length > 0
    ? `${columns.length} columns (${parts.join(', ')})`
    : `${columns.length} columns`;

  return { summary };
}

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
        
        // Get table size for better context
        const countQuery = `SELECT COUNT(*) as row_count FROM "${schemaName}"."${selectedTable}"`;
        const countResult = await dbContext.executeQuery(countQuery, schemaName);
        const rowCount = countResult?.[0]?.row_count || 0;

        contextMessage += `\nTable size: ${rowCount.toLocaleString()} rows\n`;

        // Add lightweight column classification for better AI reasoning
        if (columns && columns.length > 0) {
          const columnTypes = await getColumnClassification(columns, dbContext, selectedTable, schemaName);
          if (columnTypes.summary) {
            contextMessage += `\nColumn overview: ${columnTypes.summary}\n`;
          }
        }

        // Get strategic sample (3 rows instead of 5) for pattern recognition
        const sampleQuery = `SELECT * FROM "${schemaName}"."${selectedTable}" LIMIT 3`;
        const result = await dbContext.executeQuery(sampleQuery, schemaName);

        if (result && result.length > 0) {
          contextMessage += `\nData preview (3 rows for pattern recognition):\n`;
          contextMessage += `Note: This is a minimal sample. Use duckdb_query with appropriate analysis queries for complete insights.\n`;
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
  return message.includes('Current database context:');
}

/**
 * Remove context markers from a message for display
 */
export function removeContextMarkers(message: string): string {
  // No longer needed since we don't use markers
  return message;
}