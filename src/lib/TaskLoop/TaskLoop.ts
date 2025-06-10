import Anthropic from '@anthropic-ai/sdk';
import { type Message, type TaskLoopConfig, type TaskLoopCallbacks, type TaskLoopState } from './types';
import { generateSystemPrompt } from './systemPrompt';

export class TaskLoop {
  private anthropic: Anthropic;
  private config: TaskLoopConfig;
  private conversationHistory: Message[] = [];
  private state: TaskLoopState = {
    isRunning: false,
    currentIteration: 0,
    shouldStop: false
  };

  constructor(config: TaskLoopConfig) {
    this.config = {
      model: 'claude-3-5-sonnet-20241022',
      maxTokens: 1000,
      ...config
    };

    this.anthropic = new Anthropic({
      apiKey: this.config.apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  async sendMessage(message: string, callbacks: TaskLoopCallbacks = {}): Promise<void> {
    if (this.state.isRunning) {
      throw new Error('TaskLoop is already running');
    }

    try {
      // Add user message to conversation history
      const userMessage: Message = { role: 'user', content: message };
      this.conversationHistory.push(userMessage);

      // Start the task loop
      await this.createTaskLoop(userMessage, callbacks);
    } catch (error) {
      callbacks.onError?.(error as Error);
      throw error;
    }
  }

  private async createTaskLoop(initialMessage: Message, callbacks: TaskLoopCallbacks): Promise<void> {
    this.state.isRunning = true;
    this.state.currentIteration = 0;
    this.state.shouldStop = false;

    // Task loop with while structure as requested
    while (!this.state.shouldStop) {
      this.state.currentIteration++;

      try {
        // Send AI prompt with conversation history and system prompt
        const stream = await this.anthropic.messages.stream({
          model: this.config.model!,
          max_tokens: this.config.maxTokens!,
          system: generateSystemPrompt(),
          messages: this.conversationHistory.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        });

        let fullContent = '';

        // Process streaming response
        for await (const chunk of stream) {
          if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
            fullContent += chunk.delta.text;
            // Call streaming update callback
            callbacks.onStreamingUpdate?.(fullContent);
          }
        }

        // Create assistant message
        const assistantMessage: Message = {
          role: 'assistant', 
          content: fullContent || 'エラーが発生しました'
        };

        // Add to conversation history
        this.conversationHistory.push(assistantMessage);

        // Call completion callback
        callbacks.onComplete?.(assistantMessage);

        // For this simplified version, always assume completion tool was executed
        // This simulates the "attempt_completion" tool being found
        this.state.shouldStop = true;

      } catch (error) {
        this.state.shouldStop = true;
        throw error;
      }
    }

    this.state.isRunning = false;
  }

  getConversationHistory(): Message[] {
    return [...this.conversationHistory];
  }

  clearHistory(): void {
    this.conversationHistory = [];
  }

  isRunning(): boolean {
    return this.state.isRunning;
  }

  getCurrentIteration(): number {
    return this.state.currentIteration;
  }
}