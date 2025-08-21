import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { StructuredMessage, StructuredContent, DuckDBToolInput, DuckDBToolResult } from '../../types/message';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { VegaChartSpec } from '../../types/chart';
import { formatSQLCompact } from '../../utils/sqlFormatter';
import { TableCreatedMessage } from './TableCreatedMessage';
import { PromptSuggestions } from './PromptSuggestions';

interface StructuredMessageRendererProps {
    message: StructuredMessage;
    className?: string;
    dbContext?: DBContext;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    hideToolCalls?: boolean;
    isStreaming?: boolean;
    onPromptClick?: (promptText: string) => void;
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
                            p: ({ children }) => <span>{children}</span>
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
                            p: ({ children }) => <span>{children}</span>
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
            <div className="pl-2 mt-1">
                {children}
            </div>
        </details>
    );
};

const renderContentBlock = (
    block: StructuredContent, 
    index: number,
    selectedTable?: string | null,
    onTableSelect?: (tableName: string) => void,
    onPromptClick?: (promptText: string) => void
): React.ReactNode => {
    switch (block.type) {
        case 'text': {
            // Remove FINAL_MESSAGE and CONTEXT markers from display
            const cleanedText = block.text
                .replace('<!--FINAL_MESSAGE-->', '')
                .replace(/<!--CONTEXT_START-->[\s\S]*?<!--CONTEXT_END-->/g, '')
                .trim();
            
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
                                <ReactMarkdown
                                    remarkPlugins={[remarkGfm]}
                                    rehypePlugins={[rehypeHighlight]}
                                >
                                    {beforeText}
                                </ReactMarkdown>
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
                        />
                    );
                    
                    lastIndex = matchIndex + match[0].length;
                });
                
                // Add remaining text
                const remainingText = cleanedText.slice(lastIndex);
                if (remainingText.trim()) {
                    parts.push(
                        <div key={`text-${index}-end`}>
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                            >
                                {remainingText}
                            </ReactMarkdown>
                        </div>
                    );
                }
                
                return <div key={index} className="space-y-1">{parts}</div>;
            }
            
            // No table markers, render as plain markdown
            if (!cleanedText) return null;
            
            return (
                <div key={index} className="prose max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {cleanedText}
                    </ReactMarkdown>
                </div>
            );
        }
            
        case 'tool_use': {
            if (block.name === 'duckdb_query') {
                const input = block.input as DuckDBToolInput;
                const formattedSQL = formatSQLCompact(input.sql);
                
                return (
                    <CollapsibleSection 
                        key={index} 
                        title="🔧 **SQL実行中:**" 
                        defaultOpen={false}
                    >
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
            return null;
        }
            
        case 'tool_result': {
            // Handle completion tool results (suggested prompts)
            if (block.name === 'completion') {
                const result = block.result as {
                    suggestedPrompts?: Array<{
                        id?: string;
                        text: string;
                        description?: string;
                    }>;
                    success?: boolean;
                    completionMessage?: string;
                    timestamp?: string;
                };
                if (result?.suggestedPrompts && Array.isArray(result.suggestedPrompts)) {
                    return onPromptClick ? (
                        <PromptSuggestions
                            key={index}
                            prompts={result.suggestedPrompts}
                            onPromptClick={onPromptClick}
                            title="おすすめの質問:"
                        />
                    ) : null;
                }
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
                                    <code className="language-json text-xs">{JSON.stringify(result.spec, null, 2)}</code>
                                </pre>
                            </CollapsibleSection>
                        );
                    } else {
                        return (
                            <CollapsibleSection 
                                key={index} 
                                title={`ℹ️ **${result.message}**`}
                            />
                        );
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
                    return (
                        <CollapsibleSection 
                            key={index} 
                            title={`✅ **${result.message}**`}
                        />
                    );
                } else {
                    return (
                        <CollapsibleSection 
                            key={index} 
                            title={`❌ **エラー:** ${result?.message || 'グラフの更新に失敗しました'}`}
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
                            />
                        );
                    }
                    
                    // If it's just a single row with Count or similar, just show table created message
                    const data = Array.isArray(result.data) ? result.data : [result.data];
                    if (data.length === 1 && data[0] && typeof data[0] === 'object' && Object.keys(data[0]).length === 1) {
                        return (
                            <TableCreatedMessage
                                key={index}
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
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
                        displayData = [...firstRows, { "...": `${rowCount - 5} more rows` }, ...lastRows];
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
    onPromptClick
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
            // 2. Completion tool results (suggested prompts) - ALWAYS show
            // 3. The last text message (only when not streaming)
            // 4. Text blocks with TABLE_CREATED markers - ALWAYS show
            // Note: SQL results and chart update results are hidden when collapsed
            filteredContent = message.content.filter((block, index) => {
                // Always keep completion tool results (suggested prompts)
                if (block.type === 'tool_result' && block.name === 'completion') {
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
                    renderContentBlock(block, index, selectedTable, onTableSelect, onPromptClick)
                )}
                
                {/* Render streaming text if present */}
                {message.streaming && (
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
                                        <ReactMarkdown
                                            remarkPlugins={[remarkGfm]}
                                            rehypePlugins={[rehypeHighlight]}
                                        >
                                            {displayText}
                                        </ReactMarkdown>
                                    </div>
                                );
                            }
                        }
                        return null;
                    })()
                )}
            </div>
        );
    }
    
    // Handle plain string content (for user messages)
    // Remove context markers and check for table created markers
    const stringContent = (message.content as string)
        .replace(/<!--CONTEXT_START-->[\s\S]*?<!--CONTEXT_END-->/g, '')
        .trim();
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
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                        >
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
                />
            );
            
            lastIndex = matchIndex + match[0].length;
        });
        
        // Add remaining text
        const remainingText = stringContent.slice(lastIndex);
        if (remainingText.trim()) {
            parts.push(
                <div key={`text-end`} className="prose max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {remainingText}
                    </ReactMarkdown>
                </div>
            );
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
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                >
                    {stringContent}
                </ReactMarkdown>
            </div>
        </div>
    );
};

export default StructuredMessageRenderer;