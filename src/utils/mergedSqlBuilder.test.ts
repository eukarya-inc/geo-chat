import { describe, it, expect } from 'vitest';
import {
    extractTableDependencies,
    getCreatedTableName,
    buildMergedSql,
    buildSingleCreateSqlForTarget,
} from './mergedSqlBuilder';

describe('mergedSqlBuilder utils', () => {
    it('extracts dependencies from simple FROM', () => {
        const sql = `CREATE TABLE a AS SELECT * FROM b`;
        expect(extractTableDependencies(sql)).toEqual(['b']);
    });

    it('extracts dependencies from joins and ignores functions/literals', () => {
        const sql = `
      CREATE TABLE result AS
      SELECT t1.id, t2.name
      FROM schema1.t1
      JOIN t2 ON t1.id = t2.id
      JOIN read_csv_auto('http://example.com/file.csv') x ON x.id = t1.id
    `;
        expect(extractTableDependencies(sql)).toEqual(['schema1.t1', 't2']);
    });

    it('gets created table name including quoted identifiers', () => {
        expect(getCreatedTableName('CREATE TABLE "Foo.Bar" AS SELECT 1')).toBe('Foo.Bar');
        expect(getCreatedTableName('CREATE OR REPLACE TABLE IF NOT EXISTS `my_table` AS SELECT 1')).toBe('my_table');
    });

    it('topologically sorts and builds mergedSql', () => {
        const sqlB = `CREATE TABLE b AS SELECT 1 AS id`;
        const sqlA = `CREATE TABLE a AS SELECT * FROM b`;
        const { mergedSql, order } = buildMergedSql([sqlA, sqlB]);
        expect(order).toEqual(['b', 'a']);
        expect(mergedSql).not.toMatch(/DROP TABLE IF EXISTS/);
        expect(mergedSql).toMatch(/CREATE TABLE b AS SELECT 1 AS id;/);
        expect(mergedSql).toMatch(/CREATE TABLE a AS SELECT \* FROM b;/);
    });

    it('merges only target and its dependencies (via local helper)', () => {
        const base = `CREATE TABLE base AS SELECT 1 AS id`;
        const mid = `CREATE TABLE mid AS SELECT * FROM base`;
        const top = `CREATE TABLE top AS SELECT * FROM mid`;
        const unrelated = `CREATE TABLE other AS SELECT 2 AS id`;

        const all = [top, mid, unrelated, base];
        const tableToSQL = new Map<string, string>();
        for (const sql of all) {
            const name = getCreatedTableName(sql);
            if (name) tableToSQL.set(name, sql);
        }

        const target = 'top';
        const visited = new Set<string>();
        function dfs(name: string) {
            if (visited.has(name)) return;
            visited.add(name);
            const sql = tableToSQL.get(name);
            if (!sql) return;
            for (const dep of extractTableDependencies(sql)) {
                if (tableToSQL.has(dep)) dfs(dep);
            }
        }
        dfs(target);
        const depsOnlySql = Array.from(visited)
            .filter(n => n !== target)
            .map(n => tableToSQL.get(n)!)
            .filter(Boolean);
        const { order } = buildMergedSql(depsOnlySql);
        expect(order).toEqual(['base', 'mid']);
    });

    it('builds a single CREATE TABLE using CTEs (eliminates intermediates)', () => {
        const base = `CREATE TABLE base AS SELECT 1 AS id`;
        const mid = `CREATE TABLE mid AS SELECT * FROM base`;
        const top = `CREATE TABLE top AS SELECT * FROM mid`;
        const sql = buildSingleCreateSqlForTarget('top', [top, mid, base]);
        expect(sql).toMatch(/^CREATE TABLE top AS\nWITH/);
        expect(sql).toMatch(/base\s+AS \(SELECT 1 AS id\),/);
        expect(sql).toMatch(/mid\s+AS \(SELECT \* FROM base\)\nSELECT \* FROM mid$/);
    });

    it('uses safe aliases and rewrites qualified references', () => {
        const t1 = `CREATE TABLE schema1.t1 AS SELECT 1 AS id`;
        const t2 = `CREATE TABLE t2 AS SELECT * FROM schema1.t1`;
        const top = `CREATE TABLE top AS SELECT * FROM t2 JOIN schema1.t1 ON t2.id = schema1.t1.id`;
        const sql = buildSingleCreateSqlForTarget('top', [top, t2, t1]);
        // alias for schema1.t1 should be schema1_t1 by our strategy
        expect(sql).toContain('schema1_t1 AS (SELECT 1 AS id)');
        expect(sql).toMatch(/JOIN\s+schema1_t1\b/);
    });
});
