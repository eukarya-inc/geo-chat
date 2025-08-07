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
}

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false }) => {
    return (
        <details className="group my-3" open={defaultOpen}>
            <summary className="cursor-pointer list-none flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 rounded-md p-2 select-none">
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
            <div className="pl-3 mt-2">
                {children}
            </div>
        </details>
    );
};

const renderContentBlock = (
    block: StructuredContent, 
    index: number,
    selectedTable?: string | null,
    onTableSelect?: (tableName: string) => void
): React.ReactNode => {
    switch (block.type) {
        case 'text': {
            // Check for table created markers in text
            const tableCreatedRegex = /<!--TABLE_CREATED:(.+?)-->/g;
            const tableMatches = Array.from(block.text.matchAll(tableCreatedRegex));
            
            if (tableMatches.length > 0) {
                const parts: React.ReactNode[] = [];
                let lastIndex = 0;
                
                tableMatches.forEach((match, i) => {
                    const matchIndex = match.index || 0;
                    const beforeText = block.text.slice(lastIndex, matchIndex);
                    
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
                const remainingText = block.text.slice(lastIndex);
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
                
                return <div key={index} className="space-y-3">{parts}</div>;
            }
            
            // No table markers, render as plain markdown
            return (
                <div key={index} className="prose prose-sm max-w-none">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {block.text}
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
                        <pre className="p-3 bg-gray-100 rounded-md overflow-x-auto">
                            <code className="language-sql">{formattedSQL}</code>
                        </pre>
                    </CollapsibleSection>
                );
            }
            return null;
        }
            
        case 'tool_result': {
            if (block.name === 'duckdb_query') {
                const result = block.result as DuckDBToolResult;
                
                // Check if this created a table (do this first, before checking for errors or data)
                let tableCreated: string | null = null;
                if (result?.sql) {
                    const upperSql = String(result.sql).toUpperCase();
                    if (upperSql.includes('CREATE TABLE') || upperSql.includes('CREATE OR REPLACE TABLE')) {
                        const tableNameMatch = String(result.sql).match(/CREATE\s+(?:OR\s+REPLACE\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:[\w.]+\.)?(\w+)/i);
                        if (tableNameMatch) {
                            tableCreated = tableNameMatch[1];
                        }
                    }
                }
                
                if (result?.error) {
                    const errorMsg = String(result.error);
                    return (
                        <div key={index} className="my-3 text-red-600">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {errorMsg.includes('\n') 
                                    ? `❌ **エラー:**\n\`\`\`\n${errorMsg}\n\`\`\``
                                    : `❌ **エラー:** ${errorMsg}`}
                            </ReactMarkdown>
                        </div>
                    );
                }
                
                // If a table was created but there's no data to show, show the table created message
                if (tableCreated && !result?.data) {
                    return (
                        <div key={index}>
                            <div className="prose prose-sm max-w-none my-2">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    ✅ **テーブルを作成しました**
                                </ReactMarkdown>
                            </div>
                            <TableCreatedMessage
                                tableName={tableCreated}
                                isSelected={selectedTable === tableCreated}
                                onClick={() => onTableSelect?.(tableCreated)}
                            />
                        </div>
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
                            <pre className="p-3 bg-gray-100 rounded-md overflow-x-auto">
                                <code>{displayStr}</code>
                            </pre>
                            {summary && (
                                <div className="mt-2 text-sm text-gray-600">
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
                                </div>
                            )}
                            {result.sqlExplanation && (
                                <div className="mt-3 prose prose-sm">
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
    onTableSelect
}) => {
    // Handle structured content with optional streaming text
    if (Array.isArray(message.content)) {
        return (
            <div className={className}>
                {/* Render existing structured content blocks */}
                {message.content.map((block, index) => 
                    renderContentBlock(block, index, selectedTable, onTableSelect)
                )}
                
                {/* Render streaming text if present */}
                {message.streaming && (
                    <div className="prose prose-sm max-w-none">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                        >
                            {message.streaming}
                        </ReactMarkdown>
                    </div>
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
                <div key={`text-end`} className="prose prose-sm max-w-none">
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
            <div className="prose prose-sm max-w-none">
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