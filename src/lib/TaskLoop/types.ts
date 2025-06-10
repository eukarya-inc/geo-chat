// Types for TaskLoop library

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface TaskLoopConfig {
  apiKey: string;
  model?: string;
  maxTokens?: number;
}

export interface TaskLoopCallbacks {
  onStreamingUpdate?: (content: string) => void;
  onComplete?: (finalMessage: Message) => void;
  onError?: (error: Error) => void;
}

export interface TaskLoopState {
  isRunning: boolean;
  currentIteration: number;
  shouldStop: boolean;
}