import { useEffect, useState, useRef } from 'react';
import { parse, convert, render } from 'sqloflow';
import { instance } from '@viz-js/viz';

interface SQLFlowVisualizationProps {
    sql: string;
}

export function SQLFlowVisualization({ sql }: SQLFlowVisualizationProps) {
    const [error, setError] = useState<string>('');
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!sql) {
            return;
        }

        const renderDotGraph = async () => {
            try {
                // Parse SQL with PostgreSQL dialect (DuckDB compatible)
                const ast = parse(sql, 'postgresql');
                const ir = convert(ast);
                const dot = render(ir, { format: 'dot' });

                // Render DOT to SVG using viz-js
                const viz = await instance();
                const svg = viz.renderSVGElement(dot);

                // Set the SVG content
                if (containerRef.current) {
                    containerRef.current.innerHTML = '';
                    containerRef.current.appendChild(svg);

                    // Adjust SVG to fit container
                    svg.setAttribute('width', '100%');
                    svg.setAttribute('height', '100%');
                    svg.style.maxWidth = '100%';
                    svg.style.maxHeight = '100%';
                }

                setError('');
            } catch (error) {
                console.error('Error generating SQL flow visualization:', error);
                setError('SQLの解析中にエラーが発生しました');
            }
        };

        renderDotGraph();
    }, [sql]);

    if (error) {
        return <div className="w-full h-full flex items-center justify-center text-red-500 text-sm">{error}</div>;
    }

    return <div ref={containerRef} className="w-full h-full overflow-auto p-2 bg-white" style={{ minHeight: '200px' }} />;
}
