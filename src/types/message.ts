// Structured content types for AI messages
export interface TextContent {
  type: 'text';
  text: string;
}

export interface DuckDBToolInput {
  sql: string;
}

export interface ToolUseContent {
  type: 'tool_use';
  id: string;
  name: string;
  input: unknown;
}

export interface DuckDBToolResult {
  success?: boolean;
  data?: unknown[];
  rowCount?: number;
  sql?: string;
  error?: string;
  columns?: string[];
  columnCount?: number;
  suggestions?: string[];
  sqlExplanation?: string;
}

export interface ToolResultContent {
  type: 'tool_result';
  id: string;
  name: string;
  result: unknown;
}

export type StructuredContent = TextContent | ToolUseContent | ToolResultContent;

// Message with structured content support
export interface StructuredMessage {
  role: 'user' | 'assistant';
  content: string | StructuredContent[];
  streaming?: string; // Temporary streaming text that hasn't been committed to structured content yet
}