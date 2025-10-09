import { describe, it, expect } from 'vitest';
import { detectCreateTableFromUrl, generateTableNameFromUrl, getFromClauseForUrl } from './tableUrlHelpers';

describe('tableUrlHelpers', () => {
    describe('detectCreateTableFromUrl', () => {
        it('should detect direct URL pattern', () => {
            const sql = "CREATE TABLE mytable AS SELECT * FROM 'https://example.com/data.parquet'";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'mytable',
                url: 'https://example.com/data.parquet',
            });
        });

        it('should detect read_csv_auto pattern', () => {
            const sql = "CREATE TABLE csv_table AS SELECT * FROM read_csv_auto('https://example.com/data.csv')";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'csv_table',
                url: 'https://example.com/data.csv',
            });
        });

        it('should detect read_csv_auto pattern with parameters', () => {
            const sql =
                "CREATE TABLE csv_table AS SELECT * FROM read_csv_auto('https://example.com/data.csv', sample_size = -1)";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'csv_table',
                url: 'https://example.com/data.csv',
            });
        });

        it('should detect st_read pattern', () => {
            const sql = "CREATE TABLE geo_table AS SELECT * FROM st_read('https://example.com/data.geojson')";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'geo_table',
                url: 'https://example.com/data.geojson',
            });
        });

        it('should detect read_parquet pattern', () => {
            const sql = "CREATE TABLE parquet_table AS SELECT * FROM read_parquet('https://example.com/data.parquet')";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'parquet_table',
                url: 'https://example.com/data.parquet',
            });
        });

        it('should handle case insensitive matching', () => {
            const sql = "create table MYTABLE as select * from 'HTTPS://EXAMPLE.COM/DATA.PARQUET'";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'MYTABLE',
                url: 'HTTPS://EXAMPLE.COM/DATA.PARQUET',
            });
        });

        it('should handle extra whitespace', () => {
            const sql = "CREATE   TABLE   mytable   AS   SELECT   *   FROM   'https://example.com/data.parquet'";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'mytable',
                url: 'https://example.com/data.parquet',
            });
        });

        it('should return null for non-matching patterns', () => {
            expect(detectCreateTableFromUrl('CREATE TABLE mytable (id INT)')).toBeNull();
            expect(detectCreateTableFromUrl('SELECT * FROM mytable')).toBeNull();
            expect(detectCreateTableFromUrl('CREATE TABLE mytable AS SELECT * FROM other_table')).toBeNull();
            expect(detectCreateTableFromUrl("CREATE TABLE mytable AS SELECT * FROM '/local/file.csv'")).toBeNull();
        });

        it('should handle http URLs', () => {
            const sql = "CREATE TABLE mytable AS SELECT * FROM 'http://example.com/data.csv'";
            const result = detectCreateTableFromUrl(sql);
            expect(result).toEqual({
                tableName: 'mytable',
                url: 'http://example.com/data.csv',
            });
        });
    });

    describe('generateTableNameFromUrl', () => {
        it('should generate table name from simple filename', () => {
            expect(generateTableNameFromUrl('https://example.com/data.csv')).toBe('data');
            expect(generateTableNameFromUrl('https://example.com/my_table.parquet')).toBe('my_table');
        });

        it('should handle URL encoded filenames', () => {
            expect(generateTableNameFromUrl('https://example.com/my%20table.csv')).toBe('my_table');
            expect(generateTableNameFromUrl('https://example.com/data%2Btable.csv')).toBe('data_table');
        });

        it('should handle filenames with special characters', () => {
            expect(generateTableNameFromUrl('https://example.com/my-table-2024.csv')).toBe('my_table_2024');
            expect(generateTableNameFromUrl('https://example.com/data@2024!.csv')).toBe('data_2024_');
        });

        it('should prefix table names that start with numbers', () => {
            expect(generateTableNameFromUrl('https://example.com/2024data.csv')).toBe('t_2024data');
            expect(generateTableNameFromUrl('https://example.com/123.csv')).toBe('t_123');
        });

        it('should handle Japanese characters by generating hash', () => {
            const result = generateTableNameFromUrl('https://example.com/日本語データ.csv');
            expect(result).toMatch(/^table_[0-9a-f]+$/);
        });

        it('should handle mixed ASCII and non-ASCII characters', () => {
            const result = generateTableNameFromUrl('https://example.com/data_日本語.csv');
            expect(result).toMatch(/^table_[0-9a-f]+$/);
        });

        it('should handle URLs without filename', () => {
            expect(generateTableNameFromUrl('https://example.com/')).toBe('remote_file');
        });

        it('should handle multiple extensions', () => {
            expect(generateTableNameFromUrl('https://example.com/data.tar.gz')).toBe('data');
            expect(generateTableNameFromUrl('https://example.com/file.backup.csv')).toBe('file');
        });

        it('should handle URLs with query parameters', () => {
            expect(generateTableNameFromUrl('https://example.com/data.csv?version=2')).toBe('data');
            expect(generateTableNameFromUrl('https://example.com/file.parquet?auth=token')).toBe('file');
        });
    });

    describe('getFromClauseForUrl', () => {
        it('should return direct reference for Parquet files', () => {
            expect(getFromClauseForUrl('https://example.com/data.parquet')).toBe("'https://example.com/data.parquet'");
            expect(getFromClauseForUrl('https://example.com/data.PARQUET')).toBe("'https://example.com/data.PARQUET'");
        });

        it('should return read_csv_auto for CSV files', () => {
            expect(getFromClauseForUrl('https://example.com/data.csv')).toBe(
                "read_csv_auto('https://example.com/data.csv')"
            );
            expect(getFromClauseForUrl('https://example.com/data.CSV')).toBe(
                "read_csv_auto('https://example.com/data.CSV')"
            );
        });

        it('should return st_read for geospatial files', () => {
            expect(getFromClauseForUrl('https://example.com/data.geojson')).toBe(
                "st_read('https://example.com/data.geojson')"
            );
            expect(getFromClauseForUrl('https://example.com/data.shp')).toBe("st_read('https://example.com/data.shp')");
            expect(getFromClauseForUrl('https://example.com/data.json')).toBe(
                "st_read('https://example.com/data.json')"
            );
        });

        it('should default to st_read for unknown extensions', () => {
            expect(getFromClauseForUrl('https://example.com/data.unknown')).toBe(
                "st_read('https://example.com/data.unknown')"
            );
            expect(getFromClauseForUrl('https://example.com/data')).toBe("st_read('https://example.com/data')");
        });

        it('should handle URLs with query parameters', () => {
            expect(getFromClauseForUrl('https://example.com/data.csv?token=abc')).toBe(
                "read_csv_auto('https://example.com/data.csv?token=abc')"
            );
            expect(getFromClauseForUrl('https://example.com/data.parquet?version=2')).toBe(
                "'https://example.com/data.parquet?version=2'"
            );
        });
    });
});
