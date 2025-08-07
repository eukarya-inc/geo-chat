import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type CoreMessage } from 'ai';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../duckdb/dbStateManager';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import { completionTool } from './tools/completionTool';

export interface StreamGeneratorOptions {
  messages: CoreMessage[];
  apiKey: string;
  db?: AsyncDuckDB | null;
  dbStateManager?: DBStateManager | null;
  abortSignal?: AbortSignal;
}

export type StreamPart = 
  | { type: 'text-delta'; textDelta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'error'; error: string }
  | { type: 'finish' };

/**
 * Create a generator that streams AI responses
 * This is the core streaming logic shared between useAIChat and AIChatAssistantUI
 */
export async function* createAIStreamGenerator({
  messages,
  apiKey,
  db,
  dbStateManager,
  abortSignal
}: StreamGeneratorOptions): AsyncGenerator<StreamPart> {
  try {
    const anthropicClient = createAnthropic({
      apiKey,
      headers: {
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });

    const result = await streamText({
      model: anthropicClient('claude-3-5-sonnet-20241022'),
      system: generateSystemPrompt(),
      messages,
      tools: {
        ...(db && {
          duckdb_query: createDuckDBTool(db, dbStateManager || undefined, apiKey),
        }),
        completion: completionTool,
      },
      maxSteps: 50,
      maxTokens: 4000,
      maxRetries: 30,
      abortSignal,
    });

    // Stream the full response including text and tool calls
    for await (const part of result.fullStream) {
      switch (part.type) {
        case 'text-delta':
          yield {
            type: 'text-delta',
            textDelta: part.textDelta
          };
          break;
          
        case 'tool-call':
          yield {
            type: 'tool-call',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            args: part.args
          };
          break;
          
        case 'tool-result':
          yield {
            type: 'tool-result',
            toolCallId: part.toolCallId,
            toolName: part.toolName,
            result: part.result
          };
          break;
      }
    }
    
    yield { type: 'finish' };
  } catch (error) {
    // Handle abort error
    if (error instanceof Error && error.name === 'AbortError') {
      yield { type: 'error', error: 'aborted' };
      return;
    }
    
    // Handle other errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    yield { type: 'error', error: errorMessage };
  }
}