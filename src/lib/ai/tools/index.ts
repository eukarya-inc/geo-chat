import { ExecuteQueryTool } from './executeQuery';
import { DescribeDataTool } from './describeData';
import { CreateMapTool } from './createMap';
import type { BaseTool, ToolContext } from './base';

// Export all tools
export { ExecuteQueryTool } from './executeQuery';
export { DescribeDataTool } from './describeData';
export { CreateMapTool } from './createMap';
export type { ToolContext, ToolResult } from './base';

// Tool registry
export const AI_TOOLS: Record<string, BaseTool> = {
  executeQuery: new ExecuteQueryTool(),
  describeData: new DescribeDataTool(),
  createMap: new CreateMapTool(),
};

// Helper to get tools for AI SDK
export function getAITools(context: ToolContext) {
  return Object.fromEntries(
    Object.entries(AI_TOOLS).map(([name, tool]) => [name, tool.toCoreTool(context)])
  );
}
