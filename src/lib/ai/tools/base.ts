import { z } from 'zod';
import type { CoreTool } from 'ai';

export interface ToolContext {
  duckdb: {
    executeQuery: (sql: string) => Promise<any[]>;
    getTableNames: () => Promise<string[]>;
    getTableSchema: (tableName: string) => Promise<any[]>;
  };
  state: {
    datasets: Array<{
      id: string;
      name: string;
      type: string;
      columns: Array<{
        name: string;
        type: string;
        isGeometry?: boolean;
      }>;
      rowCount: number;
    }>;
    activeDatasetId: string | null;
  };
}

export interface ToolResult {
  success: boolean;
  data?: any;
  error?: string;
  message?: string;
  visualization?: {
    type: 'table' | 'map' | 'chart';
    config: any;
  };
}

export abstract class BaseTool {
  abstract name: string;
  abstract description: string;
  abstract parameters: z.ZodSchema;

  async execute(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      // Validate parameters
      const validated = this.parameters.parse(params);
      
      // Execute tool logic
      const result = await this.run(validated, context);
      
      // Format response
      return this.formatResult(result);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  abstract run(params: any, context: ToolContext): Promise<any>;
  
  formatResult(result: any): ToolResult {
    return {
      success: true,
      data: result,
    };
  }

  toCoreTool(context: ToolContext): CoreTool {
    return {
      description: this.description,
      parameters: this.parameters,
      execute: async (params: any) => {
        const result = await this.execute(params, context);
        // Return the entire result including the formatted message
        // This allows the AI to see the formatted output
        return result;
      },
    };
  }
}
