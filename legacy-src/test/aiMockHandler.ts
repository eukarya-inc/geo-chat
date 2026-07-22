import { http, HttpResponse, type HttpHandler } from 'msw';

/**
 * Types for declarative AI mock configuration
 */

/** Tool call answer in conversation turn */
export interface ToolCallAnswer {
    type: 'tool-call';
    toolName: string;
    args: Record<string, unknown>;
}

/** Text answer in conversation turn */
export interface TextAnswer {
    type: 'text';
    content: string;
}

/** Answer types in conversation turn */
export type Answer = ToolCallAnswer | TextAnswer;

/** Configuration for a single conversation turn */
export interface ConversationTurn {
    /** Answers to provide in this turn */
    answers: Answer[];
}

/**
 * Create declarative AI mock handler for Anthropic API
 *
 * This function creates an MSW handler that mocks Anthropic's streaming API
 * with a simple declarative configuration. It automatically generates proper
 * Server-Sent Events (SSE) streams for both tool calls and text responses.
 *
 * Turns are consumed sequentially in order. Each API request consumes the next
 * turn in the array.
 *
 * @param turns - Array of conversation turns with their answers (consumed in order)
 * @returns MSW HTTP handler for Anthropic API
 *
 * @example
 * ```ts
 * const handler = createAIMockHandler([
 *   // First turn: AI calls a tool
 *   {
 *     answers: [
 *       {
 *         type: 'tool-call',
 *         toolName: 'duckdb_query',
 *         args: { sql: 'SELECT * FROM table' }
 *       }
 *     ]
 *   },
 *   // Second turn: AI provides final answer after tool execution
 *   {
 *     answers: [
 *       { type: 'text', content: 'Analysis complete!' }
 *     ]
 *   }
 * ])
 * ```
 */
export function createAIMockHandler(turns: ConversationTurn[]): HttpHandler {
    let turnIndex = 0;
    return http.post('https://api.anthropic.com/v1/messages', async () => {
        const encoder = new TextEncoder();

        // Get current turn and advance index
        const turn = turns[turnIndex];
        turnIndex++;

        if (!turn) {
            return HttpResponse.json(
                { error: `No more turns available in mock configuration (requested turn ${turnIndex})` },
                { status: 400 }
            );
        }

        // Build Server-Sent Events (SSE) stream response
        const stream = new ReadableStream({
            start(controller) {
                // Send message_start event
                controller.enqueue(
                    encoder.encode(
                        `event: message_start\ndata: {"type":"message_start","message":{"id":"msg_${Date.now()}","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"usage":{"input_tokens":100,"output_tokens":0}}}\n\n`
                    )
                );

                let blockIndex = 0;

                // Process each answer in the turn
                for (const answer of turn.answers) {
                    if (answer.type === 'tool-call') {
                        // Send tool_use content block
                        controller.enqueue(
                            encoder.encode(
                                `event: content_block_start\ndata: {"type":"content_block_start","index":${blockIndex},"content_block":{"type":"tool_use","id":"tool_${blockIndex}","name":"${answer.toolName}","input":{}}}\n\n`
                            )
                        );

                        // Send tool arguments as JSON delta
                        const argsJson = JSON.stringify(answer.args).replace(/"/g, '\\"');
                        controller.enqueue(
                            encoder.encode(
                                `event: content_block_delta\ndata: {"type":"content_block_delta","index":${blockIndex},"delta":{"type":"input_json_delta","partial_json":"${argsJson}"}}\n\n`
                            )
                        );

                        controller.enqueue(
                            encoder.encode(
                                `event: content_block_stop\ndata: {"type":"content_block_stop","index":${blockIndex}}\n\n`
                            )
                        );
                    } else if (answer.type === 'text') {
                        // Send text content block
                        controller.enqueue(
                            encoder.encode(
                                `event: content_block_start\ndata: {"type":"content_block_start","index":${blockIndex},"content_block":{"type":"text","text":""}}\n\n`
                            )
                        );

                        controller.enqueue(
                            encoder.encode(
                                `event: content_block_delta\ndata: {"type":"content_block_delta","index":${blockIndex},"delta":{"type":"text_delta","text":"${answer.content}"}}\n\n`
                            )
                        );

                        controller.enqueue(
                            encoder.encode(
                                `event: content_block_stop\ndata: {"type":"content_block_stop","index":${blockIndex}}\n\n`
                            )
                        );
                    }

                    blockIndex++;
                }

                // Determine stop reason based on answer types
                const stopReason = turn.answers.some(a => a.type === 'tool-call') ? 'tool_use' : 'end_turn';

                // Send message_delta event
                controller.enqueue(
                    encoder.encode(
                        `event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"${stopReason}","stop_sequence":null},"usage":{"output_tokens":50}}\n\n`
                    )
                );

                // Send message_stop event
                controller.enqueue(encoder.encode('event: message_stop\ndata: {"type":"message_stop"}\n\n'));

                controller.close();
            },
        });

        return new HttpResponse(stream, {
            headers: {
                'Content-Type': 'text/event-stream',
                'anthropic-version': '2023-06-01',
            },
        });
    });
}
