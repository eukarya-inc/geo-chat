import { describe, it, expect } from 'vitest';
import { chatIdToSchemaName, createDuckDBUrl, parseDuckDBUrl } from './schema';

describe('chatIdToSchemaName', () => {
    it('should return null for null input', () => {
        expect(chatIdToSchemaName(null)).toBe(null);
    });

    it('should return null for undefined input', () => {
        expect(chatIdToSchemaName(undefined)).toBe(null);
    });

    it('should return null for empty string', () => {
        expect(chatIdToSchemaName('')).toBe(null);
    });

    it('should convert chat-{timestamp} format correctly', () => {
        expect(chatIdToSchemaName('chat-1761909834526')).toBe('chat_1761909834526');
    });

    it('should not duplicate chat_ prefix when already present', () => {
        expect(chatIdToSchemaName('chat_1761909834526')).toBe('chat_1761909834526');
    });

    it('should add chat_ prefix when not present', () => {
        expect(chatIdToSchemaName('1761909834526')).toBe('chat_1761909834526');
    });

    it('should replace special characters with underscores', () => {
        expect(chatIdToSchemaName('my-chat-123')).toBe('chat_my_chat_123');
    });

    it('should handle mixed special characters', () => {
        expect(chatIdToSchemaName('test@chat#123')).toBe('chat_test_chat_123');
    });

    it('should preserve alphanumeric characters', () => {
        expect(chatIdToSchemaName('chatABC123')).toBe('chat_chatABC123');
    });
});

describe('createDuckDBUrl', () => {
    it('should create URL with schema', () => {
        expect(createDuckDBUrl('customers', 'chat_123')).toBe('duckdb://chat_123.customers');
    });

    it('should create URL without schema when schema is null', () => {
        expect(createDuckDBUrl('customers', null)).toBe('duckdb://customers');
    });

    it('should create URL without schema when schema is undefined', () => {
        expect(createDuckDBUrl('customers', undefined)).toBe('duckdb://customers');
    });

    it('should handle table names with special characters', () => {
        expect(createDuckDBUrl('my_table_123', 'schema_456')).toBe('duckdb://schema_456.my_table_123');
    });
});

describe('parseDuckDBUrl', () => {
    it('should parse URL with schema', () => {
        const result = parseDuckDBUrl('duckdb://chat_123.customers');
        expect(result).toEqual({
            schemaName: 'chat_123',
            tableName: 'customers',
        });
    });

    it('should parse URL without schema', () => {
        const result = parseDuckDBUrl('duckdb://customers');
        expect(result).toEqual({
            schemaName: null,
            tableName: 'customers',
        });
    });

    it('should handle table names with dots', () => {
        const result = parseDuckDBUrl('duckdb://schema.table.with.dots');
        expect(result).toEqual({
            schemaName: 'schema',
            tableName: 'table.with.dots',
        });
    });

    it('should return null for non-duckdb URLs', () => {
        expect(parseDuckDBUrl('https://example.com')).toBe(null);
    });

    it('should return null for invalid URLs', () => {
        expect(parseDuckDBUrl('invalid')).toBe(null);
    });

    it('should extract schema.table from tile URL with path', () => {
        const result = parseDuckDBUrl('duckdb://chat_123.customers/1/2/3.pbf');
        expect(result).toEqual({
            schemaName: 'chat_123',
            tableName: 'customers',
        });
    });

    it('should extract table from tile URL with path (no schema)', () => {
        const result = parseDuckDBUrl('duckdb://customers/1/2/3.pbf');
        expect(result).toEqual({
            schemaName: null,
            tableName: 'customers',
        });
    });

    it('should handle MVT tile URLs', () => {
        const result = parseDuckDBUrl('duckdb://schema.table/0/1/2.mvt');
        expect(result).toEqual({
            schemaName: 'schema',
            tableName: 'table',
        });
    });
});
