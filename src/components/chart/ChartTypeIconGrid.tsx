import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export type ChartTypeOption = 'scatter' | 'line' | 'bar' | 'histogram' | 'pie' | 'heatmap' | 'box';

interface ChartTypeIconGridProps {
    selectedType: string;
    onSelect: (type: ChartTypeOption) => void;
    iconSize?: 'small' | 'large'; // 'small' for config panel, 'large' for initial selector
    variant?: 'selector' | 'config'; // 'selector' for ChartTypeSelector, 'config' for ChartConfigForm
}

export function ChartTypeIconGrid({
    selectedType,
    onSelect,
    iconSize = 'small',
    variant = 'config',
}: ChartTypeIconGridProps) {
    const [hoveredChart, setHoveredChart] = useState<string | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const buttonRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

    const isLarge = iconSize === 'large';
    const isSelector = variant === 'selector';

    const updateTooltipPosition = (type: string) => {
        const button = buttonRefs.current.get(type);
        if (button) {
            const rect = button.getBoundingClientRect();
            setTooltipPosition({
                top: rect.top - 32 + window.scrollY,
                left: rect.left + rect.width / 2 + window.scrollX,
            });
        }
    };

    useEffect(() => {
        if (hoveredChart) {
            updateTooltipPosition(hoveredChart);
        }
    }, [hoveredChart]);

    // Icon size configuration
    const svgSize = isLarge ? 28 : 16;
    const padding = isLarge ? '12px' : '4px';
    const minWidth = isLarge ? '60px' : '40px';
    const gap = '4px';

    const chartTypes: Array<{
        type: ChartTypeOption;
        label: string;
        icon: React.ReactElement;
    }> = [
        {
            type: 'line',
            label: 'Line Chart',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M3 17l6-6 4 4 8-8" />
                </svg>
            ),
        },
        {
            type: 'bar',
            label: 'Bar Chart',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M3 3v18h18M9 17V9m4 8V5m4 12v-7" />
                </svg>
            ),
        },
        {
            type: 'pie',
            label: 'Pie Chart',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M11 2a10 10 0 1 0 10 10h-10z" />
                    <path d="M21 12A10 10 0 0 0 12 2v10z" />
                </svg>
            ),
        },
        {
            type: 'scatter',
            label: 'Scatter Plot',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <circle cx="6" cy="6" r="2" />
                    <circle cx="18" cy="18" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="9" cy="18" r="2" />
                    <circle cx="18" cy="6" r="2" />
                </svg>
            ),
        },
        {
            type: 'histogram',
            label: 'Histogram',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M3 3v18h18M5 17v-6m3 6v-4m3 4v-8m3 8v-3m3 3v-5" />
                </svg>
            ),
        },
        {
            type: 'box',
            label: 'Box Plot',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <path d="M8 6h8v12H8z" />
                    <path d="M6 9h4m6 0h4M6 15h4m6 0h4M12 3v3m0 12v3" />
                </svg>
            ),
        },
        {
            type: 'heatmap',
            label: 'Heatmap',
            icon: (
                <svg
                    width={svgSize}
                    height={svgSize}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                >
                    <rect x="3" y="3" width="4" height="4" />
                    <rect x="10" y="3" width="4" height="4" />
                    <rect x="17" y="3" width="4" height="4" />
                    <rect x="3" y="10" width="4" height="4" />
                    <rect x="10" y="10" width="4" height="4" />
                    <rect x="17" y="10" width="4" height="4" />
                </svg>
            ),
        },
    ];

    // Selector variant uses Tailwind classes
    if (isSelector) {
        return (
            <>
                <div className="flex items-center justify-center gap-1">
                    {chartTypes.map(({ type, icon }) => (
                        <button
                            key={type}
                            ref={el => {
                                if (el) buttonRefs.current.set(type, el);
                                else buttonRefs.current.delete(type);
                            }}
                            onClick={() => onSelect(type)}
                            onMouseEnter={() => setHoveredChart(type)}
                            onMouseLeave={() => setHoveredChart(null)}
                            className="p-3 hover:bg-gray-200 rounded-lg transition-colors group cursor-pointer"
                            type="button"
                        >
                            {icon}
                        </button>
                    ))}
                </div>
                {hoveredChart &&
                    createPortal(
                        <div
                            className="fixed bg-gray-700 text-white px-2 py-1 rounded text-xs whitespace-nowrap z-[10000] pointer-events-none"
                            style={{
                                top: `${tooltipPosition.top}px`,
                                left: `${tooltipPosition.left}px`,
                                transform: 'translateX(-50%)',
                            }}
                        >
                            {chartTypes.find(ct => ct.type === hoveredChart)?.label}
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-700" />
                        </div>,
                        document.body
                    )}
            </>
        );
    }

    // Config variant uses inline styles for backward compatibility
    return (
        <>
            <div
                style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap,
                }}
            >
                {chartTypes.map(({ type, icon }) => (
                    <button
                        key={type}
                        ref={el => {
                            if (el) buttonRefs.current.set(type, el);
                            else buttonRefs.current.delete(type);
                        }}
                        type="button"
                        onClick={() => onSelect(type)}
                        onMouseEnter={() => setHoveredChart(type)}
                        onMouseLeave={() => setHoveredChart(null)}
                        style={{
                            padding,
                            border: `1px solid ${selectedType === type ? '#3b82f6' : '#e5e7eb'}`,
                            backgroundColor: selectedType === type ? '#eff6ff' : 'white',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            minWidth,
                        }}
                    >
                        {icon}
                    </button>
                ))}
            </div>
            {hoveredChart &&
                createPortal(
                    <div
                        style={{
                            position: 'fixed',
                            top: `${tooltipPosition.top}px`,
                            left: `${tooltipPosition.left}px`,
                            transform: 'translateX(-50%)',
                            backgroundColor: '#374151',
                            color: 'white',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75em',
                            whiteSpace: 'nowrap',
                            zIndex: 10000,
                            pointerEvents: 'none',
                        }}
                    >
                        {chartTypes.find(ct => ct.type === hoveredChart)?.label}
                        <div
                            style={{
                                position: 'absolute',
                                top: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                width: 0,
                                height: 0,
                                borderLeft: '4px solid transparent',
                                borderRight: '4px solid transparent',
                                borderTop: '4px solid #374151',
                            }}
                        />
                    </div>,
                    document.body
                )}
        </>
    );
}
