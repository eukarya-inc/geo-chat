import { describe, it, expect } from 'vitest';

describe('TABLE_CREATED marker regex', () => {
    // The regex pattern from StructuredMessageRenderer.tsx
    const tableCreatedRegex = /<!--TABLE_CREATED:([^:>]+)(?::FROM_EXAMPLE)?-->/g;

    it('should extract table name from regular TABLE_CREATED marker', () => {
        const text = '<!--TABLE_CREATED:customer-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));
        
        expect(matches).toHaveLength(1);
        expect(matches[0][0]).toBe('<!--TABLE_CREATED:customer-->');
        expect(matches[0][1]).toBe('customer');
    });

    it('should extract table name from TABLE_CREATED marker with FROM_EXAMPLE', () => {
        const text = '<!--TABLE_CREATED:customer:FROM_EXAMPLE-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));
        
        expect(matches).toHaveLength(1);
        expect(matches[0][0]).toBe('<!--TABLE_CREATED:customer:FROM_EXAMPLE-->');
        expect(matches[0][1]).toBe('customer');
    });

    it('should handle table names with underscores', () => {
        const text = '<!--TABLE_CREATED:test_table_123-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));
        
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('test_table_123');
    });

    it('should handle table names with underscores and FROM_EXAMPLE', () => {
        const text = '<!--TABLE_CREATED:test_table_123:FROM_EXAMPLE-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));
        
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('test_table_123');
    });

    it('should match multiple markers in text', () => {
        const text = 'Some text <!--TABLE_CREATED:table1--> more text <!--TABLE_CREATED:table2:FROM_EXAMPLE--> end';
        const matches = Array.from(text.matchAll(tableCreatedRegex));
        
        expect(matches).toHaveLength(2);
        expect(matches[0][1]).toBe('table1');
        expect(matches[1][1]).toBe('table2');
    });

    it('should handle table name with numbers', () => {
        const text = '<!--TABLE_CREATED:table_1755629945362-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));
        
        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('table_1755629945362');
    });

    it('should NOT match invalid formats', () => {
        const invalidTexts = [
            '<!--TABLE_CREATED:-->',  // Empty table name
            '<!--TABLE_CREATED::FROM_EXAMPLE-->',  // Missing table name
            '<!--TABLE_CREATED-->',  // No colon
        ];

        invalidTexts.forEach(text => {
            const matches = Array.from(text.matchAll(tableCreatedRegex));
            expect(matches).toHaveLength(0);
        });
    });
});

describe('messageConverter TABLE_CREATED functions', () => {
    // Test the functions from messageConverter.ts
    function cleanUserMessage(content: string): string {
        // Remove both formats: <!--TABLE_CREATED:tablename--> and <!--TABLE_CREATED:tablename:FROM_EXAMPLE-->
        return content.replace(/<!--TABLE_CREATED:[^>]+-->/g, '').trim();
    }

    function extractTableName(content: string): string | null {
        // First try to match with :FROM_EXAMPLE
        let match = content.match(/<!--TABLE_CREATED:([^:>]+):FROM_EXAMPLE-->/);
        if (match) return match[1];
        
        // Then try regular format
        match = content.match(/<!--TABLE_CREATED:([^:>]+)-->/);
        return match ? match[1] : null;
    }

    it('should clean regular TABLE_CREATED marker', () => {
        const content = 'Some text <!--TABLE_CREATED:customer--> more text';
        expect(cleanUserMessage(content)).toBe('Some text  more text');
    });

    it('should clean TABLE_CREATED marker with FROM_EXAMPLE', () => {
        const content = 'Some text <!--TABLE_CREATED:customer:FROM_EXAMPLE--> more text';
        expect(cleanUserMessage(content)).toBe('Some text  more text');
    });

    it('should extract table name correctly', () => {
        expect(extractTableName('<!--TABLE_CREATED:customer-->')).toBe('customer');
        expect(extractTableName('<!--TABLE_CREATED:customer:FROM_EXAMPLE-->')).toBe('customer');
        expect(extractTableName('<!--TABLE_CREATED:test_table_123-->')).toBe('test_table_123');
        expect(extractTableName('<!--TABLE_CREATED:test_table_123:FROM_EXAMPLE-->')).toBe('test_table_123');
    });
});

describe('AIChatModeling TABLE_CREATED extraction', () => {
    // Test the logic from AIChatModeling.tsx
    function extractTableName(content: string): string | null {
        let tableName: string | null = null;
        if (content.includes(':FROM_EXAMPLE-->')) {
            // Example format: <!--TABLE_CREATED:customer:FROM_EXAMPLE-->
            const match = content.match(/<!--TABLE_CREATED:(.+?):FROM_EXAMPLE-->/);
            tableName = match ? match[1] : null;
        } else {
            // Regular format: <!--TABLE_CREATED:customer-->
            const match = content.match(/<!--TABLE_CREATED:(.+?)-->/);
            tableName = match ? match[1] : null;
        }
        return tableName;
    }

    it('should extract table name from regular format', () => {
        const content = '<!--TABLE_CREATED:customer-->';
        expect(extractTableName(content)).toBe('customer');
    });

    it('should extract table name from FROM_EXAMPLE format', () => {
        const content = '<!--TABLE_CREATED:customer:FROM_EXAMPLE-->';
        expect(extractTableName(content)).toBe('customer');
    });

    it('should handle table names with underscores', () => {
        expect(extractTableName('<!--TABLE_CREATED:test_table-->')).toBe('test_table');
        expect(extractTableName('<!--TABLE_CREATED:test_table:FROM_EXAMPLE-->')).toBe('test_table');
    });

    it('should detect FROM_EXAMPLE flag', () => {
        const withExample = '<!--TABLE_CREATED:customer:FROM_EXAMPLE-->';
        const withoutExample = '<!--TABLE_CREATED:customer-->';
        
        expect(withExample.includes(':FROM_EXAMPLE-->')).toBe(true);
        expect(withoutExample.includes(':FROM_EXAMPLE-->')).toBe(false);
    });
});