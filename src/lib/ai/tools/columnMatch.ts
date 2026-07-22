/**
 * Resolves a field name against a table's real columns. LLMs frequently produce a
 * near-miss — a different case, or a differently-composed Unicode string (common
 * with Japanese column names). We accept an exact match, then a case-insensitive /
 * NFC-normalized match (reporting it as a correction), and otherwise fail.
 */

export type ColumnMatch = { ok: true; name: string; corrected: boolean } | { ok: false };

function normalize(s: string): string {
    return s.normalize('NFC').toLowerCase();
}

export function matchColumn(name: string, columns: string[]): ColumnMatch {
    if (columns.includes(name)) return { ok: true, name, corrected: false };
    const target = normalize(name);
    const hit = columns.find(c => normalize(c) === target);
    if (hit) return { ok: true, name: hit, corrected: true };
    return { ok: false };
}

/**
 * Walks a value tree (paint bags, layout bags, and the nested expression arrays
 * inside them) collecting every column referenced by a MapLibre
 * `["get", "<column>"]` expression whose first argument is a string literal.
 */
export function collectGetColumns(value: unknown, found: Set<string> = new Set()): Set<string> {
    if (Array.isArray(value)) {
        if (value[0] === 'get' && typeof value[1] === 'string') found.add(value[1]);
        for (const item of value) collectGetColumns(item, found);
    } else if (value && typeof value === 'object') {
        for (const item of Object.values(value)) collectGetColumns(item, found);
    }
    return found;
}

/**
 * Returns a deep copy of `value` with the column name inside every matching
 * `["get", "<column>"]` expression replaced according to `rename`. Recurses
 * through both arrays and plain objects; anything else passes through.
 */
export function rewriteGetColumns(value: unknown, rename: Map<string, string>): unknown {
    if (Array.isArray(value)) {
        const copy = value.map(v => rewriteGetColumns(v, rename));
        if (copy[0] === 'get' && typeof copy[1] === 'string' && rename.has(copy[1])) {
            copy[1] = rename.get(copy[1]);
        }
        return copy;
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, rewriteGetColumns(v, rename)]));
    }
    return value;
}
