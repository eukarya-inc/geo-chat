import { createAnthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText, type ModelMessage } from 'ai';

import { buildSystemPrompt, type PromptContext } from './systemPrompt';
import type { AgentTools } from './tools';

/**
 * A small, UI-friendly view of what the model is doing. The agent loop translates
 * the AI SDK's rich stream into just these five events; the chat hook folds them
 * into message parts. Everything the UI needs, nothing it doesn't.
 */
export type AgentEvent =
    | { type: 'text-delta'; text: string }
    | { type: 'tool-call'; toolCallId: string; name: string; input: unknown }
    | { type: 'tool-result'; toolCallId: string; output: unknown; isError?: boolean }
    | { type: 'error'; message: string }
    | { type: 'finish' };

export interface RunAgentOptions {
    apiKey: string;
    model: string;
    /** Full conversation so far as AI SDK model messages (includes prior tool calls). */
    messages: ModelMessage[];
    tools: AgentTools;
    /** Live schema/date context appended to the system prompt each turn. */
    promptContext: PromptContext;
    onEvent: (event: AgentEvent) => void;
    abortSignal: AbortSignal;
}

/**
 * Runs one assistant turn: the model may call tools, read their results, and
 * call more tools, looping until it produces a final answer or hits the step cap.
 * Returns the messages generated this turn (assistant text + tool calls/results)
 * so the caller can append them and keep tool calls in context next turn.
 */
export async function runAgent(options: RunAgentOptions): Promise<ModelMessage[]> {
    // Anthropic normally blocks browser calls (to protect your key); this header
    // opts in. It is only acceptable here because the user supplied their own key.
    const anthropic = createAnthropic({
        apiKey: options.apiKey,
        headers: { 'anthropic-dangerous-direct-browser-access': 'true' },
    });

    const result = streamText({
        model: anthropic(options.model),
        system: buildSystemPrompt(options.promptContext),
        messages: options.messages,
        tools: options.tools,
        temperature: 0,
        maxOutputTokens: 8000,
        // The agent loop: keep taking steps (tool call -> tool result -> model) until
        // the model answers without calling a tool, or we reach 30 steps as a safety cap.
        stopWhen: stepCountIs(30),
        abortSignal: options.abortSignal,
    });

    // fullStream carries every event: text chunks, tool calls, tool results, errors.
    for await (const part of result.fullStream) {
        switch (part.type) {
            case 'text-delta':
                options.onEvent({ type: 'text-delta', text: part.text });
                break;
            case 'tool-call':
                options.onEvent({
                    type: 'tool-call',
                    toolCallId: part.toolCallId,
                    name: part.toolName,
                    input: part.input,
                });
                break;
            case 'tool-result':
                options.onEvent({ type: 'tool-result', toolCallId: part.toolCallId, output: part.output });
                break;
            case 'tool-error':
                options.onEvent({
                    type: 'tool-result',
                    toolCallId: part.toolCallId,
                    output: String(part.error),
                    isError: true,
                });
                break;
            case 'error':
                options.onEvent({ type: 'error', message: errorMessage(part.error) });
                break;
        }
    }

    options.onEvent({ type: 'finish' });
    const { messages } = await result.response;
    return messages;
}

/** Pulls a readable message out of whatever the stream reports as an error. */
function errorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown error';
}
