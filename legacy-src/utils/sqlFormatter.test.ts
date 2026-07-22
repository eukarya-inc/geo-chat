import { describe, it, expect } from 'vitest';
import { formatSQL, formatSQLCompact } from './sqlFormatter';

describe('SQL Formatter', () => {
    describe('formatSQL', () => {
        it('should format simple SELECT query', () => {
            const sql = 'SELECT * FROM users WHERE age > 18';
            const formatted = formatSQL(sql);
            expect(formatted).toBe('SELECT\n  *\nFROM\n  users\nWHERE\n  age > 18');
        });

        it('should format complex CREATE TABLE with CTE', () => {
            const sql =
                'WITH yearly_data AS (SELECT 事業者名, unnest.地域名, 事業概要.年度 FROM business_data, UNNEST(輸送実績) as unnest) CREATE TABLE business_metrics AS SELECT * FROM yearly_data';
            const formatted = formatSQL(sql);
            expect(formatted).toContain('WITH');
            expect(formatted).toContain('CREATE TABLE');
            expect(formatted).toContain('UNNEST');
            expect(formatted.split('\n').length).toBeGreaterThan(5);
        });

        it('should handle formatting errors gracefully', () => {
            const invalidSQL = 'SELECT FROM WHERE';
            const formatted = formatSQL(invalidSQL);
            // Should still format even if SQL is invalid
            expect(formatted).toBeTruthy();
        });
    });

    describe('formatSQLCompact', () => {
        it('should keep simple queries on single line', () => {
            const sql = 'SELECT * FROM users';
            const formatted = formatSQLCompact(sql);
            expect(formatted).toBe('SELECT * FROM users');
            expect(formatted.split('\n').length).toBe(1);
        });

        it('should format complex queries with multiple lines', () => {
            const sql =
                'WITH yearly_data AS (SELECT 事業者名 FROM business_data) CREATE TABLE metrics AS SELECT * FROM yearly_data';
            const formatted = formatSQLCompact(sql);
            expect(formatted.split('\n').length).toBeGreaterThan(1);
        });

        it('should format queries longer than 100 chars', () => {
            const sql =
                'SELECT column1, column2, column3, column4, column5, column6, column7, column8, column9, column10 FROM very_long_table_name';
            const formatted = formatSQLCompact(sql);
            expect(formatted.split('\n').length).toBeGreaterThan(1);
        });
    });
});
