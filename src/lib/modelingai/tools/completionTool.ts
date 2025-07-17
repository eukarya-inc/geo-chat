import { tool } from 'ai';
import { z } from 'zod';

export interface SuggestedPrompt {
  id: string;
  text: string;
  description: string;
}

export const completionTool = tool({
  description: 'Call this tool when all requested work is completed to provide suggested follow-up prompts for the user.',
  parameters: z.object({
    suggestedPrompts: z.array(z.object({
      id: z.string().describe('Unique identifier for the prompt'),
      text: z.string().describe('The actual prompt text that will be inserted into the input box'),
      description: z.string().describe('Brief description of what this prompt will do')
    })).max(5).describe('Array of up to 5 suggested follow-up prompts'),
    completionMessage: z.string().optional().describe('Optional message to display when work is completed')
  }),
  execute: async ({ suggestedPrompts, completionMessage }) => {
    return {
      success: true,
      suggestedPrompts,
      completionMessage: completionMessage || 'すべての作業が完了しました。',
      timestamp: new Date().toISOString()
    };
  },
});