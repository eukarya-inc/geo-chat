import { http, HttpResponse } from 'msw';

/**
 * MSW handlers for AI SDK integration tests
 *
 * These handlers mock the Anthropic Claude API for testing purposes.
 * They support:
 * - Basic text streaming
 * - Tool calls (agent-like behavior)
 * - Multi-step workflows
 */
export const aiTestHandlers = [
    // Mock Anthropic API (both streaming and non-streaming)
    http.post('https://api.anthropic.com/v1/messages', async ({ request }) => {
        const body = (await request.json()) as {
            messages: Array<{ role: string; content: unknown }>;
            tools?: unknown[];
            stream?: boolean;
        };

        const encoder = new TextEncoder();

        // Check if streaming is requested
        // generateText doesn't send stream property (or sends undefined), streamText sends stream: true
        // We treat undefined as non-streaming for generateText
        const isStreaming = body.stream === true;

        // Check if tools are provided (agent mode)
        const hasTools = body.tools && body.tools.length > 0;

        // Check if this is a continuation with tool results
        const hasToolResults = body.messages.some(msg => {
            if (typeof msg.content === 'string') return false;
            if (Array.isArray(msg.content)) {
                return msg.content.some((block: { type: string }) => block.type === 'tool_result');
            }
            return false;
        });

        // Handle non-streaming requests (generateText)
        if (!isStreaming) {
            return HttpResponse.json({
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                content: [
                    {
                        type: 'text',
                        text: 'こんにちは！テストからの応答です。',
                    },
                ],
                model: 'claude-sonnet-4-5-20250929',
                stop_reason: 'end_turn',
                stop_sequence: null,
                usage: {
                    input_tokens: 10,
                    output_tokens: 10,
                },
            });
        }

        if (hasTools && !hasToolResults) {
            // First response in agent mode: AI decides to use a tool
            const stream = new ReadableStream({
                start(controller) {
                    // Send message_start event
                    controller.enqueue(
                        encoder.encode(
                            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test_1","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"usage":{"input_tokens":20,"output_tokens":0}}}\n\n'
                        )
                    );

                    // Send content_block_start for text
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
                        )
                    );

                    // Send text delta
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"計算を実行しますね。"}}\n\n'
                        )
                    );

                    // Send content_block_stop for text
                    controller.enqueue(
                        encoder.encode('event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n')
                    );

                    // Send content_block_start for tool_use
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"tool_use","id":"tool_call_123","name":"calculator","input":{}}}\n\n'
                        )
                    );

                    // Send tool input delta
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\\"operation\\":\\"add\\",\\""}}\n\n'
                        )
                    );

                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"a\\":5,\\"b\\":3}"}}\n\n'
                        )
                    );

                    // Send content_block_stop for tool_use
                    controller.enqueue(
                        encoder.encode('event: content_block_stop\ndata: {"type":"content_block_stop","index":1}\n\n')
                    );

                    // Send message_delta event
                    controller.enqueue(
                        encoder.encode(
                            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"tool_use","stop_sequence":null},"usage":{"output_tokens":50}}\n\n'
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
        } else if (hasTools && hasToolResults) {
            // Second response in agent mode: AI processes tool result and provides final answer
            const stream = new ReadableStream({
                start(controller) {
                    // Send message_start event
                    controller.enqueue(
                        encoder.encode(
                            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test_2","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"usage":{"input_tokens":100,"output_tokens":0}}}\n\n'
                        )
                    );

                    // Send content_block_start for text
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
                        )
                    );

                    // Send text delta with final answer
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"計算結果は8です！"}}\n\n'
                        )
                    );

                    // Send content_block_stop for text
                    controller.enqueue(
                        encoder.encode('event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n')
                    );

                    // Send message_delta event
                    controller.enqueue(
                        encoder.encode(
                            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":20}}\n\n'
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
        } else {
            // Simple text streaming (no tools)
            const stream = new ReadableStream({
                start(controller) {
                    // Send message_start event
                    controller.enqueue(
                        encoder.encode(
                            'event: message_start\ndata: {"type":"message_start","message":{"id":"msg_test","type":"message","role":"assistant","content":[],"model":"claude-sonnet-4-5-20250929","stop_reason":null,"usage":{"input_tokens":10,"output_tokens":0}}}\n\n'
                        )
                    );

                    // Send content_block_start event
                    controller.enqueue(
                        encoder.encode(
                            'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n'
                        )
                    );

                    // Send content_block_delta events with mock response
                    const mockText = 'こんにちは！テストからの応答です。';
                    controller.enqueue(
                        encoder.encode(
                            `event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"${mockText}"}}\n\n`
                        )
                    );

                    // Send content_block_stop event
                    controller.enqueue(
                        encoder.encode('event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n')
                    );

                    // Send message_delta event
                    controller.enqueue(
                        encoder.encode(
                            'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn","stop_sequence":null},"usage":{"output_tokens":10}}\n\n'
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
        }
    }),
];
