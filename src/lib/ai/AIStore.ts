import type { StructuredMessage } from '../../types/message';
import type { DBContext } from '../duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import type { ChatState } from '../../store/remoteAtoms';
import type { TableStyle } from '../../components/map';
import { createAIStreamGenerator, type StreamPart } from './streamGenerator';
import { messageConverter } from './messageConverter';
import { generateContextMessage } from './contextMessage';
import { generateSystemPrompt } from './systemPrompt';
import { initTools } from './tools';
import { generatePromptSuggestions } from './promptSuggestionService';

interface ChatContext {
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
    private contexts: Map<string, ChatContext> = new Map();
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

    registerChatContext(chatId: string, context: ChatContext): void {
        this.contexts.set(chatId, context);
    }

    updateChatContext(chatId: string, partialContext: Partial<ChatContext>): void {
        const existingContext = this.contexts.get(chatId);
        if (existingContext) {
            this.contexts.set(chatId, { ...existingContext, ...partialContext });
        }
    }

    getChatContext(chatId: string): ChatContext | undefined {
        return this.contexts.get(chatId);
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

    // Simplified sendMessage that uses registered context
    async sendMessage(chatId: string, message: string): Promise<void>;
    // Legacy sendMessage with explicit options (for backward compatibility)
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
    ): Promise<void>;
    async sendMessage(
        chatId: string,
        message: string,
        options?: {
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
        // If no options provided, use registered context
        if (!options) {
            const context = this.contexts.get(chatId);
            if (!context) {
                throw new Error(`No context registered for chat ${chatId}. Call registerChatContext first.`);
            }
            options = context;
        }
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
        const coreMessages = messageConverter.toCoreMessages(newMessages);

        // Skip AI if there are no messages to send (e.g., only TABLE_CREATED marker)
        // This happens when user explicitly imports a table
        if (coreMessages.length === 0) {
            // Don't set loading state for TABLE_CREATED messages
            // Just ensure messages are persisted and listeners are notified
            options.onMessagesChange?.(newMessages);
            this.notifyListeners();

            // Trigger prompt suggestions for explicit table import
            if (
                userMessage.content &&
                typeof userMessage.content === 'string' &&
                userMessage.content.includes('<!--TABLE_CREATED:')
            ) {
                const match = userMessage.content.match(/<!--TABLE_CREATED:(.+?)-->/);
                const tableName = match?.[1];
                if (tableName && options.dbContext && options.apiKey) {
                    // Generate prompt suggestions in background without blocking
                    this.addPromptSuggestions(chatId, tableName, {
                        apiKey: options.apiKey,
                        dbContext: options.dbContext,
                        schema: options.schema,
                        onMessagesChange: options.onMessagesChange,
                    }).catch(err => {
                        console.error('Failed to generate prompt suggestions:', err);
                    });
                }
            }

            return;
        }

        const controller = new AbortController();
        this.setLoading(chatId, true, controller);

        try {
            // Validate required parameters for tool initialization
            const missingParams: string[] = [];
            if (!options.dbContext) missingParams.push('dbContext');
            if (!options.onChartUpdate) missingParams.push('onChartUpdate');
            if (!options.onChartDelete) missingParams.push('onChartDelete');
            if (!options.getCurrentChatState) missingParams.push('getCurrentChatState');
            if (!options.onMapStyleUpdate) missingParams.push('onMapStyleUpdate');
            if (!options.onMapStyleDelete) missingParams.push('onMapStyleDelete');

            if (missingParams.length > 0) {
                throw new Error(`Required tool initialization parameters are missing: ${missingParams.join(', ')}`);
            }

            // Build tools (TypeScript knows these are defined after validation)
            const tools = await initTools({
                dbContext: options.dbContext!,
                schema: options.schema || null,
                apiKey: options.apiKey,
                onChartUpdate: options.onChartUpdate!,
                onChartDelete: options.onChartDelete!,
                getCurrentChatState: options.getCurrentChatState!,
                onMapStyleUpdate: options.onMapStyleUpdate!,
                onMapStyleDelete: options.onMapStyleDelete!,
            });

            // Generate system prompt with context
            const baseSystemPrompt = generateSystemPrompt();
            const contextMessage = await generateContextMessage(
                options.dbContext!,
                options.schema || null,
                options.selectedTable || null
            );
            const systemPrompt = contextMessage ? `${contextMessage}\n\n${baseSystemPrompt}` : baseSystemPrompt;

            const generator = createAIStreamGenerator({
                messages: coreMessages,
                apiKey: options.apiKey,
                systemPrompt,
                tools,
                abortSignal: controller.signal,
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
                        usage: part.usage,
                    };
                } else {
                    updatedMessages[updatedMessages.length - 1] = {
                        ...lastMessage,
                        streaming: undefined,
                        usage: part.usage,
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

    async addPromptSuggestions(
        chatId: string,
        tableName: string,
        options: {
            apiKey: string;
            dbContext: DBContext;
            schema?: string | null;
            onMessagesChange?: (messages: StructuredMessage[]) => void;
        }
    ): Promise<void> {
        const session = this.sessions.get(chatId);
        if (!session) return;

        // Check if we already have prompt suggestions for this table
        const hasPromptSuggestions = session.messages.some(
            msg =>
                msg.role === 'assistant' &&
                Array.isArray(msg.content) &&
                msg.content.some(
                    block =>
                        (block.type === 'tool_result' &&
                            block.name === 'completion' &&
                            block.result &&
                            typeof block.result === 'object' &&
                            'suggestedPrompts' in block.result &&
                            'completionMessage' in block.result &&
                            typeof block.result.completionMessage === 'string' &&
                            block.result.completionMessage.includes(tableName)) ||
                        (block.type === 'tool_use' &&
                            block.name === 'completion' &&
                            block.input &&
                            typeof block.input === 'object' &&
                            'suggestedPrompts' in block.input)
                )
        );

        if (hasPromptSuggestions) {
            return;
        }

        // Add loading message
        const loadingMessage: StructuredMessage = {
            role: 'assistant',
            content: [
                {
                    type: 'text',
                    text: `テーブル「${tableName}」を分析中... おすすめの分析を生成しています...`,
                },
            ],
        };

        const messagesWithLoading = [...session.messages, loadingMessage];
        session.messages = messagesWithLoading;
        options.onMessagesChange?.(messagesWithLoading);
        this.notifyListeners();

        try {
            const prompts = await generatePromptSuggestions(
                tableName,
                options.dbContext,
                options.schema || null,
                options.apiKey
            );

            // Remove loading message
            const cleanMessages = session.messages.filter(msg => {
                if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                    return !msg.content.some(
                        block =>
                            block.type === 'text' &&
                            block.text.includes('を分析中... おすすめの分析を生成しています...')
                    );
                }
                return true;
            });

            if (prompts.length > 0) {
                const promptMessage: StructuredMessage = {
                    role: 'assistant',
                    content: [
                        {
                            type: 'tool_result',
                            id: `synthetic-${Date.now()}`,
                            name: 'completion',
                            result: {
                                success: true,
                                suggestedPrompts: prompts.map((p, i) => ({
                                    id: `prompt-${i}`,
                                    text: p.text,
                                    description: p.category,
                                })),
                                completionMessage: `テーブル「${tableName}」が作成されました。以下の分析をお試しください:`,
                                timestamp: new Date().toISOString(),
                            },
                        },
                    ],
                };

                const updatedMessages = [...cleanMessages, promptMessage];
                session.messages = updatedMessages;
                options.onMessagesChange?.(updatedMessages);
                this.notifyListeners();
            } else {
                session.messages = cleanMessages;
                options.onMessagesChange?.(cleanMessages);
                this.notifyListeners();
            }
        } catch (error) {
            console.error('Failed to generate prompt suggestions:', error);
            // Remove loading message on error
            const cleanMessages = session.messages.filter(msg => {
                if (msg.role === 'assistant' && Array.isArray(msg.content)) {
                    return !msg.content.some(
                        block =>
                            block.type === 'text' &&
                            block.text.includes('を分析中... おすすめの分析を生成しています...')
                    );
                }
                return true;
            });
            session.messages = cleanMessages;
            options.onMessagesChange?.(cleanMessages);
            this.notifyListeners();
        }
    }
}

export const aiStore = new AIStore();
