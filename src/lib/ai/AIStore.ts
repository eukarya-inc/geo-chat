import type { StructuredMessage } from '../../types/message';
import type { DBContext } from '../duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/remoteAtoms';
import type { TableStyle } from '../../components/map';
import { createAIStreamGenerator, type StreamPart } from './streamGenerator';
import { messageConverter } from './messageConverter';
import { generateContextMessage } from './contextMessage';

interface ChatSession {
    id: string;
    schema: string | null;
    messages: StructuredMessage[];
    isLoading: boolean;
    error: Error | null;
    abortController: AbortController | null;
    streamingText: string;
}

type Listener = () => void;

export class AIStore {
    private sessions: Map<string, ChatSession> = new Map();
    private listeners: Set<Listener> = new Set();

    subscribe(listener: Listener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    getSnapshot(): ChatSession[] {
        return Array.from(this.sessions.values());
    }

    getChatSession(chatId: string): ChatSession | undefined {
        return this.sessions.get(chatId);
    }

    getOrCreateSession(chatId: string, schema: string | null): ChatSession {
        let session = this.sessions.get(chatId);
        if (!session) {
            session = {
                id: chatId,
                schema,
                messages: [],
                isLoading: false,
                error: null,
                abortController: null,
                streamingText: '',
            };
            this.sessions.set(chatId, session);
        }
        return session;
    }

    updateMessages(chatId: string, messages: StructuredMessage[]): void {
        const session = this.sessions.get(chatId);
        if (session) {
            session.messages = messages;
            this.notifyListeners();
        }
    }

    setLoading(chatId: string, isLoading: boolean, abortController?: AbortController | null): void {
        const session = this.sessions.get(chatId);
        if (session) {
            session.isLoading = isLoading;
            if (abortController !== undefined) {
                session.abortController = abortController;
            }
            this.notifyListeners();
        }
    }

    setError(chatId: string, error: Error | null): void {
        const session = this.sessions.get(chatId);
        if (session) {
            session.error = error;
            this.notifyListeners();
        }
    }

    abort(chatId: string): void {
        const session = this.sessions.get(chatId);
        if (session?.abortController) {
            session.abortController.abort();
            session.abortController = null;
            session.isLoading = false;
            this.notifyListeners();
        }
    }

    async sendMessage(
        chatId: string,
        message: string,
        options: {
            apiKey: string;
            dbContext?: DBContext;
            schema?: string | null;
            selectedTable?: string | null;
            onMessagesChange?: (messages: StructuredMessage[]) => void;
            onChartUpdate?: (tableName: string, spec: VegaChartSpec) => Promise<void>;
            onChartDelete?: (tableName: string) => Promise<void>;
            getCurrentChatState?: () => ChatState | null;
            onMapStyleUpdate?: (tableName: string, style: TableStyle) => Promise<void>;
            onMapStyleDelete?: (tableName: string) => Promise<void>;
            onMessageComplete?: () => void;
        }
    ): Promise<void> {
        const session = this.getOrCreateSession(chatId, options.schema || null);

        if (!message.trim() || session.isLoading) return;

        const cleanedMessages = session.messages.filter(msg => {
            if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                const hasLoadingText = msg.content.some(
                    block =>
                        block.type === 'text' && block.text.includes('を分析中... おすすめの分析を生成しています...')
                );
                return !hasLoadingText;
            }
            return true;
        });

        const userMessage: StructuredMessage = { role: 'user', content: message.trim() };

        const newMessages = [...cleanedMessages, userMessage];
        session.messages = newMessages;
        session.error = null;
        options.onMessagesChange?.(newMessages);
        this.notifyListeners();

        // Check if this is a TABLE_CREATED only message before setting loading
        let coreMessages = messageConverter.toCoreMessages(newMessages);

        // Skip AI if there are no messages to send (e.g., only TABLE_CREATED marker)
        // But still notify listeners so prompt suggestions can be triggered
        if (coreMessages.length === 0) {
            // Don't set loading state for TABLE_CREATED messages
            // Just ensure messages are persisted and listeners are notified
            options.onMessagesChange?.(newMessages);
            this.notifyListeners();
            return;
        }

        // ALWAYS inject fresh context for every AI request
        // Context must be at the beginning to avoid "multiple system messages" error
        try {
            const contextMessage = await generateContextMessage(
                options.dbContext || null,
                options.schema || null,
                options.selectedTable || null
            );
            if (contextMessage) {
                // Add context as the FIRST system message
                // This avoids the "multiple system messages separated by user/assistant" error
                coreMessages = [{ role: 'system' as const, content: contextMessage }, ...coreMessages];
            } else {
                console.log('[AI Context] Not generated - no schema/dbContext or generation failed');
            }
        } catch (contextError) {
            console.error('[AI Context] Error generating context:', contextError);
            // Continue without context rather than blocking the request
        }

        const controller = new AbortController();
        this.setLoading(chatId, true, controller);

        try {
            const generator = createAIStreamGenerator({
                messages: coreMessages,
                apiKey: options.apiKey,
                dbContext: options.dbContext,
                schema: options.schema,
                abortSignal: controller.signal,
                onChartUpdate: options.onChartUpdate,
                onChartDelete: options.onChartDelete,
                getCurrentChatState: options.getCurrentChatState,
                onMapStyleUpdate: options.onMapStyleUpdate,
                onMapStyleDelete: options.onMapStyleDelete,
            });

            const assistantMessage: StructuredMessage = {
                role: 'assistant',
                content: [],
                streaming: '',
            };

            let currentMessages = [...newMessages, assistantMessage];
            session.messages = currentMessages;
            session.streamingText = '';
            options.onMessagesChange?.(currentMessages);
            this.notifyListeners();

            for await (const part of generator) {
                const result = this.processStreamPart(part, currentMessages, session.streamingText);
                currentMessages = result.messages;
                session.streamingText = result.streamingText;
                session.messages = currentMessages;
                options.onMessagesChange?.(currentMessages);
                this.notifyListeners();
            }

            options.onMessagesChange?.(currentMessages);

            // Call callback when chat completes
            options.onMessageComplete?.();
        } catch (err) {
            const errorMsg = err instanceof Error ? err.message : 'エラーが発生しました';
            this.setError(chatId, err instanceof Error ? err : new Error(errorMsg));

            const errorContent = `❌ **エラーが発生しました:** ${errorMsg}`;
            const currentMessages: StructuredMessage[] = [
                ...newMessages,
                {
                    role: 'assistant',
                    content: [{ type: 'text' as const, text: errorContent }],
                },
            ];
            session.messages = currentMessages;
            options.onMessagesChange?.(currentMessages);
            this.notifyListeners();

            // Treat errors as chat completion too
            options.onMessageComplete?.();
        } finally {
            this.setLoading(chatId, false, null);
        }
    }

    private processStreamPart(
        part: StreamPart,
        currentMessages: StructuredMessage[],
        streamingText: string
    ): { messages: StructuredMessage[]; streamingText: string } {
        const lastMessage = currentMessages[currentMessages.length - 1];
        if (lastMessage.role !== 'assistant') {
            return { messages: currentMessages, streamingText };
        }

        const updatedMessages = [...currentMessages];
        let newStreamingText = streamingText;

        switch (part.type) {
            case 'text-delta':
                newStreamingText = streamingText + part.textDelta;
                updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    streaming: newStreamingText,
                };
                break;

            case 'tool-call': {
                const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];

                if (streamingText) {
                    existingContent.push({ type: 'text' as const, text: streamingText });
                }

                existingContent.push({
                    type: 'tool_use' as const,
                    id: part.toolCallId,
                    name: part.toolName,
                    input: part.args,
                });

                updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: existingContent,
                    streaming: '',
                };
                newStreamingText = '';
                break;
            }

            case 'tool-result': {
                const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];

                if (streamingText) {
                    existingContent.push({ type: 'text' as const, text: streamingText });
                }

                existingContent.push({
                    type: 'tool_result' as const,
                    id: part.toolCallId,
                    name: part.toolName,
                    result: part.result,
                });

                updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: existingContent,
                    streaming: '',
                };
                newStreamingText = '';
                break;
            }

            case 'error': {
                let errorText: string;

                if (part.error === 'aborted') {
                    errorText = '⏹️ **処理が停止されました**';
                } else {
                    // Provide more specific error messages based on error content
                    const errorMessage = part.error.toLowerCase();

                    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
                        errorText = '❌ **APIレート制限に達しました:** しばらく待ってから再度お試しください。';
                    } else if (errorMessage.includes('overloaded') || errorMessage.includes('request_overloaded')) {
                        errorText = '❌ **APIサーバーが過負荷状態です:** 少し時間をおいてから再度お試しください。';
                    } else if (errorMessage.includes('503') || errorMessage.includes('unavailable')) {
                        errorText = '❌ **APIサービスが一時的に利用できません:** 後ほど再度お試しください。';
                    } else if (errorMessage.includes('500') || errorMessage.includes('internal')) {
                        errorText = '❌ **サーバー内部エラーが発生しました:** 再度お試しください。';
                    } else if (errorMessage.includes('402') || errorMessage.includes('quota')) {
                        errorText = '❌ **APIクォータを超過しました:** APIアカウントの状態を確認してください。';
                    } else if (
                        errorMessage.includes('401') ||
                        (errorMessage.includes('invalid') && errorMessage.includes('key'))
                    ) {
                        errorText = '❌ **無効なAPIキーです:** APIキーの設定を確認してください。';
                    } else {
                        // For other errors, show the original message
                        errorText = `❌ **エラーが発生しました:** ${part.error}`;
                    }
                }

                const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
                if (streamingText) {
                    existingContent.push({ type: 'text' as const, text: streamingText });
                }
                existingContent.push({ type: 'text' as const, text: errorText });

                updatedMessages[updatedMessages.length - 1] = {
                    ...lastMessage,
                    content: existingContent,
                    streaming: undefined,
                };
                newStreamingText = '';
                break;
            }

            case 'finish':
                if (streamingText) {
                    const existingContent = Array.isArray(lastMessage.content) ? [...lastMessage.content] : [];
                    existingContent.push({ type: 'text' as const, text: streamingText });
                    updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        content: existingContent,
                        streaming: undefined,
                    };
                } else {
                    updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        streaming: undefined,
                    };
                }
                newStreamingText = '';
                break;
        }

        return { messages: updatedMessages, streamingText: newStreamingText };
    }

    private notifyListeners(): void {
        this.listeners.forEach(listener => listener());
    }

    isAnyLoading(): boolean {
        for (const session of this.sessions.values()) {
            if (session.isLoading) return true;
        }
        return false;
    }

    clearSession(chatId: string): void {
        this.sessions.delete(chatId);
        this.notifyListeners();
    }
}

export const aiStore = new AIStore();
