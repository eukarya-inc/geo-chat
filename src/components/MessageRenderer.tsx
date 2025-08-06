import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import VegaLiteChart from './VegaLiteChart';
import { TableCreatedMessage } from './TableCreatedMessage';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';

interface MessageRendererProps {
    content: string;
    className?: string;
    db?: AsyncDuckDB;
    dbStateManager?: DBStateManager;
    selectedTable?: string | null;
    onTableSelect?: (tableName: string) => void;
}

const MessageRenderer: React.FC<MessageRendererProps> = ({ 
    content, 
    className, 
    db, 
    dbStateManager,
    selectedTable,
    onTableSelect 
}) => {
    // Check if content contains Vega-Lite specifications
    const vegaSpecRegex = /<!--VEGA_SPEC_START-->\n(.*?)\n<!--VEGA_SPEC_END-->/gs;
    const vegaMatches = Array.from(content.matchAll(vegaSpecRegex));
    
    // Check for CREATE TABLE statements
    const tableCreatedRegex = /<!--TABLE_CREATED:(.+?)-->/g;
    const tableMatches = Array.from(content.matchAll(tableCreatedRegex));
    
    if (vegaMatches.length === 0 && tableMatches.length === 0) {
        // No special content, render as normal markdown
        return (
            <div className={className}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                >
                    {content}
                </ReactMarkdown>
            </div>
        );
    }
    
    // Combine and sort all special content matches
    const allMatches = [
        ...vegaMatches.map(m => ({ type: 'vega' as const, match: m })),
        ...tableMatches.map(m => ({ type: 'table' as const, match: m }))
    ].sort((a, b) => (a.match.index || 0) - (b.match.index || 0));
    
    // Split content by special content and render each part
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    allMatches.forEach((item, index) => {
        const match = item.match;
        // Add markdown content before this special content
        const beforeContent = content.slice(lastIndex, match.index);
        if (beforeContent.trim()) {
            parts.push(
                <div key={`text-${index}`}>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {beforeContent}
                    </ReactMarkdown>
                </div>
            );
        }
        
        // Add the special content (chart or table)
        if (item.type === 'vega') {
            try {
                const vegaSpec = JSON.parse(match[1]);
                parts.push(
                    <div key={`chart-${index}`} style={{ margin: '20px 0' }}>
                        <VegaLiteChart 
                            spec={vegaSpec} 
                            db={db}
                            dbStateManager={dbStateManager}
                        />
                    </div>
                );
            } catch (error) {
                console.error('Failed to parse Vega-Lite spec:', error);
                parts.push(
                    <div key={`chart-error-${index}`} style={{ 
                        color: 'red', 
                        backgroundColor: '#ffe6e6', 
                        padding: '10px', 
                        borderRadius: '4px',
                        margin: '10px 0'
                    }}>
                        Failed to render chart: Invalid Vega-Lite specification
                    </div>
                );
            }
        } else if (item.type === 'table' && onTableSelect) {
            const tableName = match[1];
            parts.push(
                <div key={`table-${index}`}>
                    <TableCreatedMessage
                        tableName={tableName}
                        isSelected={selectedTable === tableName}
                        onClick={() => onTableSelect(tableName)}
                    />
                </div>
            );
        }
        
        lastIndex = (match.index || 0) + match[0].length;
    });
    
    // Add any remaining content after the last chart
    const remaining = content.slice(lastIndex);
    if (remaining.trim()) {
        parts.push(
            <div key="text-end">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                >
                    {remaining}
                </ReactMarkdown>
            </div>
        );
    }
    
    return <div className={className}>{parts}</div>;
};

export default MessageRenderer;