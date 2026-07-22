import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, generateText, stepCountIs, tool } from 'ai';
import { z } from 'zod';
import { beforeAll, afterEach, afterAll, describe, it, expect } from 'vitest';
import { setupServer } from 'msw/node';
import { aiTestHandlers } from './ai.test.handlers';

/**
 * AI SDK Integration Test Reference
 *
 * This test suite serves as a reference for testing AI-related functionality with MSW mocking.
 * It demonstrates:
 * - Simple text generation (non-streaming)
 * - Basic text streaming
 * - Agent-like behavior with tool calls
 * - Multi-step workflows
 * - Proper event handling (text-delta, tool-call, tool-result)
 */

// Model constant for consistency
const TEST_MODEL = 'claude-sonnet-4-5-20250929';
const TEST_API_KEY = 'test-api-key';

describe('AI SDK Integration Tests', () => {
    const server = setupServer(...aiTestHandlers);

    // Start MSW server before all tests
    beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));

    // Reset handlers after each test
    afterEach(() => server.resetHandlers());

    // Clean up after all tests
    afterAll(() => server.close());

    describe('Simple Text Generation', () => {
        it('should generate text using generateText (non-streaming)', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            const result = await generateText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: 'こんにちは',
                    },
                ],
            });

            // Verify we received the mocked response
            expect(result.text).toBe('こんにちは！テストからの応答です。');
            expect(result.finishReason).toBe('stop');
        });
    });

    describe('Basic Text Streaming', () => {
        it('should stream AI response using mocked Anthropic API', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            const result = streamText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: 'こんにちは',
                    },
                ],
            });

            // Collect streamed text chunks
            const chunks: string[] = [];
            for await (const chunk of result.textStream) {
                chunks.push(chunk);
            }

            // Verify we received the mocked response
            const fullText = chunks.join('');
            expect(fullText).toBe('こんにちは！テストからの応答です。');
        });

        it('should handle streaming with async generator', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            const result = streamText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: 'テストメッセージ',
                    },
                ],
            });

            // Test that we can iterate over the stream
            let receivedText = false;
            for await (const chunk of result.textStream) {
                expect(typeof chunk).toBe('string');
                receivedText = true;
            }

            expect(receivedText).toBe(true);
        });

        it('should provide full text after streaming completes', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            const result = streamText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: 'テスト',
                    },
                ],
            });

            // Wait for streaming to complete
            const text = await result.text;

            // Verify the final text matches our mock
            expect(text).toBe('こんにちは！テストからの応答です。');
        });
    });

    describe('Agent Workflow with Tool Calls', () => {
        it('should handle tool calls and results in agent flow', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            // Define a simple calculator tool
            const calculatorTool = tool({
                description: 'A calculator that can add two numbers',
                inputSchema: z.object({
                    operation: z.string().describe('The operation to perform'),
                    a: z.number().describe('First number'),
                    b: z.number().describe('Second number'),
                }),
                execute: async ({ a, b }: { operation: string; a: number; b: number }) => {
                    // Simple calculator implementation
                    return { result: a + b };
                },
            });

            const result = streamText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: '5 + 3を計算してください',
                    },
                ],
                tools: {
                    calculator: calculatorTool,
                },
                stopWhen: stepCountIs(5), // Allow multiple steps for tool execution
            });

            // Collect all stream parts
            const textParts: string[] = [];
            const toolCalls: Array<{ name: string; args: unknown }> = [];
            const toolResults: Array<{ name: string; result: unknown }> = [];

            for await (const part of result.fullStream) {
                switch (part.type) {
                    case 'text-delta':
                        textParts.push(part.text);
                        break;
                    case 'tool-call':
                        toolCalls.push({
                            name: part.toolName,
                            args: part.input,
                        });
                        break;
                    case 'tool-result': {
                        const typedPart = part as unknown as {
                            toolName: string;
                            output: unknown;
                        };
                        toolResults.push({
                            name: typedPart.toolName,
                            result: typedPart.output,
                        });
                        break;
                    }
                }
            }

            // Verify that text was generated
            const fullText = textParts.join('');
            expect(fullText.length).toBeGreaterThan(0);
            expect(fullText).toContain('計算');

            // Verify that tool was called
            expect(toolCalls.length).toBeGreaterThan(0);
            expect(toolCalls[0].name).toBe('calculator');

            // Verify tool arguments
            const firstToolCall = toolCalls[0];
            expect(firstToolCall.args).toMatchObject({
                operation: 'add',
                a: 5,
                b: 3,
            });

            // Verify tool result
            expect(toolResults.length).toBeGreaterThan(0);
            expect(toolResults[0].name).toBe('calculator');
            expect(toolResults[0].result).toEqual({ result: 8 });
        });

        it('should stream tool calls and text deltas separately', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            const calculatorTool = tool({
                description: 'A calculator',
                inputSchema: z.object({
                    operation: z.string(),
                    a: z.number(),
                    b: z.number(),
                }),
                execute: async ({ a, b }: { a: number; b: number }) => {
                    return { result: a + b };
                },
            });

            const result = streamText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: 'Calculate something',
                    },
                ],
                tools: {
                    calculator: calculatorTool,
                },
                stopWhen: stepCountIs(5),
            });

            let hasTextDelta = false;
            let hasToolCall = false;
            let hasToolResult = false;

            for await (const part of result.fullStream) {
                if (part.type === 'text-delta') {
                    hasTextDelta = true;
                }
                if (part.type === 'tool-call') {
                    hasToolCall = true;
                }
                if (part.type === 'tool-result') {
                    hasToolResult = true;
                }
            }

            // Verify that all event types were received
            expect(hasTextDelta).toBe(true);
            expect(hasToolCall).toBe(true);
            expect(hasToolResult).toBe(true);
        });

        it('should complete multi-step agent workflow', async () => {
            const anthropic = createAnthropic({
                apiKey: TEST_API_KEY,
            });

            const calculatorTool = tool({
                description: 'A calculator',
                inputSchema: z.object({
                    operation: z.string(),
                    a: z.number(),
                    b: z.number(),
                }),
                execute: async ({ a, b }: { a: number; b: number }) => {
                    return { result: a + b };
                },
            });

            const result = streamText({
                model: anthropic(TEST_MODEL),
                messages: [
                    {
                        role: 'user',
                        content: '計算してください',
                    },
                ],
                tools: {
                    calculator: calculatorTool,
                },
                stopWhen: stepCountIs(5),
            });

            // Wait for completion
            const finalText = await result.text;

            // Verify final text contains expected content
            expect(finalText).toContain('計算');
            expect(finalText.length).toBeGreaterThan(0);
        });
    });
});
