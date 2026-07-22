/**
 * Splits on semicolons that are not inside single-quoted strings, then counts the
 * non-empty pieces. We only run one statement at a time so the model can't smuggle
 * several statements (or destructive side effects) through a single call.
 */
export function countStatements(sql: string): number {
    const withoutComments = sql
        .replace(/--[^\n]*/g, '') // line comments
        .replace(/\/\*[\s\S]*?\*\//g, ''); // block comments
    return withoutComments.split(/;(?=(?:[^']*'[^']*')*[^']*$)/).filter(s => s.trim().length > 0).length;
}

/** True when `sql` contains more than one statement. */
export function hasMultipleStatements(sql: string): boolean {
    return countStatements(sql) > 1;
}
