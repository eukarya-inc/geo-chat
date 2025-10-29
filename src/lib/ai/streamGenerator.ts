import { createAnthropic } from '@ai-sdk/anthropic';
import { streamText, type CoreMessage } from 'ai';
import type { DBContext } from '../duckdb/dbContext';
import { generateSystemPrompt } from './systemPrompt';
import { createDuckDBTool } from './tools/duckdbTool';
import { completionTool } from './tools/completionTool';
import { createChartUpdateTool, createChartGetTool, createChartDeleteTool } from './tools/chartTool';
import { createMapStyleTool } from './tools/mapStyleTool';
import { createMapStyleGetTool } from './tools/mapStyleGetTool';
import { createGeocodingTools } from './tools/geocodingTool';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/remoteAtoms';
import { createRegressionTool } from './tools/regressionTool';
import { createPredictorSelectionTool } from './tools/predictorSelectionTool';
import { createClusterTool } from './tools/clusterTool';
import { createSegmentedRegressionTool } from './tools/segmentedRegressionTool';

export interface StreamGeneratorOptions {
    messages: CoreMessage[];
    apiKey: string;
    dbContext?: DBContext | null;
    schema?: string | null;
    abortSignal?: AbortSignal;
    onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
    onChartDelete?: (tableName: string) => Promise<void>;
    getCurrentChatState?: () => ChatState | null;
    onMapStyleUpdate?: (tableName: string, style: import('../../components/map').TableStyle) => Promise<void>;
    onMapStyleDelete?: (tableName: string) => Promise<void>;
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
    dbContext,
    schema = null,
    abortSignal,
    onChartUpdate,
    onChartDelete,
    getCurrentChatState,
    onMapStyleUpdate,
    onMapStyleDelete,
}: StreamGeneratorOptions): AsyncGenerator<StreamPart> {
    try {
        const anthropicClient = createAnthropic({
            apiKey,
            headers: {
                'anthropic-dangerous-direct-browser-access': 'true',
            },
        });
        const result = await streamText({
            model: anthropicClient('claude-sonnet-4-5-20250929'),
            system: generateSystemPrompt(),
            messages,
            tools: {
                ...(dbContext && {
                    duckdb_query: createDuckDBTool(dbContext, schema, apiKey, onChartDelete, onMapStyleDelete),
                    select_predictors_for_regression: createPredictorSelectionTool(dbContext, schema),
                    perform_regression_analysis: createRegressionTool(dbContext, schema),
                    perform_cluster_analysis: createClusterTool(dbContext, schema),
                    perform_segmented_regression_analysis: createSegmentedRegressionTool(dbContext, schema),
                    ...createGeocodingTools(dbContext),
                }),
                ...(onChartUpdate && createChartUpdateTool(onChartUpdate, schema)
                    ? {
                          update_vega_chart_spec_for_table: createChartUpdateTool(onChartUpdate, schema)!,
                      }
                    : {}),
                ...(onChartDelete && createChartDeleteTool(onChartDelete)
                    ? {
                          delete_vega_chart_spec_for_table: createChartDeleteTool(onChartDelete)!,
                      }
                    : {}),
                ...(getCurrentChatState
                    ? {
                          get_vega_chart_spec_for_table: createChartGetTool(getCurrentChatState),
                          get_map_style_for_table: createMapStyleGetTool(
                              tableName => getCurrentChatState()?.mapSpecs?.[tableName]
                          ),
                      }
                    : {}),
                ...(getCurrentChatState && onMapStyleUpdate
                    ? {
                          update_map_style_for_table: createMapStyleTool(
                              tableName => getCurrentChatState()?.mapSpecs?.[tableName],
                              onMapStyleUpdate,
                              dbContext,
                              schema
                          )!,
                      }
                    : {}),
                completion: completionTool,
            },
            maxSteps: 50,
            maxTokens: 4000,
            maxRetries: 3,
            abortSignal,
        });

        // Stream the full response including text and tool calls
        for await (const part of result.fullStream) {
            switch (part.type) {
                case 'text-delta':
                    yield {
                        type: 'text-delta',
                        textDelta: part.textDelta,
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
                            args: part.args,
                        };
                    } catch (error) {
                        console.warn('[Stream Generator] Tool call error (continuing):', error);
                        // Continue without yielding error to prevent dialogue termination
                    }
                    break;

                case 'tool-result':
                    try {
                        yield {
                            type: 'tool-result',
                            toolCallId: part.toolCallId,
                            toolName: part.toolName,
                            result: part.result,
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

        yield { type: 'finish' };
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
