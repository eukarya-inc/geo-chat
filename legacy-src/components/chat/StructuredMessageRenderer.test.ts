import { describe, it, expect } from 'vitest';

describe('TABLE_CREATED marker regex', () => {
    // The regex pattern from StructuredMessageRenderer.tsx
    const tableCreatedRegex = /<!--TABLE_CREATED:([^:>]+)-->/g;

    it('should extract table name from regular TABLE_CREATED marker', () => {
        const text = '<!--TABLE_CREATED:customer-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));

        expect(matches).toHaveLength(1);
        expect(matches[0][0]).toBe('<!--TABLE_CREATED:customer-->');
        expect(matches[0][1]).toBe('customer');
    });

    it('should handle table names with underscores', () => {
        const text = '<!--TABLE_CREATED:test_table_123-->';
        const matches = Array.from(text.matchAll(tableCreatedRegex));

        expect(matches).toHaveLength(1);
        expect(matches[0][1]).toBe('test_table_123');
    });

    it('should match multiple markers in text', () => {
        const text = 'Some text <!--TABLE_CREATED:table1--> more text <!--TABLE_CREATED:table2--> end';
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
            '<!--TABLE_CREATED:-->', // Empty table name
            '<!--TABLE_CREATED-->', // No colon
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
        return content.replace(/<!--TABLE_CREATED:[^>]+-->/g, '').trim();
    }

    function extractTableName(content: string): string | null {
        const match = content.match(/<!--TABLE_CREATED:([^:>]+)-->/);
        return match ? match[1] : null;
    }

    it('should clean regular TABLE_CREATED marker', () => {
        const content = 'Some text <!--TABLE_CREATED:customer--> more text';
        expect(cleanUserMessage(content)).toBe('Some text  more text');
    });

    it('should extract table name correctly', () => {
        expect(extractTableName('<!--TABLE_CREATED:customer-->')).toBe('customer');
        expect(extractTableName('<!--TABLE_CREATED:test_table_123-->')).toBe('test_table_123');
    });
});

describe('AIChatModeling TABLE_CREATED extraction', () => {
    // Test the logic from AIChatModeling.tsx
    function extractTableName(content: string): string | null {
        // Regular format: <!--TABLE_CREATED:customer-->
        const match = content.match(/<!--TABLE_CREATED:(.+?)-->/);
        return match ? match[1] : null;
    }

    it('should extract table name from regular format', () => {
        const content = '<!--TABLE_CREATED:customer-->';
        expect(extractTableName(content)).toBe('customer');
    });

    it('should handle table names with underscores', () => {
        expect(extractTableName('<!--TABLE_CREATED:test_table-->')).toBe('test_table');
    });
});

describe('TABLE_INFO marker removal', () => {
    // Test that TABLE_INFO content is properly removed from display
    function cleanTableInfo(content: string): string {
        return content.replace(/<!--TABLE_INFO_START-->[\s\S]*?<!--TABLE_INFO_END-->/g, '').trim();
    }

    it('should remove TABLE_INFO content from text', () => {
        const content = `<!--TABLE_CREATED:customer-->
<!--TABLE_INFO_START-->
Table: customer
Size: 100 rows × 5 columns
Schema:
  - id: BIGINT
  - name: VARCHAR
Sample data (first 5 rows):
[{"id": 1, "name": "John"}]
<!--TABLE_INFO_END-->`;

        const cleaned = cleanTableInfo(content);
        expect(cleaned).toBe('<!--TABLE_CREATED:customer-->');
    });

    it('should preserve text before and after TABLE_INFO markers', () => {
        const content = `Some text before
<!--TABLE_INFO_START-->
Table info here
<!--TABLE_INFO_END-->
Some text after`;

        const cleaned = cleanTableInfo(content);
        expect(cleaned).toBe('Some text before\n\nSome text after');
    });

    it('should handle multiple TABLE_INFO blocks', () => {
        const content = `Text 1
<!--TABLE_INFO_START-->Info 1<!--TABLE_INFO_END-->
Text 2
<!--TABLE_INFO_START-->Info 2<!--TABLE_INFO_END-->
Text 3`;

        const cleaned = cleanTableInfo(content);
        expect(cleaned).toBe('Text 1\n\nText 2\n\nText 3');
    });
});
