import { describe, it, expect, beforeEach } from 'vitest';
import { AIStore } from './AIStore';
import type { StructuredMessage } from '../../types/message';

describe('AIStore', () => {
    let store: AIStore;

    beforeEach(() => {
        store = new AIStore();
    });

    describe('processStreamPart - tool-result sanitization', () => {
        it('should remove large arrays from tool results', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'test query' },
                { role: 'assistant', content: [], streaming: '' },
            ];

            const streamPart = {
                type: 'tool-result' as const,
                toolCallId: 'toolu_123',
                toolName: 'duckdb_query',
                result: {
                    success: true,
                    data: Array(100).fill({ id: 1, name: 'test' }), // Large array (100 > 5)
                    rowCount: 100,
                    sql: 'SELECT * FROM test',
                },
            };

            // @ts-expect-error - accessing private method for testing
            const result = store.processStreamPart(streamPart, messages, '');

            const lastMessage = result.messages[result.messages.length - 1];
            expect(lastMessage.role).toBe('assistant');
            expect(Array.isArray(lastMessage.content)).toBe(true);

            const content = lastMessage.content as Array<{ type: string; result?: unknown }>;
            expect(content.length).toBe(1);
            expect(content[0].type).toBe('tool_result');

            const toolResult = content[0].result as {
                success: boolean;
                data?: unknown[];
                rowCount: number;
                sql: string;
            };

            // Large array should be removed
            expect(toolResult.data).toBeUndefined();

            // Metadata should be preserved
            expect(toolResult.success).toBe(true);
            expect(toolResult.rowCount).toBe(100);
            expect(toolResult.sql).toBe('SELECT * FROM test');
        });

        it('should preserve all metadata fields except large arrays', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'test query' },
                { role: 'assistant', content: [], streaming: '' },
            ];

            const streamPart = {
                type: 'tool-result' as const,
                toolCallId: 'toolu_456',
                toolName: 'duckdb_query',
                result: {
                    success: true,
                    data: Array(100).fill({ large: 'data' }), // Large array - will be removed
                    rowCount: 100,
                    totalRowCount: 500,
                    sql: 'SELECT * FROM large_table',
                    sqlExplanation: 'This queries all data',
                    suggestions: ['Use LIMIT', 'Add WHERE clause'], // Small array - preserved
                    createdTable: 'my_table',
                    dataTruncated: true,
                    warning: 'Data was truncated',
                },
            };

            // @ts-expect-error - accessing private method for testing
            const result = store.processStreamPart(streamPart, messages, '');

            const lastMessage = result.messages[result.messages.length - 1];
            const content = lastMessage.content as Array<{ type: string; result?: unknown }>;
            const toolResult = content[0].result as Record<string, unknown>;

            // Large array field should be removed
            expect(toolResult.data).toBeUndefined();

            // All other metadata should be preserved
            expect(toolResult.success).toBe(true);
            expect(toolResult.rowCount).toBe(100);
            expect(toolResult.totalRowCount).toBe(500);
            expect(toolResult.sql).toBe('SELECT * FROM large_table');
            expect(toolResult.sqlExplanation).toBe('This queries all data');
            // Small arrays are preserved
            expect(toolResult.suggestions).toEqual(['Use LIMIT', 'Add WHERE clause']);
            expect(toolResult.createdTable).toBe('my_table');
            expect(toolResult.dataTruncated).toBe(true);
            expect(toolResult.warning).toBe('Data was truncated');
        });

        it('should handle tool results without large arrays', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'test query' },
                { role: 'assistant', content: [], streaming: '' },
            ];

            const streamPart = {
                type: 'tool-result' as const,
                toolCallId: 'toolu_789',
                toolName: 'duckdb_query',
                result: {
                    success: false,
                    error: 'Query failed',
                    sql: 'SELECT * FROM missing_table',
                },
            };

            // @ts-expect-error - accessing private method for testing
            const result = store.processStreamPart(streamPart, messages, '');

            const lastMessage = result.messages[result.messages.length - 1];
            const content = lastMessage.content as Array<{ type: string; result?: unknown }>;
            const toolResult = content[0].result as { error: string; sql: string };

            // All fields preserved when no large arrays
            expect(toolResult.error).toBe('Query failed');
            expect(toolResult.sql).toBe('SELECT * FROM missing_table');
        });

        it('should preserve streaming text when adding tool result', () => {
            const messages: StructuredMessage[] = [
                { role: 'user', content: 'test query' },
                { role: 'assistant', content: [], streaming: '' },
            ];

            const streamingText = 'Analyzing data...';

            const streamPart = {
                type: 'tool-result' as const,
                toolCallId: 'toolu_abc',
                toolName: 'duckdb_query',
                result: {
                    success: true,
                    data: [{ id: 1 }],
                    rowCount: 1,
                },
            };

            // @ts-expect-error - accessing private method for testing
            const result = store.processStreamPart(streamPart, messages, streamingText);

            const lastMessage = result.messages[result.messages.length - 1];
            const content = lastMessage.content as Array<{ type: string; text?: string; result?: unknown }>;

            // Should have text block followed by tool result
            expect(content.length).toBe(2);
            expect(content[0].type).toBe('text');
            expect(content[0].text).toBe('Analyzing data...');
            expect(content[1].type).toBe('tool_result');

            // Streaming text should be cleared
            expect(result.streamingText).toBe('');
        });
    });
});
