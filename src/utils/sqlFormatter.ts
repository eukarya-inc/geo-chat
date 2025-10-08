import { format } from 'sql-formatter';

/**
 * Format SQL query for better readability
 * @param sql - The SQL query to format
 * @returns Formatted SQL query
 */
export function formatSQL(sql: string): string {
    try {
        return format(sql, {
            language: 'sqlite', // Use SQLite dialect for better DuckDB compatibility
            keywordCase: 'upper',
            indentStyle: 'standard',
            linesBetweenQueries: 2,
            denseOperators: false,
            newlineBeforeSemicolon: false,
        });
    } catch (error) {
        // If formatting fails, return the original SQL
        console.warn('Failed to format SQL:', error);
        return sql;
    }
}

/**
 * Format SQL query for compact display (single line for simple queries)
 * @param sql - The SQL query to format
 * @returns Formatted SQL query
 */
export function formatSQLCompact(sql: string): string {
    try {
        // For simple queries, keep them on a single line
        const trimmedSql = sql.trim();
        const isSimpleQuery =
            !trimmedSql.includes('\n') &&
            trimmedSql.length < 100 &&
            !trimmedSql.toUpperCase().includes('WITH') &&
            !trimmedSql.toUpperCase().includes('JOIN') &&
            !trimmedSql.toUpperCase().includes('UNION');

        if (isSimpleQuery) {
            // Just normalize whitespace for simple queries
            return trimmedSql.replace(/\s+/g, ' ');
        }

        // Use full formatting for complex queries
        return formatSQL(sql);
    } catch (error) {
        console.warn('Failed to format SQL:', error);
        return sql;
    }
}
