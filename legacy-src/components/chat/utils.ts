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

/**
 * Extract summary and details sections from content
 * @param content - The message content to parse
 * @returns Object with summary, details, and remaining content
 */
export interface ParsedContent {
    summary: string | null;
    details: string | null;
    remaining: string;
}

export function parseSummaryAndDetails(content: string): ParsedContent {
    const summaryRegex = /<!--SUMMARY-->([\s\S]*?)<!--\/SUMMARY-->/;
    const detailsRegex = /<!--DETAILS-->([\s\S]*?)<!--\/DETAILS-->/;

    const summaryMatch = content.match(summaryRegex);
    const detailsMatch = content.match(detailsRegex);

    const summary = summaryMatch ? summaryMatch[1].trim() : null;
    const details = detailsMatch ? detailsMatch[1].trim() : null;

    // Remove summary and details markers from remaining content
    let remaining = content;
    if (summaryMatch) {
        remaining = remaining.replace(summaryRegex, '');
    }
    if (detailsMatch) {
        remaining = remaining.replace(detailsRegex, '');
    }
    remaining = remaining.trim();

    return { summary, details, remaining };
}

/**
 * Parse content for streaming display, detecting markers and current state
 * @param content - The streaming message content to parse
 * @returns Object with parsed sections and streaming state
 */
export interface StreamingParsedContent {
    hasSummary: boolean;
    hasDetails: boolean;
    summary: string;
    details: string;
    remaining: string;
    inSummary: boolean; // Currently streaming summary content
    inDetails: boolean; // Currently streaming details content
}

export function parseStreamingSummaryAndDetails(content: string): StreamingParsedContent {
    const summaryStartIndex = content.indexOf('<!--SUMMARY-->');
    const summaryEndIndex = content.indexOf('<!--/SUMMARY-->');
    const detailsStartIndex = content.indexOf('<!--DETAILS-->');
    const detailsEndIndex = content.indexOf('<!--/DETAILS-->');

    const hasSummary = summaryStartIndex !== -1;
    const hasSummaryEnd = summaryEndIndex !== -1;
    const hasDetails = detailsStartIndex !== -1;
    const hasDetailsEnd = detailsEndIndex !== -1;

    // Extract summary content
    let summary = '';
    if (hasSummary) {
        const start = summaryStartIndex + '<!--SUMMARY-->'.length;
        const end = hasSummaryEnd ? summaryEndIndex : content.length;
        summary = content.substring(start, end).trim();
    }

    // Extract details content
    let details = '';
    if (hasDetails) {
        const start = detailsStartIndex + '<!--DETAILS-->'.length;
        const end = hasDetailsEnd ? detailsEndIndex : content.length;
        details = content.substring(start, end).trim();
    }

    // Extract remaining content (before summary or after details)
    let remaining = '';
    if (!hasSummary) {
        // No summary marker yet, show all content as remaining
        remaining = content;
    } else {
        // Content before summary marker
        const beforeSummary = content.substring(0, summaryStartIndex).trim();

        // Content after details (if details section is closed)
        let afterDetails = '';
        if (hasDetailsEnd) {
            afterDetails = content.substring(detailsEndIndex + '<!--/DETAILS-->'.length).trim();
        }

        remaining = [beforeSummary, afterDetails].filter(Boolean).join('\n\n');
    }

    // Determine streaming state
    const inSummary = hasSummary && !hasSummaryEnd;
    const inDetails = hasDetails && !hasDetailsEnd;

    return {
        hasSummary,
        hasDetails,
        summary,
        details,
        remaining,
        inSummary,
        inDetails,
    };
}
