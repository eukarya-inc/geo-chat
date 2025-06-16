import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import VegaLiteChart from './VegaLiteChart';
import type { AsyncDuckDB } from '@duckdb/duckdb-wasm';

interface MessageRendererProps {
    content: string;
    className?: string;
    db?: AsyncDuckDB;
}

const MessageRenderer: React.FC<MessageRendererProps> = ({ content, className, db }) => {
    // Check if content contains Vega-Lite specifications
    const vegaSpecRegex = /<!--VEGA_SPEC_START-->\n(.*?)\n<!--VEGA_SPEC_END-->/gs;
    const vegaMatches = Array.from(content.matchAll(vegaSpecRegex));
    
    if (vegaMatches.length === 0) {
        // No charts, render as normal markdown
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
    
    // Split content by Vega specs and render each part
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    vegaMatches.forEach((match, index) => {
        // Add markdown content before this chart
        const beforeChart = content.slice(lastIndex, match.index);
        if (beforeChart.trim()) {
            parts.push(
                <div key={`text-${index}`}>
                    <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        rehypePlugins={[rehypeHighlight]}
                    >
                        {beforeChart}
                    </ReactMarkdown>
                </div>
            );
        }
        
        // Add the chart
        try {
            const vegaSpec = JSON.parse(match[1]);
            parts.push(
                <div key={`chart-${index}`} style={{ margin: '20px 0' }}>
                    <VegaLiteChart 
                        spec={vegaSpec} 
                        db={db}
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