/**
 * Utilities to analyze and compose merged SQL scripts from multiple CREATE TABLE statements.
 * - extractTableDependencies: Get table references from FROM/JOIN in a CREATE TABLE AS SELECT ...
 * - buildMergedSql: Topologically sort CREATE TABLE statements and compose a single merged script
 */

/** Normalize identifier by stripping double quotes/backticks around each part */
function normalizeIdent(ident: string): string {
    const trim = ident.trim();
    // If the entire identifier is a single quoted identifier (may include dot inside quotes), strip quotes as a whole
    if (trim.startsWith('"') && trim.endsWith('"')) {
        return trim.slice(1, -1);
    }
    // Otherwise, split on dots and strip quotes per part
    return trim
        .split('.')
        .map(p => p.replace(/^"(.+)"$/u, '$1').replace(/^`(.+)`$/u, '$1'))
        .join('.');
}

/** Extract created table name from a CREATE TABLE statement */
export function getCreatedTableName(createTableSql: string): string | null {
    const sql = createTableSql.trim();
    const m = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([\w`".]+)/iu);
    if (!m) return null;
    return normalizeIdent(m[1]);
}

/**
 * Extract table dependencies from FROM and JOIN clauses.
 * - Skips subqueries: FROM ( ... )
 * - Skips function calls: FROM read_csv_auto(...)
 * - Captures simple identifiers including optional schema qualification
 */
export function extractTableDependencies(createTableSql: string): string[] {
    const deps: string[] = [];
    const seen = new Set<string>();

    const sql = createTableSql.replace(/--.*$/gmu, '').replace(/\s+/gu, ' ');

    // Capture tokens following FROM or JOIN that are not starting with '(' and contain no '('
    const regex = /\b(?:FROM|JOIN)\s+([^\s,;]+)/giu;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(sql)) !== null) {
        let token = match[1].trim();
        // Skip subqueries and function calls and string literals
        if (token.startsWith('(')) continue;
        if (token.includes('(')) continue; // function call like read_csv_auto(...)
        if (token.startsWith("'")) continue; // literal path

        // Remove trailing comma/punctuation if any
        token = token.replace(/[;,]$/u, '');
        const ident = normalizeIdent(token);
        if (!seen.has(ident)) {
            seen.add(ident);
            deps.push(ident);
        }
    }

    return deps;
}

// Spatial extension handling is intentionally omitted per requirements.

/** Ensure SQL ends with a semicolon */
function ensureSemicolon(sql: string): string {
    return /;\s*$/u.test(sql.trim()) ? sql.trim() : `${sql.trim()};`;
}

/** Build an ordered merged SQL script from multiple CREATE TABLE statements */
export function buildMergedSql(createTableSqls: string[]): { mergedSql: string; order: string[] } {
    // Map tableName -> SQL
    const tableToSQL = new Map<string, string>();
    for (const sql of createTableSqls) {
        const name = getCreatedTableName(sql);
        if (name) tableToSQL.set(name, sql);
    }

    // Build dependency graph only within provided set
    const graph = new Map<string, Set<string>>(); // node -> deps
    for (const [table, sql] of tableToSQL.entries()) {
        const deps = extractTableDependencies(sql).filter(d => tableToSQL.has(d));
        graph.set(table, new Set(deps));
    }

    // Topological sort (Kahn's algorithm)
    const inDegree = new Map<string, number>();
    for (const node of graph.keys()) inDegree.set(node, 0);
    for (const [node, deps] of graph.entries()) {
        inDegree.set(node, (inDegree.get(node) || 0) + deps.size);
    }

    const queue: string[] = [];
    for (const [node, deg] of inDegree.entries()) if (deg === 0) queue.push(node);

    const order: string[] = [];
    while (queue.length) {
        const node = queue.shift()!;
        order.push(node);
        for (const [n, deps] of graph.entries()) {
            if (deps.has(node)) {
                const nd = (inDegree.get(n) || 0) - 1;
                inDegree.set(n, nd);
                if (nd === 0) queue.push(n);
            }
        }
    }

    // If we couldn't order all nodes (cycle), fall back to input order for remaining
    if (order.length !== graph.size) {
        for (const t of tableToSQL.keys()) if (!order.includes(t)) order.push(t);
    }

    const lines: string[] = [];

    // Compose SQL in order
    for (const table of order) {
        const original = tableToSQL.get(table)!;
        lines.push(ensureSemicolon(original));
        lines.push('');
    }

    return { mergedSql: lines.join('\n'), order };
}

/** Build merged SQL only for a specific target table and its dependencies */
// Note: buildMergedSqlForTarget was removed from the public API to keep utilities minimal.

/** Escape regex special characters */
function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Extract the SELECT ... part after AS in a CREATE TABLE ... AS SELECT ... */
export function getSelectPart(createTableSql: string): string | null {
    const sql = createTableSql.trim().replace(/;\s*$/u, '');
    const m = sql.match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w`".]+\s+AS\s+([\s\S]+)$/iu);
    if (!m) return null;
    const selectPart = m[1].trim();
    return selectPart.replace(/;\s*$/u, '');
}

/** Build a single CREATE TABLE (target) using CTEs to inline intermediate tables */
export function buildSingleCreateSqlForTarget(targetTable: string, createTableSqls: string[]): string {
    const tableToSQL = new Map<string, string>();
    const tableToSelect = new Map<string, string>();
    for (const sql of createTableSqls) {
        const name = getCreatedTableName(sql);
        if (!name) continue;
        const sel = getSelectPart(sql);
        if (!sel) continue;
        tableToSQL.set(name, sql);
        tableToSelect.set(name, sel);
    }

    // Collect reachable dependencies including target
    const collected = new Set<string>();
    const visiting = new Set<string>();

    function dfs(table: string): void {
        if (collected.has(table) || visiting.has(table)) return;
        visiting.add(table);
        const sql = tableToSQL.get(table);
        if (sql) {
            const deps = extractTableDependencies(sql);
            for (const d of deps) if (tableToSQL.has(d)) dfs(d);
        }
        visiting.delete(table);
        collected.add(table);
    }

    dfs(targetTable);

    // Create induced list of SQLs for reachable nodes (excluding target for CTE list)
    const depNames = Array.from(collected).filter(n => n !== targetTable);
    const reachableSqls: string[] = depNames.map(n => tableToSQL.get(n)).filter((s): s is string => !!s);

    // Order them using existing topological sort helper
    const { order } = buildMergedSql(reachableSqls);

    // Build alias map for CTEs to avoid dots and invalid chars
    const cteNames = new Map<string, string>();
    for (const name of depNames) {
        let alias = name.replace(/[^A-Za-z0-9_]/g, '_');
        if (/^\d/.test(alias)) alias = `t_${alias}`;
        // Ensure uniqueness
        let unique = alias;
        let i = 1;
        while ([...cteNames.values()].includes(unique)) {
            unique = `${alias}_${i++}`;
        }
        cteNames.set(name, unique);
    }

    // Rewrite function to replace table references with CTE aliases
    function rewriteSelect(sql: string): string {
        let out = sql;
        for (const [orig, alias] of cteNames.entries()) {
            const pattern = new RegExp(`(^|[^\\w.])(${escapeRegex(orig)}|"${escapeRegex(orig)}"|\`${escapeRegex(orig)}\`)(?=$|[^\\w.])`, 'g');
            out = out.replace(pattern, `$1${alias}`);
        }
        return out;
    }

    const lines: string[] = [];
    lines.push(`CREATE TABLE ${targetTable} AS`);
    if (order.length > 0) {
        lines.push('WITH');
        order.forEach((name, idx) => {
            const alias = cteNames.get(name)!;
            const sel = tableToSelect.get(name)!;
            const rewritten = rewriteSelect(sel);
            const comma = idx < order.length - 1 ? ',' : '';
            lines.push(`  ${alias} AS (${rewritten})${comma}`);
        });
    }
    const targetSelect = tableToSelect.get(targetTable);
    if (!targetSelect) throw new Error(`Missing SELECT body for target ${targetTable}`);
    lines.push(rewriteSelect(targetSelect).replace(/;\s*$/u, ''));
    // Do NOT append a trailing semicolon for mergedSql (per requirements)
    return lines.join('\n').replace(/;\s*$/u, '');
}

export default {
    extractTableDependencies,
    getCreatedTableName,
    buildMergedSql,
    getSelectPart,
    buildSingleCreateSqlForTarget,
};
