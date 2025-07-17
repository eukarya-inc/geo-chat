import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import VegaLiteChart from './VegaLiteChart';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';
import type { DBStateManager } from '../lib/duckdb/dbStateManager';

interface MessageRendererProps {
    content: string;
    className?: string;
    db?: AsyncDuckDB;
    dbStateManager?: DBStateManager;
}

interface CollapsibleSectionProps {
    title: string;
    children: React.ReactNode;
    defaultOpen?: boolean;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, children, defaultOpen = false }) => {
    return (
        <details className="group my-3" open={defaultOpen}>
            <summary className="cursor-pointer list-none flex items-center justify-between hover:bg-gray-50 transition-colors duration-200 rounded-md select-none">
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
                    className="w-4 h-4 transform transition-transform duration-200 group-open:rotate-90 ml-2"
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

const CollapsibleMessageRenderer: React.FC<MessageRendererProps> = ({ content, className, db, dbStateManager }) => {
    // Check if content contains Vega-Lite specifications
    const vegaSpecRegex = /<!--VEGA_SPEC_START-->\n(.*?)\n<!--VEGA_SPEC_END-->/gs;
    const vegaMatches = Array.from(content.matchAll(vegaSpecRegex));
    
    // Check if content contains SQL results
    const sqlResultRegex = /<!--SQL_RESULT_START-->\n(.*?)\n<!--SQL_RESULT_END-->/gs;
    const sqlResultMatches = Array.from(content.matchAll(sqlResultRegex));
    
    // Process content to identify and replace SQL results and Vega specs
    const processedContent = useMemo(() => {
        const parts: React.ReactNode[] = [];
        let lastIndex = 0;
        
        // Combine all matches and sort by index
        const allMatches: { match: RegExpMatchArray; type: 'vega' | 'sql' }[] = [
            ...vegaMatches.map(match => ({ match, type: 'vega' as const })),
            ...sqlResultMatches.map(match => ({ match, type: 'sql' as const }))
        ].sort((a, b) => (a.match.index || 0) - (b.match.index || 0));
        
        allMatches.forEach((item) => {
            const { match, type } = item;
            const matchIndex = match.index || 0;
            
            // Add content before this match
            const beforeContent = content.slice(lastIndex, matchIndex);
            if (beforeContent.trim()) {
                parts.push(
                    <div key={`text-${matchIndex}-before`} className="space-y-3">
                        <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            rehypePlugins={[rehypeHighlight]}
                        >
                            {beforeContent}
                        </ReactMarkdown>
                    </div>
                );
            }
            
            if (type === 'vega') {
                // Handle Vega chart
                try {
                    const vegaSpec = JSON.parse(match[1]);
                    parts.push(
                        <div key={`chart-${matchIndex}`} className="my-3">
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
                        <div key={`chart-error-${matchIndex}`} className="my-3" style={{ 
                            color: 'red', 
                            backgroundColor: '#ffe6e6', 
                            padding: '10px', 
                            borderRadius: '4px'
                        }}>
                            Failed to render chart: Invalid Vega-Lite specification
                        </div>
                    );
                }
            } else if (type === 'sql') {
                // Handle SQL result
                const sqlContent = match[1];
                
                // Extract title and content
                const titleMatch = sqlContent.match(/✅ \*\*結果:\*\* \(([^)]+)\)/);
                const title = titleMatch ? titleMatch[0] : '✅ 結果';
                
                // Extract content between markers
                const contentRegex = /<!--SQL_RESULT_CONTENT_START-->\n(.*?)\n<!--SQL_RESULT_CONTENT_END-->/s;
                const contentMatch = sqlContent.match(contentRegex);
                const resultContent = contentMatch ? contentMatch[1] : sqlContent;
                
                // Always default to closed state
                const defaultOpen = false;
                
                // Use stable key based on content
                const stableKey = `sql-${matchIndex}-${title.substring(0, 20)}`;
                parts.push(
                    <CollapsibleSection key={stableKey} title={title} defaultOpen={defaultOpen}>
                        <div className="overflow-x-auto">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                rehypePlugins={[rehypeHighlight]}
                            >
                                {resultContent}
                            </ReactMarkdown>
                        </div>
                    </CollapsibleSection>
                );
            }
            
            lastIndex = matchIndex + match[0].length;
        });
        
        // Add any remaining content
        const remaining = content.slice(lastIndex);
        if (remaining.trim()) {
            parts.push(
                <div key={`text-end-${lastIndex}`} className="space-y-3">
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {remaining}
                    </ReactMarkdown>
                </div>
            );
        }
        
        return parts;
    }, [content, db, dbStateManager, sqlResultMatches, vegaMatches]); // Only re-process when content changes
    
    // If no special content, render as normal markdown
    if (vegaMatches.length === 0 && sqlResultMatches.length === 0) {
        return (
            <div className={`${className} space-y-3`}>
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeHighlight]}
                >
                    {content}
                </ReactMarkdown>
            </div>
        );
    }
    
    return <div className={`${className} space-y-3`}>{processedContent}</div>;
};

export default CollapsibleMessageRenderer;