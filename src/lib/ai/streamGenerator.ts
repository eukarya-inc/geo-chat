import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, stepCountIs, type CoreMessage } from 'ai';
import type { Tools } from './tools';

export interface StreamGeneratorOptions {
    messages: CoreMessage[];
    apiKey: string;
    systemPrompt: string;
    tools: Tools;
    abortSignal?: AbortSignal;
}

export interface TokenUsage {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
}

export type StreamPart =
    | { type: 'text-delta'; textDelta: string }
    | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
    | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
    | { type: 'error'; error: string }
    | { type: 'finish'; usage?: TokenUsage };

/**
 * Create a generator that streams AI responses
 * This is the core streaming logic shared between useAIChat and AIChatAssistantUI
 */
export async function* createAIStreamGenerator({
    messages,
    apiKey,
    systemPrompt,
    tools,
    abortSignal,
}: StreamGeneratorOptions): AsyncGenerator<StreamPart> {
    try {
        const anthropicClient = createAnthropic({
            apiKey,
            headers: {
                'anthropic-dangerous-direct-browser-access': 'true',
            },
        });

        const result = streamText({
            model: anthropicClient('claude-sonnet-4-5-20250929'),
            system: systemPrompt,
            messages,
            tools,
            maxOutputTokens: 4000,
            maxRetries: 3,
            abortSignal,
            // Enable multi-step tool execution (default is stepCountIs(1))
            // Allow up to 100 steps for complex agent workflows
            stopWhen: stepCountIs(100),
        });

        // Stream the full response including text and tool calls
        for await (const part of result.fullStream) {
            switch (part.type) {
                case 'text-delta':
                    yield {
                        type: 'text-delta',
                        textDelta: part.text,
                    };
                    break;

                case 'error': {
                    // Extract detailed error message from API errors
                    let errorMessage = 'Unknown error occurred';

                    if (typeof part.error === 'string') {
                        errorMessage = part.error;
                    } else if (part.error instanceof Error) {
                        errorMessage = part.error.message;

                        // Try to extract more details
                        if ('cause' in part.error && part.error.cause) {
                            if (typeof part.error.cause === 'object' && 'message' in part.error.cause) {
                                errorMessage = String(part.error.cause.message);
                            }
                        }
                    } else if (part.error && typeof part.error === 'object') {
                        if ('message' in part.error) {
                            errorMessage = String(part.error.message);
                        }
                    }

                    // Log validation errors to console
                    if (
                        errorMessage.includes('Type validation failed') ||
                        errorMessage.includes('validation failed') ||
                        errorMessage.includes('Expected object, received string')
                    ) {
                        console.log('[Stream Generator] Validation error:', errorMessage);
                    }

                    // Check for specific error patterns and provide user-friendly messages
                    if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
                        errorMessage = 'API rate limit exceeded. Please wait a moment before trying again.';
                    } else if (
                        errorMessage.toLowerCase().includes('overloaded') ||
                        errorMessage.toLowerCase().includes('request_overloaded')
                    ) {
                        errorMessage = 'The API server is currently overloaded. Please try again in a few moments.';
                    } else if (errorMessage.includes('503')) {
                        errorMessage = 'The API service is temporarily unavailable. Please try again later.';
                    } else if (errorMessage.includes('500')) {
                        errorMessage = 'An internal server error occurred. Please try again.';
                    } else if (errorMessage.includes('402')) {
                        errorMessage = 'API quota exceeded or payment required. Please check your API account.';
                    } else if (errorMessage.includes('401')) {
                        errorMessage = 'Invalid API key. Please check your API key configuration.';
                    }

                    console.error('[Stream Generator] API Error:', part.error, 'Extracted message:', errorMessage);
                    yield {
                        type: 'error',
                        error: errorMessage,
                    };
                    break;
                }

                case 'tool-call':
                    try {
                        yield {
                            type: 'tool-call',
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            args: part.input,
                        };
                    } catch (error) {
                        console.warn('[Stream Generator] Tool call error (continuing):', error);
                        // Continue without yielding error to prevent dialogue termination
                    }
                    break;

                case 'tool-result':
                    try {
                        // Type assertion for tool-result properties
                        // In AI SDK v5, tool results use 'output' instead of 'result'
                        const toolResult = part as unknown as {
                            toolCallId: string;
                            toolName: string;
                            output: unknown;
                        };
                        yield {
                            type: 'tool-result',
                            toolCallId: toolResult.toolCallId,
                            toolName: toolResult.toolName,
                            result: toolResult.output, // Map 'output' to 'result' for consistency
                        };
                    } catch (error) {
                        console.warn('[Stream Generator] Tool result error (continuing):', error);
                        // Continue without yielding error to prevent dialogue termination
                    }
                    break;

                default:
                    break;
            }
        }

        // Get token usage from the final result
        await result.text;
        const usage = await result.usage;

        yield {
            type: 'finish',
            usage:
                usage &&
                usage.inputTokens !== undefined &&
                usage.outputTokens !== undefined &&
                usage.totalTokens !== undefined
                    ? {
                          inputTokens: usage.inputTokens,
                          outputTokens: usage.outputTokens,
                          totalTokens: usage.totalTokens,
                      }
                    : undefined,
        };
    } catch (error) {
        // Handle abort error
        if (error instanceof Error && error.name === 'AbortError') {
            yield { type: 'error', error: 'aborted' };
            return;
        }

        // Extract detailed error message
        let errorMessage = 'Unknown error occurred';

        if (error instanceof Error) {
            errorMessage = error.message;

            // Try to extract more details from the error
            if ('cause' in error && error.cause) {
                if (typeof error.cause === 'object' && 'message' in error.cause) {
                    errorMessage = String(error.cause.message);
                }
            }

            // Check for specific error patterns
            if (errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit')) {
                errorMessage = 'API rate limit exceeded. Please wait a moment before trying again.';
            } else if (errorMessage.toLowerCase().includes('overloaded')) {
                errorMessage = 'The API server is currently overloaded. Please try again in a few moments.';
            } else if (errorMessage.includes('503')) {
                errorMessage = 'The API service is temporarily unavailable. Please try again later.';
            } else if (errorMessage.includes('500')) {
                errorMessage = 'An internal server error occurred. Please try again.';
            } else if (errorMessage.includes('402')) {
                errorMessage = 'API quota exceeded or payment required. Please check your API account.';
            } else if (errorMessage.includes('401')) {
                errorMessage = 'Invalid API key. Please check your API key configuration.';
            }

            // Log the full error for debugging
            console.error('[Stream Generator] Full error details:', error);
        }

        yield { type: 'error', error: errorMessage };
    }
}
