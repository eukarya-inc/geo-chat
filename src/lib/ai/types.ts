/**
 * The chat message model the UI renders. It is intentionally tiny and decoupled
 * from the AI SDK's own message types: the agent loop (agent.ts) emits plain
 * events, and useAgentChat folds those into these structures.
 */

/** One piece of an assistant turn: streamed text, a tool call, or an error. */
export type MessagePart =
    | { type: 'text'; text: string }
    | {
          type: 'tool';
          /** Stable id from the AI SDK, used to match a call to its later result. */
          toolCallId: string;
          name: string;
          input: unknown;
          state: 'running' | 'done' | 'error';
          output?: unknown;
      }
    | { type: 'error'; message: string };

export interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    parts: MessagePart[];
}
