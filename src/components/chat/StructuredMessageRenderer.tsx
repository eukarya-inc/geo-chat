import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { StructuredMessage, StructuredContent, DuckDBToolInput, DuckDBToolResult } from '../../types/message';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { VegaChartSpec, ChartSpec } from '../../types/chart';
import { formatSQLCompact } from '../../utils/sqlFormatter';
import { TableCreatedMessage } from './TableCreatedMessage';
import { PromptSuggestions } from './PromptSuggestions';
import { CopyButton } from './CopyButton';
import { isTableCreatedOnlyMessage, removeMetadataMarkers } from './utils';

interface StructuredMessageRendererProps {
    message: StructuredMessage;
    className?: string;
    dbContext?: DBContext;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    hideToolCalls?: boolean;
    isStreaming?: boolean;
    onPromptClick?: (promptText: string) => void;
    isLoadingMessage?: boolean;
    chartSpecs?: Record<string, ChartSpec>;
    tableGeometries?: Record<string, boolean>;
}

interface CollapsibleSectionProps {
    title: string;
    children?: React.ReactNode;
    defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false }) => {
    // If no children, render as a simple non-collapsible item
    if (!children) {
        return (
            <div className="my-1 p-1.5">
                <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ children }) => <span>{children}</span>,
                        }}
                    >
                        {title}
                    </ReactMarkdown>
                </div>
            </div>
        );
    }

    return (
        <details className="group my-1" open={defaultOpen}>
            <summary className="cursor-pointer list-none flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 rounded-md p-1.5 select-none">
                <div className="prose prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                            p: ({ children }) => <span>{children}</span>,
                        }}
                    >
                        {title}
                    </ReactMarkdown>
                </div>
                <svg
                    className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-90"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
            </summary>
            <div className="pl-2 mt-1">{children}</div>
        </details>
    );
};

const renderContentBlock = (
    block: StructuredContent,
    index: number,
    selectedTable?: string | null,
    onTableSelect?: (tableName: string) => void,
    onPromptClick?: (promptText: string) => void,
    isLoadingMessage?: boolean,
    chartSpecs?: Record<string, ChartSpec>,
    tableGeometries?: Record<string, boolean>
): React.ReactNode => {
    switch (block.type) {
        case 'text': {
            // Remove FINAL_MESSAGE, CONTEXT, and TABLE_INFO markers from display
            const cleanedText = block.text
                .replace('<!--FINAL_MESSAGE-->', '')
                .replace(/<!--CONTEXT_START-->[\s\S]*?<!--CONTEXT_END-->/g, '')
                .replace(/<!--TABLE_INFO_START-->[\s\S]*?<!--TABLE_INFO_END-->/g, '')
                .trim();

            // Check if this is a final message (final conclusion)
            const isFinalMessage = block.text.includes('<!--FINAL_MESSAGE-->');

            // Check for table created markers in text
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
                                        <CopyButton onCopy={() => navigator.clipboard.writeText(beforeText)} />
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
                            isSelected={selectedTable === tableName}
                            onClick={() => onTableSelect?.(tableName)}
                            hasChartSpec={chartSpecs ? tableName in chartSpecs : false}
                            hasGeometry={tableGeometries?.[tableName] || false}
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
                                    <CopyButton onCopy={() => navigator.clipboard.writeText(remainingText)} />
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
                    {!isLoadingMessage && isFinalMessage && (
                        <div className="mt-2 flex">
                            <CopyButton onCopy={() => navigator.clipboard.writeText(cleanedText)} />
                        </div>
                    )}
                </div>
            );
        }

        case 'tool_use': {
            if (block.name === 'duckdb_query') {
                const input = block.input as DuckDBToolInput;
                const formattedSQL = formatSQLCompact(input.sql);

                return (
                    <CollapsibleSection key={index} title="🔧 **SQL実行中:**" defaultOpen={false}>
                        <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                            <code className="language-sql text-xs">{formattedSQL}</code>
                        </pre>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'update_vega_chart_spec_for_table') {
                const input = block.input as { table_name: string; vega_spec: Partial<VegaChartSpec> };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`📊 **グラフ設定を更新中: ${input.table_name}**`}
                        defaultOpen={false}
                    >
                        <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                            <code className="language-json text-xs">{JSON.stringify(input.vega_spec, null, 2)}</code>
                        </pre>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'get_vega_chart_spec_for_table') {
                const input = block.input as { table_name: string };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`📊 **グラフ設定を取得中: ${input.table_name}**`}
                        defaultOpen={false}
                    >
                        <div className="p-2 text-xs text-gray-600">
                            テーブル「{input.table_name}」のVega-Liteチャート設定を取得しています...
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'update_map_style_for_table') {
                const input = block.input as {
                    table_name: string;
                    geometry_type: string;
                    style_properties: Record<string, unknown>;
                    description: string;
                };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`🗺️ **地図スタイルを更新中: ${input.table_name}**`}
                        defaultOpen={false}
                    >
                        <div className="p-2 text-xs space-y-2">
                            <div className="text-gray-600">
                                <div>ジオメトリタイプ: {input.geometry_type}</div>
                                <div>説明: {input.description}</div>
                            </div>
                            <div>
                                <div className="font-semibold text-gray-700">送信されたJSON:</div>
                                <pre className="mt-1 p-2 bg-gray-100 rounded-md overflow-x-auto">
                                    <code className="language-json text-xs">{JSON.stringify(input, null, 2)}</code>
                                </pre>
                            </div>
                        </div>
                    </CollapsibleSection>
                );
            }
            if (block.name === 'get_map_style_for_table') {
                const input = block.input as { table_name: string };
                return (
                    <CollapsibleSection
                        key={index}
                        title={`🗺️ **地図スタイルを取得中: ${input.table_name}**`}
                        defaultOpen={false}
                    >
                        <div className="p-2 text-xs text-gray-600">
                            テーブル「{input.table_name}」の地図スタイル設定を取得しています...
                        </div>
                    </CollapsibleSection>
                );
            }
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
                            title="おすすめの質問:"
                        />
                    ) : null;
                }
                return null;
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
                // Show suggestions if they exist (table creation case)
                if (result?.suggestedPrompts && Array.isArray(result.suggestedPrompts)) {
                    return onPromptClick ? (
                        <PromptSuggestions
                            key={index}
                            prompts={result.suggestedPrompts}
                            onPromptClick={onPromptClick}
                        />
                    ) : null;
                }
                // If no suggestions, return null
                return null;
            }

            // Handle get_vega_chart_spec_for_table tool results
            if (block.name === 'get_vega_chart_spec_for_table') {
                const result = block.result as { success: boolean; message: string; spec: VegaChartSpec | null };
                if (result?.success) {
                    if (result.spec) {
                        const title = `✅ **${result.message}**`;
                        return (
                            <CollapsibleSection key={index} title={title} defaultOpen={false}>
                                <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                                    <code className="language-json text-xs">
                                        {JSON.stringify(result.spec, null, 2)}
                                    </code>
                                </pre>
                            </CollapsibleSection>
                        );
                    } else {
                        return <CollapsibleSection key={index} title={`ℹ️ **${result.message}**`} />;
                    }
                } else {
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`❌ **エラー:** ${result?.message || 'グラフ設定の取得に失敗しました'}`}
                        />
                    );
                }
            }

            // Handle update_vega_chart_spec_for_table tool results
            if (block.name === 'update_vega_chart_spec_for_table') {
                const result = block.result as { success: boolean; message: string; tableName?: string };
                if (result?.success) {
                    return <CollapsibleSection key={index} title={`✅ **${result.message}**`} />;
                } else {
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`❌ **エラー:** ${result?.message || 'グラフの更新に失敗しました'}`}
                        />
                    );
                }
            }

            // Handle update_map_style_for_table tool results
            if (block.name === 'update_map_style_for_table') {
                const result = block.result as {
                    success: boolean;
                    message: string;
                    error?: string;
                    warnings?: string[];
                    appliedUpdate?: {
                        tableName: string;
                        geometryType: string;
                        layers: Array<{
                            id: string;
                            type: string;
                            paint: Record<string, unknown>;
                        }>;
                    };
                };
                if (result?.success) {
                    return <CollapsibleSection key={index} title={`✅ **${result.message}**`} />;
                } else {
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`❌ **エラー:** ${result?.error || '地図スタイルの更新に失敗しました'}`}
                        />
                    );
                }
            }

            // Handle get_map_style_for_table tool results
            if (block.name === 'get_map_style_for_table') {
                const result = block.result as {
                    success: boolean;
                    message?: string;
                    error?: string;
                    tableStyles: unknown[] | null;
                    extraStyle: unknown | null;
                    metadata?: {
                        hasTableStyles: boolean;
                        hasExtraStyle: boolean;
                        layerCount: number;
                        note: string | null;
                    };
                };
                if (result?.success) {
                    const title = result.message ? `✅ **${result.message}**` : '✅ **地図スタイルを取得しました**';
                    return (
                        <CollapsibleSection key={index} title={title} defaultOpen={false}>
                            <div className="p-2 text-xs space-y-2">
                                {result.metadata && (
                                    <div className="text-gray-600">
                                        <div>レイヤー数: {result.metadata.layerCount}</div>
                                        {result.metadata.note && (
                                            <div className="mt-1 text-amber-600">{result.metadata.note}</div>
                                        )}
                                    </div>
                                )}
                                {result.tableStyles && result.tableStyles.length > 0 ? (
                                    <div>
                                        <div className="font-semibold text-gray-700">テーブルスタイル:</div>
                                        <pre className="mt-1 p-2 bg-gray-100 rounded-md overflow-x-auto">
                                            <code className="language-json text-xs">
                                                {JSON.stringify(result.tableStyles, null, 2)}
                                            </code>
                                        </pre>
                                    </div>
                                ) : null}
                                {result.extraStyle ? (
                                    <div>
                                        <div className="font-semibold text-gray-700">ベーススタイル:</div>
                                        <pre className="mt-1 p-2 bg-gray-100 rounded-md overflow-x-auto">
                                            <code className="language-json text-xs">
                                                {JSON.stringify(result.extraStyle, null, 2)}
                                            </code>
                                        </pre>
                                    </div>
                                ) : null}
                            </div>
                        </CollapsibleSection>
                    );
                } else {
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`❌ **エラー:** ${result?.error || '地図スタイルの取得に失敗しました'}`}
                        />
                    );
                }
            }

            if (block.name === 'duckdb_query') {
                const result = block.result as DuckDBToolResult;

                // Check if this created a table from the result
                const tableCreated = result?.createdTable || null;

                // When a table was created, abbreviate the result display
                if (tableCreated) {
                    // If there's no data or empty data, just show the table creation message
                    if (!result?.data || (Array.isArray(result.data) && result.data.length === 0)) {
                        return (
                            <TableCreatedMessage
                                key={index}
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                                hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                                hasGeometry={tableGeometries?.[tableCreated] || false}
                            />
                        );
                    }

                    // If it's just a single row with Count or similar, just show table created message
                    const data = Array.isArray(result.data) ? result.data : [result.data];
                    if (
                        data.length === 1 &&
                        data[0] &&
                        typeof data[0] === 'object' &&
                        Object.keys(data[0]).length === 1
                    ) {
                        return (
                            <TableCreatedMessage
                                key={index}
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                                hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                                hasGeometry={tableGeometries?.[tableCreated] || false}
                            />
                        );
                    }
                }

                if (result?.error) {
                    const errorMsg = String(result.error);
                    return (
                        <CollapsibleSection
                            key={index}
                            title={`❌ **エラー:** ${errorMsg.includes('\n') ? '詳細を表示' : errorMsg}`}
                            defaultOpen={false}
                        >
                            {errorMsg.includes('\n') && (
                                <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                                    <code className="text-xs">{errorMsg}</code>
                                </pre>
                            )}
                        </CollapsibleSection>
                    );
                }

                if (result?.data) {
                    const data = Array.isArray(result.data) ? result.data : [result.data];
                    const rowCount = data.length;

                    let displayData = data;
                    let title = `✅ **結果:** (${rowCount}行)`;
                    let summary = '';

                    if (rowCount > 100) {
                        const firstRows = data.slice(0, 3);
                        const lastRows = data.slice(-2);
                        displayData = [...firstRows, { '...': `${rowCount - 5} more rows` }, ...lastRows];
                        title = `✅ **結果:** (${rowCount}行 - 抜粋表示)`;
                        summary = `📊 **データサマリー:** 全${rowCount}行のうち最初の3行と最後の2行を表示。`;
                    } else if (rowCount > 20) {
                        displayData = data.slice(0, 10);
                        title = `✅ **結果:** (${rowCount}行 - 最初の10行を表示)`;
                        summary = `📋 残り${rowCount - 10}行があります。`;
                    }

                    const dataStr = JSON.stringify(displayData, null, 2);
                    const isLongData = dataStr.length > 8000;
                    const displayStr = isLongData ? dataStr.substring(0, 8000) + '...' : dataStr;

                    return (
                        <CollapsibleSection key={index} title={title} defaultOpen={false}>
                            <pre className="p-2 bg-gray-100 rounded-md overflow-x-auto text-xs">
                                <code className="text-xs">{displayStr}</code>
                            </pre>
                            {summary && (
                                <div className="mt-1 text-xs text-gray-600">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                                </div>
                            )}
                            {result.sqlExplanation && (
                                <div className="mt-1.5 prose prose-xs text-xs">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {`📝 **SQL解説:**\n${result.sqlExplanation}`}
                                    </ReactMarkdown>
                                </div>
                            )}
                            {tableCreated && (
                                <TableCreatedMessage
                                    tableName={tableCreated}
                                    isSelected={selectedTable === tableCreated}
                                    onClick={() => onTableSelect?.(tableCreated)}
                                    hasChartSpec={chartSpecs ? tableCreated in chartSpecs : false}
                                    hasGeometry={tableGeometries?.[tableCreated] || false}
                                />
                            )}
                        </CollapsibleSection>
                    );
                }
            }
            return null;
        }

        default:
            return null;
    }
};

export const StructuredMessageRenderer: React.FC<StructuredMessageRendererProps> = ({
    message,
    className,
    selectedTable,
    onTableSelect,
    hideToolCalls = false,
    isStreaming = false,
    onPromptClick,
    isLoadingMessage = false,
    chartSpecs,
    tableGeometries,
}) => {
    // Handle structured content with optional streaming text
    if (Array.isArray(message.content)) {
        // Filter content based on hideToolCalls flag
        let filteredContent = message.content;

        if (hideToolCalls) {
            // Find the index of the last text block
            let lastTextIndex = -1;
            for (let i = message.content.length - 1; i >= 0; i--) {
                if (message.content[i].type === 'text') {
                    lastTextIndex = i;
                    break;
                }
            }

            // Filter to keep only:
            // 1. Table creation messages (tool_result with createdTable) - ALWAYS show
            // 2. Completion tool use (suggested prompts) - ALWAYS show
            // 3. The last text message (only when not streaming)
            // 4. Text blocks with TABLE_CREATED markers - ALWAYS show
            // Note: SQL results and chart update results are hidden when collapsed
            filteredContent = message.content.filter((block, index) => {
                // Always keep completion tool use (suggested prompts)
                if (block.type === 'tool_use' && block.name === 'completion') {
                    return true;
                }

                // Only keep table creation tool results, not all SQL results
                if (block.type === 'tool_result' && block.name === 'duckdb_query') {
                    const result = block.result as DuckDBToolResult;
                    // Only show if it created a table
                    if (result?.createdTable) return true;
                    // Hide regular SQL results when collapsed
                    return false;
                }

                // Hide chart update tool results when collapsed
                // (Don't include update_vega_chart_spec_for_table here)

                // Keep text blocks based on conditions
                if (block.type === 'text') {
                    const hasTableMarker = block.text.includes('<!--TABLE_CREATED:');
                    const hasFinalMarker = block.text.includes('<!--FINAL_MESSAGE-->');

                    // Always show table markers and final messages
                    if (hasTableMarker || hasFinalMarker) return true;

                    // Only show last text when not streaming
                    const isLastText = index === lastTextIndex;
                    if (isLastText && !isStreaming) {
                        // Don't show if it's empty
                        if (block.text.trim() === '') return false;
                        return true;
                    }
                }

                // Hide everything else (tool_use blocks)
                return false;
            });
        }

        return (
            <div className={className}>
                {/* Render existing structured content blocks */}
                {filteredContent.map((block, index) =>
                    renderContentBlock(
                        block,
                        index,
                        selectedTable,
                        onTableSelect,
                        onPromptClick,
                        isLoadingMessage,
                        chartSpecs,
                        tableGeometries
                    )
                )}

                {/* Render streaming text if present */}
                {message.streaming &&
                    (() => {
                        // Check if this is a final message
                        const isFinalMessage = message.streaming.includes('<!--FINAL_MESSAGE-->');

                        // Show streaming text if:
                        // 1. Not hiding tool calls, OR
                        // 2. It's a final message (always show final messages even when collapsed)
                        if (!hideToolCalls || isFinalMessage) {
                            // Remove the FINAL_MESSAGE marker from display
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
                        }
                        return null;
                    })()}
            </div>
        );
    }

    // Handle plain string content (for user messages)
    // Remove metadata markers for display
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
                    isSelected={selectedTable === tableName}
                    onClick={() => onTableSelect?.(tableName)}
                    hasChartSpec={chartSpecs ? tableName in chartSpecs : false}
                    hasGeometry={tableGeometries?.[tableName] || false}
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

        // Check if this message only contains TABLE_CREATED markers using shared utility
        if (isTableCreatedOnlyMessage(message.content as string)) {
            // This message ONLY contains TABLE_CREATED markers, no other text
            // Render without bubble styling
            return <div className="space-y-1">{parts}</div>;
        }

        return <div className={className}>{parts}</div>;
    }

    // No table markers, render as plain markdown
    // But don't render if the content is empty after removing context
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

export default StructuredMessageRenderer;
