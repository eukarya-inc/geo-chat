import { describe, it, expect } from 'vitest';
import { extractDataUrl } from './tableCreation';

describe('extractDataUrl', () => {
    it('should detect valid HTTP URL', () => {
        const url = 'https://example.com/data.parquet';
        expect(extractDataUrl(url)).toBe(url);
    });

    it('should detect URL with encoded characters', () => {
        const url = 'https://example.com/data/%E3%83%86%E3%82%B9%E3%83%88_file.parquet';
        expect(extractDataUrl(url)).toBe(url);
    });

    it('should detect any valid HTTPS URL regardless of extension', () => {
        expect(extractDataUrl('https://example.com/data.csv')).toBe('https://example.com/data.csv');
        expect(extractDataUrl('https://example.com/data.geojson')).toBe('https://example.com/data.geojson');
        expect(extractDataUrl('https://example.com/data.txt')).toBe('https://example.com/data.txt');
        expect(extractDataUrl('https://example.com/data')).toBe('https://example.com/data');
    });

    it('should detect HTTP URLs', () => {
        const url = 'http://example.com/data.parquet';
        expect(extractDataUrl(url)).toBe(url);
    });

    it('should detect URL with query parameters', () => {
        const url = 'https://example.com/data.parquet?version=1';
        expect(extractDataUrl(url)).toBe(url);
    });

    it('should detect URL with hash', () => {
        const url = 'https://example.com/data.csv#section';
        expect(extractDataUrl(url)).toBe(url);
    });

    it('should reject non-URL text', () => {
        expect(extractDataUrl('not a url')).toBeNull();
        expect(extractDataUrl('example.com/data.parquet')).toBeNull();
    });

    it('should reject non-HTTP protocols', () => {
        expect(extractDataUrl('ftp://example.com/data.parquet')).toBeNull();
        expect(extractDataUrl('file:///path/to/file.parquet')).toBeNull();
    });

    it('should handle empty or invalid input', () => {
        expect(extractDataUrl('')).toBeNull();
        expect(extractDataUrl('   ')).toBeNull();
    });

    it('should trim whitespace and normalize URL', () => {
        const input = '  https://example.com/data.parquet  ';
        expect(extractDataUrl(input)).toBe('https://example.com/data.parquet');
    });
});
