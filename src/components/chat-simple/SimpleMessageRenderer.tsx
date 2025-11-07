import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { StructuredMessage, StructuredContent, DuckDBToolResult } from '../../types/message';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { ChartSpecs } from '../../store/remoteAtoms';
import { TableCreatedMessage } from '../chat/TableCreatedMessage';
import { PromptSuggestions } from '../chat/PromptSuggestions';
import { CopyButton } from '../chat/CopyButton';
import { isTableCreatedOnlyMessage, removeMetadataMarkers } from '../chat/utils';

interface SimpleMessageRendererProps {
    message: StructuredMessage;
    className?: string;
    dbContext?: DBContext;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    isStreaming?: boolean;
    onPromptClick?: (promptText: string) => void;
    chartSpecs?: ChartSpecs;
    tableGeometries?: Record<string, boolean>;
    onChartIconClick?: (tableName: string) => void;
    onMapIconClick?: (tableName: string) => void;
}

const renderContentBlock = (
    block: StructuredContent,
    index: number,
    selectedTable?: string | null,
    onTableSelect?: (tableName: string) => void,
    onPromptClick?: (promptText: string) => void,
    chartSpecs?: ChartSpecs,
    tableGeometries?: Record<string, boolean>,
    onChartIconClick?: (tableName: string) => void,
    onMapIconClick?: (tableName: string) => void
): React.ReactNode => {
    switch (block.type) {
        case 'text': {
            // Remove markers from display
            const cleanedText = block.text
                .replace('<!--FINAL_MESSAGE-->', '')
                .replace(/<!--CONTEXT_START-->[\s\S]*?<!--CONTEXT_END-->/g, '')
                .replace(/<!--TABLE_INFO_START-->[\s\S]*?<!--TABLE_INFO_END-->/g, '')
                .trim();

            const isFinalMessage = block.text.includes('<!--FINAL_MESSAGE-->');

            // Check for table created markers
            const tableCreatedRegex = /<!--TABLE_CREATED:([^:>]+)-->/g;
            const tableMatches = Array.from(cleanedText.matchAll(tableCreatedRegex));

            if (tableMatches.length > 0) {
                const parts: React.ReactNode[] = [];
                let lastIndex = 0;

                tableMatches.forEach((match, i) => {
                    const matchIndex = match.index || 0;
                    const beforeText = cleanedText.slice(lastIndex, matchIndex);

                    if (beforeText.trim()) {
                        parts.push(
                            <div key={`text-${index}-${i}-before`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                    {beforeText}
                                </ReactMarkdown>
                                {isFinalMessage && (
                                    <div className="mt-2 flex">
                                        <CopyButton
                                            onCopy={() => navigator.clipboard.writeText(beforeText)}
                                            showLabel={true}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    }

                    const tableName = match[1];
                    parts.push(
                        <TableCreatedMessage
                            key={`table-${index}-${i}`}
                            tableName={tableName}
                            isSelected={false}
                            onClick={() => onTableSelect?.(tableName)}
                            hasChartSpec={chartSpecs ? tableName in chartSpecs : false}
                            hasGeometry={tableGeometries?.[tableName] || false}
                            onChartIconClick={() => onChartIconClick?.(tableName)}
                            onMapIconClick={() => onMapIconClick?.(tableName)}
                        />
                    );

                    lastIndex = matchIndex + match[0].length;
                });

                // Add remaining text
                const remainingText = cleanedText.slice(lastIndex);
                if (remainingText.trim()) {
                    parts.push(
                        <div key={`text-${index}-end`}>
                            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                {remainingText}
                            </ReactMarkdown>
                            {isFinalMessage && (
                                <div className="mt-2 flex">
                                    <CopyButton
                                        onCopy={() => navigator.clipboard.writeText(remainingText)}
                                        showLabel={true}
                                    />
                                </div>
                            )}
                        </div>
                    );
                }

                return (
                    <div key={index} className="space-y-1">
                        {parts}
                    </div>
                );
            }

            // No table markers, render as plain markdown
            if (!cleanedText) return null;

            return (
                <div key={index} className="prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {cleanedText}
                    </ReactMarkdown>
                    {isFinalMessage && (
                        <div className="mt-2 flex">
                            <CopyButton onCopy={() => navigator.clipboard.writeText(cleanedText)} showLabel={true} />
                        </div>
                    )}
                </div>
            );
        }

        case 'tool_use': {
            // Only show completion tool (suggested prompts)
            if (block.name === 'completion') {
                const input = block.input as {
                    suggestedPrompts?: Array<{
                        id?: string;
                        text: string;
                        description?: string;
                    }>;
                    completionMessage?: string;
                };
                if (input?.suggestedPrompts && Array.isArray(input.suggestedPrompts)) {
                    return onPromptClick ? (
                        <PromptSuggestions
                            key={index}
                            prompts={input.suggestedPrompts}
                            onPromptClick={onPromptClick}
                            title="次は何をしますか？"
                            isSimple={true}
                        />
                    ) : null;
                }
            }
            return null;
        }

        case 'tool_result': {
            // Handle completion tool results (for table creation prompts)
            if (block.name === 'completion') {
                const result = block.result as {
                    suggestedPrompts?: Array<{
                        id?: string;
                        text: string;
                        description?: string;
                    }>;
                    completionMessage?: string;
                };
                if (result?.suggestedPrompts && Array.isArray(result.suggestedPrompts)) {
                    return onPromptClick ? (
                        <PromptSuggestions
                            key={index}
                            prompts={result.suggestedPrompts}
                            onPromptClick={onPromptClick}
                            title="次は何をしますか？"
                            isSimple={true}
                        />
                    ) : null;
                }
                return null;
            }

            // Handle table creation from duckdb_query
            if (block.name === 'duckdb_query') {
                const result = block.result as DuckDBToolResult;
                const tableCreated = result?.createdTable || null;

                if (tableCreated) {
                    return (
                        <TableCreatedMessage
                            key={index}
                            tableName={tableCreated}
                            isSelected={false}
                            onClick={() => onTableSelect?.(tableCreated)}
                            hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                            hasGeometry={tableGeometries?.[tableCreated] || false}
                            onChartIconClick={() => onChartIconClick?.(tableCreated)}
                            onMapIconClick={() => onMapIconClick?.(tableCreated)}
                        />
                    );
                }
            }
            return null;
        }

        default:
            return null;
    }
};

export const SimpleMessageRenderer: React.FC<SimpleMessageRendererProps> = ({
    message,
    className,
    selectedTable,
    onTableSelect,
    isStreaming = false,
    onPromptClick,
    chartSpecs,
    tableGeometries,
    onChartIconClick,
    onMapIconClick,
}) => {
    // Handle structured content
    if (Array.isArray(message.content)) {
        const contentArray = message.content;

        // Filter content for simple view
        // Keep: completion tools (prompts), table creation results, final text messages
        const filteredContent = contentArray.filter((block, index) => {
            // Keep completion tool use/result (suggested prompts)
            if (block.type === 'tool_use' && block.name === 'completion') {
                return true;
            }
            if (block.type === 'tool_result' && block.name === 'completion') {
                return true;
            }

            // Keep table creation results
            if (block.type === 'tool_result' && block.name === 'duckdb_query') {
                const result = block.result as DuckDBToolResult;
                if (result?.createdTable) return true;
                return false;
            }

            // Keep text blocks
            if (block.type === 'text') {
                const hasTableMarker = block.text.includes('<!--TABLE_CREATED:');
                const hasFinalMarker = block.text.includes('<!--FINAL_MESSAGE-->');

                // Always show table markers and final messages
                if (hasTableMarker || hasFinalMarker) return true;

                // Find last text index
                let lastTextIndex = -1;
                for (let i = contentArray.length - 1; i >= 0; i--) {
                    if (contentArray[i].type === 'text') {
                        lastTextIndex = i;
                        break;
                    }
                }

                // Show last text when not streaming
                const isLastText = index === lastTextIndex;
                if (isLastText && !isStreaming) {
                    if (block.text.trim() === '') return false;
                    return true;
                }
            }

            return false;
        });

        return (
            <div className={className}>
                {filteredContent.map((block, index) =>
                    renderContentBlock(
                        block,
                        index,
                        selectedTable,
                        onTableSelect,
                        onPromptClick,
                        chartSpecs,
                        tableGeometries,
                        onChartIconClick,
                        onMapIconClick
                    )
                )}

                {/* Render streaming text if present */}
                {message.streaming &&
                    (() => {
                        const displayText = message.streaming.replace('<!--FINAL_MESSAGE-->', '').trim();

                        if (displayText) {
                            return (
                                <div className="prose max-w-none">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                                        {displayText}
                                    </ReactMarkdown>
                                </div>
                            );
                        }
                        return null;
                    })()}
            </div>
        );
    }

    // Handle plain string content (for user messages)
    const stringContent = removeMetadataMarkers(message.content as string);
    const tableCreatedRegex = /<!--TABLE_CREATED:([^:>]+)-->/g;
    const tableMatches = Array.from(stringContent.matchAll(tableCreatedRegex));

    if (tableMatches.length > 0) {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;

        tableMatches.forEach((match, i) => {
            const matchIndex = match.index || 0;
            const beforeText = stringContent.slice(lastIndex, matchIndex);

            if (beforeText.trim()) {
                parts.push(
                    <div key={`text-${i}-before`} className="prose prose-sm max-w-none">
                        <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                            {beforeText}
                        </ReactMarkdown>
                    </div>
                );
            }

            const tableName = match[1];
            parts.push(
                <TableCreatedMessage
                    key={`table-${i}`}
                    tableName={tableName}
                    isSelected={false}
                    onClick={() => onTableSelect?.(tableName)}
                    hasChartSpec={chartSpecs ? tableName in chartSpecs : false}
                    hasGeometry={tableGeometries?.[tableName] || false}
                    onChartIconClick={() => onChartIconClick?.(tableName)}
                    onMapIconClick={() => onMapIconClick?.(tableName)}
                />
            );

            lastIndex = matchIndex + match[0].length;
        });

        // Add remaining text
        const remainingText = stringContent.slice(lastIndex);
        if (remainingText.trim()) {
            parts.push(
                <div key={`text-end`} className="prose max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                        {remainingText}
                    </ReactMarkdown>
                </div>
            );
        }

        // Check if this message only contains TABLE_CREATED markers
        if (isTableCreatedOnlyMessage(message.content as string)) {
            return <div className="space-y-1">{parts}</div>;
        }

        return <div className={className}>{parts}</div>;
    }

    // No table markers, render as plain markdown
    if (!stringContent) {
        return null;
    }

    return (
        <div className={className}>
            <div className="prose max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                    {stringContent}
                </ReactMarkdown>
            </div>
        </div>
    );
};

export default SimpleMessageRenderer;
