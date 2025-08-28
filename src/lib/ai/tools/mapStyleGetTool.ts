import { tool } from 'ai';
import { z } from 'zod';
import type { ChatState } from '../../../store/modelingRemoteAtoms';

/**
 * Creates a tool for getting the current map style configuration for a table
 */
export function createMapStyleGetTool(
  getCurrentChatState: () => ChatState | null
) {
  return tool({
    description: `Get the current map style configuration for a specific table, including table-specific styles and extra/base styles.

IMPORTANT:
- Returns both tableStyles (layer configurations) and extraStyle (base map style)
- If no styles are configured, empty arrays/objects are returned (default styles will be used by the map)
- The table must have a mapSpec configured, otherwise an error is returned
- extraStyle contains the base MapLibre GL style specification
- tableStyles contains an array of layer specifications for the specific table

Use this tool to:
- Check current styling before making updates
- Understand what layers are configured for a table
- Get the base map style configuration
- Verify if custom styles have been applied`,

    parameters: z.object({
      table_name: z.string().describe('The name of the table to get map styles for'),
    }),

    execute: async ({ table_name }) => {
      try {
        const chatState = getCurrentChatState();
        if (!chatState) {
          return {
            success: false,
            error: 'Chat state is not available',
            tableStyles: null,
            extraStyle: null
          };
        }

        const mapSpec = chatState.mapSpecs?.[table_name];
        if (!mapSpec) {
          return {
            success: false,
            error: `No map specification found for table "${table_name}". The table must be configured for map visualization first.`,
            tableStyles: null,
            extraStyle: null
          };
        }

        // Get table-specific styles
        const tableStyles = mapSpec.tableStyles?.[table_name] || [];
        
        // Get extra/base style
        const extraStyle = mapSpec.style || null;

        return {
          success: true,
          message: `Retrieved map styles for table "${table_name}"`,
          tableStyles,
          extraStyle,
          metadata: {
            hasTableStyles: tableStyles.length > 0,
            hasExtraStyle: !!extraStyle,
            layerCount: tableStyles.length,
            note: tableStyles.length === 0 && !extraStyle 
              ? 'No custom styles configured. Default styles will be used by the map.' 
              : null
          }
        };
      } catch (error) {
        return {
          success: false,
          error: `Error retrieving map styles: ${error instanceof Error ? error.message : 'Unknown error'}`,
          tableStyles: null,
          extraStyle: null
        };
      }
    }
  });
}