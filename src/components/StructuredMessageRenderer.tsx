import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import type { StructuredMessage, StructuredContent, DuckDBToolInput, DuckDBToolResult } from '../types/message';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';
import { formatSQLCompact } from '../utils/sqlFormatter';
import { TableCreatedMessage } from './TableCreatedMessage';

interface StructuredMessageRendererProps {
    message: StructuredMessage;
    className?: string;
    db?: AsyncDuckDB;
    dbStateManager?: DBStateManager;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
    hideToolCalls?: boolean;
    isStreaming?: boolean;
}

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false }) => {
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
    hideToolDetails: boolean = false
): React.ReactNode => {
    switch (block.type) {
        case 'text': {
            // Remove FINAL_MESSAGE marker from display
            const cleanedText = block.text.replace('<!--FINAL_MESSAGE-->', '').trim();
            
            // Check for table created markers in text
            const tableCreatedRegex = /<!--TABLE_CREATED:(.+?)-->/g;
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
            return null;
        }
            
        case 'tool_result': {
            if (block.name === 'duckdb_query') {
                const result = block.result as DuckDBToolResult;
                
                // Check if this created a table from the result
                const tableCreated = result?.createdTable || null;
                
                // Debug logging
                if (result?.sql && (result.sql.toUpperCase().includes('CREATE TABLE') || result.sql.toUpperCase().includes('CREATE OR REPLACE'))) {
                    console.log('CREATE TABLE detected in result:', {
                        sql: result.sql,
                        createdTable: result?.createdTable,
                        hasData: !!result?.data,
                        dataLength: Array.isArray(result?.data) ? result.data.length : 0,
                        result: result
                    });
                }
                
                // When hideToolDetails is true and table was created, only show the table creation message
                if (hideToolDetails && tableCreated) {
                    return (
                        <div key={index}>
                            <TableCreatedMessage
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                            />
                        </div>
                    );
                }
                
                if (result?.error) {
                    const errorMsg = String(result.error);
                    return (
                        <div key={index} className="my-1 text-red-600">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {errorMsg.includes('\n') 
                                    ? `❌ **エラー:**\n\`\`\`\n${errorMsg}\n\`\`\``
                                    : `❌ **エラー:** ${errorMsg}`}
                            </ReactMarkdown>
                        </div>
                    );
                }
                
                // If a table was created but there's no data to show (or data is empty), show the table created message
                if (tableCreated && (!result?.data || (Array.isArray(result.data) && result.data.length === 0))) {
                    return (
                        <div key={index}>
                            <TableCreatedMessage
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                            />
                        </div>
                    );
                }
                
                // For CREATE TABLE AS SELECT, show both the result and table created message
                if (tableCreated && result?.data) {
                    const data = Array.isArray(result.data) ? result.data : [result.data];
                    
                    // If it's just a single row with Count or similar, just show table created message
                    if (data.length === 1 && data[0] && typeof data[0] === 'object' && Object.keys(data[0]).length === 1) {
                        return (
                            <div key={index}>
                                <TableCreatedMessage
                                    tableName={tableCreated}
                                    isSelected={selectedTable === tableCreated}
                                    onClick={() => onTableSelect?.(tableCreated)}
                                />
                            </div>
                        );
                    }
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
    isStreaming = false
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
            // 2. The last text message (only when not streaming)
            // 3. Text blocks with TABLE_CREATED markers - ALWAYS show
            filteredContent = message.content.filter((block, index) => {
                // Always keep table creation tool results
                if (block.type === 'tool_result' && block.name === 'duckdb_query') {
                    const result = block.result as DuckDBToolResult;
                    if (result?.createdTable) return true;
                }
                
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
                
                // Hide everything else
                return false;
            });
        }
            
        return (
            <div className={className}>
                {/* Render existing structured content blocks */}
                {filteredContent.map((block, index) => 
                    renderContentBlock(block, index, selectedTable, onTableSelect, hideToolCalls)
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
    // Check for table created markers in plain string content
    const stringContent = message.content as string;
    const tableCreatedRegex = /<!--TABLE_CREATED:(.+?)-->/g;
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
    return (
        <div className={className}>
            <div className="prose max-w-none">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                >
                    {message.content}
                </ReactMarkdown>
            </div>
        </div>
    );
};

export default StructuredMessageRenderer;