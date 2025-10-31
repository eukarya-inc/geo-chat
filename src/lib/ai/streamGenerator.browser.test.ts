import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import { createDBContext, type DBContext } from '../duckdb/dbContext';
import { createAIStreamGenerator } from './streamGenerator';
import { setupWorker } from 'msw/browser';
import { suppressConsole } from '../../test/console';
import { initializeDuckDB } from '../../test/duckdb';
import { collectStream } from '../../test/streamCollector';
import { createMockTools } from '../../test/tools';
import { createAIMockHandler } from '../../test/aiMockHandler';

describe('streamGenerator integration test (browser, real DuckDB-WASM)', () => {
    let db: AsyncDuckDB;
    let dbContext: DBContext;
    let restoreConsole: (() => void) | undefined;

    // Setup MSW worker
    const mswWorker = setupWorker(...handlers);

    beforeAll(async () => {
        // Start MSW worker
        await mswWorker.start({ onUnhandledRequest: 'error', quiet: true });

        // Suppress console output during tests
        restoreConsole = suppressConsole();

        // Initialize DuckDB-WASM and create test data
        db = await initializeDuckDB();
        await createTestData(db);

        // Create DB context for tests
        dbContext = createDBContext(db);
    });

    afterEach(() => {
        // Reset MSW handlers after each test
        mswWorker.resetHandlers();
    });

    afterAll(async () => {
        // Stop MSW worker
        mswWorker.stop();

        // Cleanup
        if (db) {
            await db.terminate();
        }

        // Restore original console functions
        restoreConsole?.();
    });

    it('streams AI response with DuckDB tool execution for data analysis', async () => {
        // Create mock tools using helper function
        const { tools } = createMockTools(dbContext);

        // Create stream generator
        const generator = createAIStreamGenerator({
            messages: [
                {
                    role: 'user',
                    content: 'test_prefectures テーブルのデータを分析して、人口が最も多い都道府県を教えてください。',
                },
            ],
            apiKey: 'test-api-key',
            systemPrompt: 'あなたはデータ分析アシスタントです。DuckDBを使ってデータを分析し、結果を説明してください。',
            tools,
        });

        // Collect stream parts
        const collected = await collectStream(generator);

        // Verify stream has content
        expect(collected.parts.length).toBeGreaterThan(0);
        expect(collected.messages.length).toBe(3); // 1st assistant + tool + 2nd assistant

        // First message: assistant with tool-call
        const firstAssistantMsg = collected.messages[0];
        expect(firstAssistantMsg.role).toBe('assistant');
        if (firstAssistantMsg.role === 'assistant' && Array.isArray(firstAssistantMsg.content)) {
            const toolCallContent = firstAssistantMsg.content.find(
                (c): c is { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown } =>
                    c.type === 'tool-call'
            );
            expect(toolCallContent).toBeDefined();
            if (toolCallContent) {
                expect(toolCallContent.toolName).toBe('duckdb_query');
                expect(toolCallContent.input).toEqual({
                    sql: 'SELECT prefecture, population FROM test_prefectures ORDER BY population DESC LIMIT 1',
                });
            }
        }

        // Second message: tool result
        const toolMsg = collected.messages[1];
        expect(toolMsg.role).toBe('tool');
        if (toolMsg.role === 'tool') {
            expect(toolMsg.content.length).toBe(1);
            expect(toolMsg.content[0].toolName).toBe('duckdb_query');
        }

        // Third message: assistant with final text answer
        const secondAssistantMsg = collected.messages[2];
        expect(secondAssistantMsg.role).toBe('assistant');
        if (secondAssistantMsg.role === 'assistant' && Array.isArray(secondAssistantMsg.content)) {
            const textContent = secondAssistantMsg.content.find(c => c.type === 'text');
            expect(textContent).toBeDefined();
            if (textContent) {
                expect(textContent.text).toContain('東京都');
            }
        }

        // Verify finish event was sent
        expect(collected.finished).toBe(true);
    });
});

// Helper function to create test data
async function createTestData(db: AsyncDuckDB): Promise<void> {
    const conn = await db.connect();

    // Create test data directly (browser environment can't read files)
    await conn.query(`
        CREATE TABLE test_prefectures (
            prefecture VARCHAR,
            population INTEGER,
            area INTEGER
        );
        INSERT INTO test_prefectures VALUES
            ('東京都', 14000000, 2194),
            ('神奈川県', 9200000, 2416),
            ('大阪府', 8800000, 1905),
            ('愛知県', 7500000, 5173),
            ('埼玉県', 7300000, 3798),
            ('千葉県', 6300000, 5158),
            ('兵庫県', 5500000, 8401),
            ('北海道', 5200000, 83424),
            ('福岡県', 5100000, 4987),
            ('静岡県', 3600000, 7777);
    `);

    await conn.close();
}

// MSW handlers for mocking Anthropic API (browser mode)
// Using declarative configuration for cleaner test setup
const handlers = [
    createAIMockHandler([
        // First turn: User asks for analysis, AI calls DuckDB tool
        {
            answers: [
                {
                    type: 'tool-call',
                    toolName: 'duckdb_query',
                    args: {
                        sql: 'SELECT prefecture, population FROM test_prefectures ORDER BY population DESC LIMIT 1',
                    },
                },
            ],
        },
        // Second turn: Tool result received, AI provides final answer
        {
            answers: [
                {
                    type: 'text',
                    content: '分析結果: 人口が最も多いのは東京都です。',
                },
            ],
        },
    ]),
];
