import type { CoreMessage } from 'ai';
import type { StructuredMessage, StructuredContent } from '../../types/message';

/**
 * Utility functions for converting between different message formats
 */
export const messageConverter = {
  /**
   * Convert StructuredMessage[] to CoreMessage[] for AI SDK
   * Removes ALL HTML comments including CONTEXT markers
   */
  toCoreMessages(messages: StructuredMessage[]): CoreMessage[] {
    const result: CoreMessage[] = [];
    
    for (const msg of messages) {
      let content = '';
      
      if (typeof msg.content === 'string') {
        // Remove ALL HTML comments including CONTEXT markers
        content = msg.content
          .replace(/<!--[^>]*-->/g, '')
          .trim();
      } else if (Array.isArray(msg.content)) {
        // Convert structured content to text
        const textParts = msg.content
          .filter(block => block.type === 'text')
          .map(block => (block as { text: string }).text)
          .join('');
        
        // Remove ALL HTML comments including CONTEXT markers
        content = textParts
          .replace(/<!--[^>]*-->/g, '')
          .trim();
      }
      
      // Only add non-empty messages
      if (content) {
        result.push({ 
          role: msg.role as 'user' | 'assistant' | 'system', 
          content 
        });
      }
    }
    
    return result;
  },

  /**
   * Convert assistant-ui format messages to StructuredMessage[]
   */
  fromAssistantUI(messages: unknown[]): StructuredMessage[] {
    return messages.map((msg) => {
      const message = msg as { role: string; content: string | unknown[] };
      if (typeof message.content === 'string') {
        return { role: message.role as 'user' | 'assistant', content: message.content };
      } else if (Array.isArray(message.content)) {
        const content: StructuredContent[] = message.content.map((part) => {
          const p = part as { type: string; text?: string; toolCallId?: string; toolName?: string; args?: unknown; result?: unknown };
          if (p.type === 'text') {
            return { type: 'text' as const, text: p.text || '' };
          } else if (p.type === 'tool-call') {
            return {
              type: 'tool_use' as const,
              id: p.toolCallId || '',
              name: p.toolName || '',
              input: p.args
            };
          } else if (p.type === 'tool-result') {
            return {
              type: 'tool_result' as const,
              id: p.toolCallId || '',
              name: p.toolName || '',
              result: p.result
            };
          }
          return { type: 'text' as const, text: '' };
        });
        return { role: message.role as 'user' | 'assistant', content };
      }
      return { role: message.role as 'user' | 'assistant', content: '' };
    });
  },

  /**
   * Convert StructuredMessage[] to assistant-ui format
   */
  toAssistantUI(messages: StructuredMessage[]): unknown[] {
    return messages.map(msg => {
      if (typeof msg.content === 'string') {
        return { role: msg.role, content: msg.content };
      } else if (Array.isArray(msg.content)) {
        const content = msg.content.map((block: StructuredContent) => {
          if (block.type === 'text') {
            return { type: 'text', text: block.text };
          } else if (block.type === 'tool_use') {
            return {
              type: 'tool-call',
              toolCallId: block.id,
              toolName: block.name,
              args: block.input
            };
          } else if (block.type === 'tool_result') {
            return {
              type: 'tool-result',
              toolCallId: block.id,
              toolName: block.name,
              result: block.result
            };
          }
          return block;
        });
        return { role: msg.role, content };
      }
      return { role: msg.role, content: msg.content || '' };
    });
  },

  /**
   * Clean user message by removing TABLE_CREATED markers
   */
  cleanUserMessage(content: string): string {
    return content.replace(/<!--TABLE_CREATED:[^>]+-->/g, '').trim();
  },

  /**
   * Check if a message contains TABLE_CREATED marker
   */
  hasTableCreatedMarker(content: string): boolean {
    return content.includes('<!--TABLE_CREATED:');
  },

  /**
   * Extract table name from TABLE_CREATED marker
   */
  extractTableName(content: string): string | null {
    const match = content.match(/<!--TABLE_CREATED:([^:>]+)-->/);
    return match ? match[1] : null;
  }
};