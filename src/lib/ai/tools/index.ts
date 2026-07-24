import type { ToolContext } from '../toolContext';

/**
 * The tool registry handed to the agent loop. In the chat-only chapter it is empty:
 * the model has no tools at all, so it can only reply from the conversation itself.
 * Each later chapter adds a group of tools back through a SEAM section here.
 *
 * The function and its shape are kept (it still takes the shared ToolContext and
 * returns a tool map) so the agent loop in agent.ts is untouched as capabilities
 * are added — only this body grows.
 */
export function createTools(ctx: ToolContext) {
    void ctx; // unused until ch1's tools close over it; kept so the signature is stable.

    // CHAPTER SEAM: data tools — SQL + built-in datasets + geocoding. Added in ch1,
    // together with the DATA_GUIDANCE + BUILTIN_DATASETS sections in systemPrompt.ts.
    return {};
}

export type AgentTools = ReturnType<typeof createTools>;
