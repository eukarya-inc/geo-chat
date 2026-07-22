import { useAtomValue } from 'jotai';
import { useCallback, useRef, useState } from 'react';
import type { ModelMessage } from 'ai';

import { getTables, getTableSchema } from '@/lib/duckdb/db';
import { apiKeyAtom, modelAtom } from '@/store/settings';
import { runAgent, type AgentEvent } from './agent';
import { defaultToolContext } from './toolContext';
import { createTools } from './tools';
import type { PromptContext } from './systemPrompt';
import type { ChatMessage, MessagePart } from './types';

let idCounter = 0;
const nextId = () => `m${++idCounter}`;

/** Gathers the live table schemas the system prompt needs each turn. */
async function buildPromptContext(): Promise<PromptContext> {
    const names = await getTables();
    const tables = await Promise.all(names.map(async name => ({ name, columns: await getTableSchema(name) })));
    return { now: new Date(), tables };
}

/** Turns raw error text into a short, actionable message for the user. */
function friendlyError(message: string): string {
    if (message.includes('401') || /api key/i.test(message)) {
        return 'Authentication failed (401). Check your API key in Settings.';
    }
    if (message.includes('429') || /rate limit/i.test(message)) {
        return 'Rate limit reached (429). Wait a moment and try again.';
    }
    return message;
}

/**
 * Owns the chat state for the UI. It keeps two parallel histories: `messages`
 * for rendering (ChatMessage parts), and a ref of AI SDK `ModelMessage`s that is
 * fed back into every turn so the model keeps its own tool calls in context.
 */
export function useAgentChat() {
    const apiKey = useAtomValue(apiKeyAtom);
    const model = useAtomValue(modelAtom);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [status, setStatus] = useState<'idle' | 'streaming'>('idle');
    const history = useRef<ModelMessage[]>([]);
    const abortRef = useRef<AbortController | null>(null);

    // Mutate the parts of one assistant message by id.
    const updateAssistant = useCallback((id: string, update: (parts: MessagePart[]) => MessagePart[]) => {
        setMessages(prev => prev.map(m => (m.id === id ? { ...m, parts: update(m.parts) } : m)));
    }, []);

    const sendMessage = useCallback(
        async (text: string) => {
            if (!apiKey || status === 'streaming') return;

            const userMessage: ChatMessage = { id: nextId(), role: 'user', parts: [{ type: 'text', text }] };
            const assistantId = nextId();
            setMessages(prev => [...prev, userMessage, { id: assistantId, role: 'assistant', parts: [] }]);
            history.current.push({ role: 'user', content: text });
            setStatus('streaming');

            const abort = new AbortController();
            abortRef.current = abort;

            // Fold each agent event into the assistant message's parts.
            const onEvent = (event: AgentEvent) => {
                if (event.type === 'text-delta') {
                    updateAssistant(assistantId, parts => {
                        const last = parts[parts.length - 1];
                        if (last?.type === 'text') {
                            return [...parts.slice(0, -1), { type: 'text', text: last.text + event.text }];
                        }
                        return [...parts, { type: 'text', text: event.text }];
                    });
                } else if (event.type === 'tool-call') {
                    updateAssistant(assistantId, parts => [
                        ...parts,
                        {
                            type: 'tool',
                            toolCallId: event.toolCallId,
                            name: event.name,
                            input: event.input,
                            state: 'running',
                        },
                    ]);
                } else if (event.type === 'tool-result') {
                    updateAssistant(assistantId, parts =>
                        parts.map(p =>
                            p.type === 'tool' && p.toolCallId === event.toolCallId
                                ? { ...p, state: event.isError ? 'error' : 'done', output: event.output }
                                : p
                        )
                    );
                } else if (event.type === 'error') {
                    updateAssistant(assistantId, parts => [
                        ...parts,
                        { type: 'error', message: friendlyError(event.message) },
                    ]);
                }
            };

            try {
                const promptContext = await buildPromptContext();
                const newMessages = await runAgent({
                    apiKey,
                    model,
                    messages: history.current,
                    tools: createTools(defaultToolContext()),
                    promptContext,
                    onEvent,
                    abortSignal: abort.signal,
                });
                // Keep the model's own messages (tool calls included) for the next turn.
                history.current.push(...newMessages);
            } catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                onEvent({ type: 'error', message });
            } finally {
                setStatus('idle');
                abortRef.current = null;
            }
        },
        [apiKey, model, status, updateAssistant]
    );

    const stop = useCallback(() => abortRef.current?.abort(), []);

    const reset = useCallback(() => {
        abortRef.current?.abort();
        history.current = [];
        setMessages([]);
        setStatus('idle');
    }, []);

    return { messages, status, sendMessage, stop, reset };
}
