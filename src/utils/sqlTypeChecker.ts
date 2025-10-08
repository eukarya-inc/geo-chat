export interface SQLTypeInfo {
    isCreateTable: boolean;
    isTableOperation: boolean;
    isDropTable: boolean;
    isDDL: boolean;
    isSelect: boolean;
    hasMultipleStatements: boolean;
    statementCount: number;
}

/**
 * Analyzes SQL statement to determine its type
 * Handles SQL comments (single-line and multi-line) properly
 * Checks for multiple SQL statements
 */
export function checkSQLType(sql: string): SQLTypeInfo {
    // Check for multiple SQL statements first
    // Simple check for multiple statements - look for semicolons not in quotes
    const trimmedSql = sql.trim();
    const statements = trimmedSql.split(/;(?=(?:[^']*'[^']*')*[^']*$)/).filter(s => s.trim().length > 0);
    const statementCount = statements.length;
    const hasMultipleStatements = statementCount > 1;
    // Remove SQL comments for accurate type checking
    // Remove single-line comments (-- ...)
    const sqlWithoutSingleLineComments = sql.replace(/--[^\n]*/g, '');
    // Remove multi-line comments (/* ... */)
    const sqlWithoutComments = sqlWithoutSingleLineComments.replace(/\/\*[\s\S]*?\*\//g, '');

    // Convert to uppercase for case-insensitive checking
    const upperSql = sqlWithoutComments.trim().toUpperCase();

    // Check for CREATE TABLE
    const isCreateTable = upperSql.includes('CREATE TABLE') || upperSql.includes('CREATE OR REPLACE TABLE');

    // Check for DROP TABLE
    const isDropTable = upperSql.includes('DROP TABLE');

    // Check for SELECT statement
    const isSelect =
        upperSql.startsWith('SELECT') ||
        upperSql.startsWith('WITH') || // CTEs often precede SELECT
        upperSql.includes('SELECT');

    // Check for any table operation (CREATE, DROP)
    const isTableOperation = isCreateTable || isDropTable;

    // Check for DDL operations (includes schema operations, index operations, etc.)
    const isDDL =
        isTableOperation ||
        upperSql.includes('ALTER TABLE') ||
        upperSql.includes('CREATE SCHEMA') ||
        upperSql.includes('DROP SCHEMA') ||
        upperSql.includes('CREATE INDEX') ||
        upperSql.includes('DROP INDEX') ||
        upperSql.includes('CREATE VIEW') ||
        upperSql.includes('DROP VIEW');

    return {
        isCreateTable,
        isTableOperation,
        isDropTable,
        isDDL,
        isSelect,
        hasMultipleStatements,
        statementCount,
    };
}
