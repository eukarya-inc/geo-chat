/**
 * Utility functions for chat message processing
 */

/**
 * Check if a message contains only TABLE_CREATED marker (with optional TABLE_INFO)
 * @param content - The message content to check
 * @returns true if the message only contains TABLE_CREATED (and optionally TABLE_INFO), false otherwise
 */
export function isTableCreatedOnlyMessage(content: string): boolean {
    // First remove TABLE_INFO blocks if present
    const contentWithoutTableInfo = content.replace(/<!--TABLE_INFO_START-->[\s\S]*?<!--TABLE_INFO_END-->/g, '');

    // Check if it contains TABLE_CREATED and nothing else after removing the marker
    const hasTableCreated = contentWithoutTableInfo.includes('<!--TABLE_CREATED:');
    if (!hasTableCreated) {
        return false;
    }

    // Remove TABLE_CREATED markers and check if anything remains
    const remainingContent = contentWithoutTableInfo.replace(/<!--TABLE_CREATED:[^>]+-->/g, '').trim();

    return remainingContent === '';
}

/**
 * Remove metadata markers from content for display purposes
 * Removes CONTEXT, TABLE_INFO, and other HTML comment markers
 * @param content - The message content to clean
 * @returns The cleaned content for display
 */
export function removeMetadataMarkers(content: string): string {
    return content
        .replace(/<!--CONTEXT_START-->[\s\S]*?<!--CONTEXT_END-->/g, '')
        .replace(/<!--TABLE_INFO_START-->[\s\S]*?<!--TABLE_INFO_END-->/g, '')
        .trim();
}
