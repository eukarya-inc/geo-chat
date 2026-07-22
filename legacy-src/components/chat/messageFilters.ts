import type { StructuredContent, DuckDBToolResult } from '../../types/message';

/**
 * Check if a message has any collapsible content (content that can be hidden)
 * Returns true if there are tool calls or non-final text that can be collapsed
 */
export function hasCollapsibleContent(content: StructuredContent[]): boolean {
    // Find the index of the last text block
    let lastTextIndex = -1;
    for (let i = content.length - 1; i >= 0; i--) {
        if (content[i].type === 'text') {
            lastTextIndex = i;
            break;
        }
    }

    // Check if there's any content that would be filtered out when collapsed
    return content.some((block, index) => {
        // Error messages are always shown - not collapsible
        if (block.type === 'error') {
            return false;
        }

        // Completion tools are always shown - not collapsible
        if (block.type === 'tool_use' && block.name === 'completion') {
            return false;
        }
        if (block.type === 'tool_result' && block.name === 'completion') {
            return false;
        }

        // Table creation and errors are always shown - not collapsible
        if (block.type === 'tool_result' && block.name === 'duckdb_query') {
            const result = block.result as DuckDBToolResult;
            if (result?.createdTable) return false;
            if (result?.error) return false;
            // Regular SQL results are collapsible
            return true;
        }

        // Chart/map update results are collapsible
        if (block.type === 'tool_result') {
            return true;
        }

        // Tool use blocks are collapsible
        if (block.type === 'tool_use') {
            return true;
        }

        // Text blocks
        if (block.type === 'text') {
            const hasTableMarker = block.text.includes('<!--TABLE_CREATED:');
            const hasFinalMarker = block.text.includes('<!--FINAL_MESSAGE-->');
            const hasSummary = block.text.includes('<!--SUMMARY-->');
            const hasDetails = block.text.includes('<!--DETAILS-->');

            // Table markers, final messages, summaries, and details are always shown - not collapsible
            if (hasTableMarker || hasFinalMarker || hasSummary || hasDetails) {
                return false;
            }

            // Last text block is shown - not collapsible
            if (index === lastTextIndex) {
                return false;
            }

            // Other text blocks are collapsible
            return true;
        }

        return false;
    });
}
