import type { ModelMessage, ToolModelMessage, AssistantModelMessage } from 'ai';
import type { StreamPart } from '../lib/ai/streamGenerator';

/**
 * Stream collection utilities for testing
 *
 * Provides helper functions to collect and analyze AI stream responses
 * in tests. Organizes stream parts into CoreMessage format for easier
 * assertion and inspection.
 *
 * @example
 * ```typescript
 * import { collectStreamMessages } from '../../test/streamCollector';
 *
 * const generator = createAIStreamGenerator({ ... });
 * const messages = await collectStreamMessages(generator);
 *
 * // Check assistant message
 * const assistantMsg = messages[0] as CoreAssistantMessage;
 * expect(assistantMsg.role).toBe('assistant');
 * expect(assistantMsg.content[0].type).toBe('tool-call');
 *
 * // Check tool result
 * const toolMsg = messages[1] as CoreToolMessage;
 * expect(toolMsg.role).toBe('tool');
 * ```
 */

/** Collected stream data organized as ModelMessage array */
export interface CollectedStream {
    /** All stream parts in order */
    parts: StreamPart[];
    /** Messages organized in ModelMessage format */
    messages: ModelMessage[];
    /** Error message if stream encountered an error */
    error?: string;
    /** Whether the stream finished successfully */
    finished: boolean;
}

/**
 * Collect and organize all parts from an AI stream into ModelMessage format
 *
 * Iterates through the entire stream and organizes parts into ModelMessage
 * structure, grouping assistant responses and tool results appropriately.
 *
 * @param generator - Async generator producing StreamPart items
 * @returns Promise resolving to organized stream data
 */
export async function collectStream(generator: AsyncGenerator<StreamPart>): Promise<CollectedStream> {
    const parts: StreamPart[] = [];
    const messages: ModelMessage[] = [];
    let error: string | undefined;
    let finished = false;

    // Current assistant message being built
    let currentAssistantContent: Array<
        { type: 'text'; text: string } | { type: 'tool-call'; toolCallId: string; toolName: string; input: unknown }
    > = [];
    let currentTextBuffer = '';

    // Track tool results to group them
    const toolResultsMap = new Map<string, { toolCallId: string; toolName: string; result: unknown }>();

    for await (const part of generator) {
        parts.push(part);

        switch (part.type) {
            case 'text-delta':
                currentTextBuffer += part.textDelta;
                break;

            case 'tool-call':
                // Flush text buffer if exists
                if (currentTextBuffer) {
                    currentAssistantContent.push({ type: 'text', text: currentTextBuffer });
                    currentTextBuffer = '';
                }
                // Add tool call - AI SDK CoreMessage uses 'input' field
                currentAssistantContent.push({
                    type: 'tool-call',
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    input: part.args, // Map our 'args' to AI SDK's 'input'
                });
                break;

            case 'tool-result':
                // Flush current assistant message before tool results
                if (currentTextBuffer) {
                    currentAssistantContent.push({ type: 'text', text: currentTextBuffer });
                    currentTextBuffer = '';
                }
                if (currentAssistantContent.length > 0) {
                    messages.push({
                        role: 'assistant',
                        content: currentAssistantContent,
                    } as AssistantModelMessage);
                    currentAssistantContent = [];
                }

                // Collect tool result
                toolResultsMap.set(part.toolCallId, {
                    toolCallId: part.toolCallId,
                    toolName: part.toolName,
                    result: part.result,
                });
                break;

            case 'error':
                error = part.error;
                break;

            case 'finish':
                finished = true;

                // Flush tool results if any before finish
                if (toolResultsMap.size > 0) {
                    messages.push({
                        role: 'tool',
                        content: Array.from(toolResultsMap.values()).map(tr => ({
                            type: 'tool-result' as const,
                            toolCallId: tr.toolCallId,
                            toolName: tr.toolName,
                            output: tr.result,
                        })),
                    } as ToolModelMessage);
                    toolResultsMap.clear();
                }
                break;
        }
    }

    // Flush final text buffer
    if (currentTextBuffer) {
        currentAssistantContent.push({ type: 'text', text: currentTextBuffer });
    }

    // Build assistant message if we have content
    if (currentAssistantContent.length > 0) {
        messages.push({
            role: 'assistant',
            content: currentAssistantContent,
        } as AssistantModelMessage);
    }

    // Add tool results as tool messages
    if (toolResultsMap.size > 0) {
        messages.push({
            role: 'tool',
            content: Array.from(toolResultsMap.values()).map(tr => ({
                type: 'tool-result' as const,
                toolCallId: tr.toolCallId,
                toolName: tr.toolName,
                output: tr.result,
            })),
        } as ToolModelMessage);
    }

    return {
        parts,
        messages,
        error,
        finished,
    };
}
