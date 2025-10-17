import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    CogIcon,
    EllipsisVerticalIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CodeBracketIcon,
} from '@heroicons/react/24/outline';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { View } from 'vega';

interface ChartDropdownMenuProps {
    chartSpec: ChartSpec;
    vegaView?: View | null;
    dbContext?: DBContext;
    schema?: string;
    onConfigOpen?: () => void;
    onDataSourceOpen?: () => void;
    onJsonSourceOpen?: () => void;
    onRemove?: () => void;
    onExport?: () => void;
    showConfigButton?: boolean;
    showDataSourceButton?: boolean;
    showJsonSourceButton?: boolean;
    showRemoveButton?: boolean;
    showExportButton?: boolean;
    isExportDisabled?: boolean;
    exportTooltip?: string;
}

export function ChartDropdownMenu({
    chartSpec,
    vegaView,
    dbContext,
    schema,
    onConfigOpen,
    onDataSourceOpen,
    onJsonSourceOpen,
    onRemove,
    onExport,
    showConfigButton = true,
    showDataSourceButton = true,
    showJsonSourceButton = true,
    showRemoveButton = true,
    showExportButton = true,
    isExportDisabled = false,
    exportTooltip,
}: ChartDropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Calculate menu position when opened
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + window.scrollY,
                left: rect.right + window.scrollX - 224, // 224px is menu width (w-56 = 14rem = 224px)
            });
        }
    }, [isOpen]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleCopyToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
                setIsOpen(false);
                return;
            }

            // Try canvas (PNG) first - look for vega-embed or dashboard-chart-container
            const canvasElement = document.querySelector(
                '.vega-embed canvas, .dashboard-chart-container canvas, canvas.vega-chart'
            );
            if (canvasElement) {
                const canvas = canvasElement as HTMLCanvasElement;

                // Safari requires ClipboardItem to be created synchronously with a Promise
                const blobPromise = new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(blob => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create image from canvas'));
                        }
                    }, 'image/png');
                });

                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);

                alert('Chart copied to clipboard!');
                setIsOpen(false);
                return;
            }

            // Try SVG - convert to PNG for clipboard
            const svgElement = document.querySelector(
                '.vega-embed svg, .dashboard-chart-container svg, svg.vega-chart'
            );
            if (svgElement) {
                const svg = svgElement as SVGElement;
                const svgData = new XMLSerializer().serializeToString(svg);
                const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                const url = URL.createObjectURL(svgBlob);

                // Safari requires ClipboardItem to be created synchronously with a Promise
                const blobPromise = new Promise<Blob>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => {
                        try {
                            // Create canvas and draw image
                            const tempCanvas = document.createElement('canvas');
                            tempCanvas.width = img.width;
                            tempCanvas.height = img.height;
                            const ctx = tempCanvas.getContext('2d');
                            if (!ctx) {
                                reject(new Error('Failed to get canvas context'));
                                return;
                            }

                            ctx.drawImage(img, 0, 0);

                            // Convert to blob
                            tempCanvas.toBlob(blob => {
                                URL.revokeObjectURL(url);
                                if (blob) {
                                    resolve(blob);
                                } else {
                                    reject(new Error('Failed to create PNG from SVG'));
                                }
                            }, 'image/png');
                        } catch (error) {
                            URL.revokeObjectURL(url);
                            reject(error);
                        }
                    };
                    img.onerror = () => {
                        URL.revokeObjectURL(url);
                        reject(new Error('Failed to load SVG image'));
                    };
                    img.src = url;
                });

                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);

                alert('Chart copied to clipboard!');
                setIsOpen(false);
                return;
            }

            alert('Chart not found. Please ensure the chart is fully rendered and try again.');
        } catch (err) {
            console.error('Error copying chart:', err);
            alert(`Failed to copy chart to clipboard: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        setIsOpen(false);
    };

    const handleSaveAsPNG = () => {
        const chartTitle = chartSpec?.title || 'chart';

        // Try canvas (PNG)
        const canvasElement = document.querySelector(
            '.vega-embed canvas, .dashboard-chart-container canvas, canvas.vega-chart'
        );
        if (canvasElement) {
            const canvas = canvasElement as HTMLCanvasElement;
            const link = document.createElement('a');
            link.download = `${chartTitle.replace(/[^a-z0-9]/gi, '_')}.png`;
            link.href = canvas.toDataURL();
            link.click();
            setIsOpen(false);
            return;
        }

        // If canvas not found
        alert('PNG export is only available for canvas-rendered charts. Please use "Save as SVG" instead.');
        setIsOpen(false);
    };

    const handleSaveAsSVG = async () => {
        if (!vegaView) {
            alert('Chart not ready. Please try again in a moment.');
            setIsOpen(false);
            return;
        }

        try {
            const chartTitle = chartSpec?.title || 'chart';
            const svgString = await vegaView.toSVG();
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${chartTitle.replace(/[^a-z0-9]/gi, '_')}.svg`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error exporting SVG:', error);
            alert('Failed to export chart as SVG. Please try again.');
        }
        setIsOpen(false);
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                onMouseDown={e => {
                    e.stopPropagation();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer"
                title="Chart options"
                type="button"
            >
                <EllipsisVerticalIcon className="w-5 h-5" />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        className="fixed w-56 bg-white border border-gray-200 rounded-lg shadow-lg z-[10000]"
                        style={{
                            top: `${menuPosition.top}px`,
                            left: `${menuPosition.left}px`,
                        }}
                    >
                        <div className="py-1">
                            {showConfigButton && onConfigOpen && dbContext && schema && (
                                <button
                                    onClick={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onConfigOpen();
                                        setIsOpen(false);
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                    type="button"
                                >
                                    <CogIcon className="w-4 h-4 mr-2" />
                                    グラフスタイルを編集
                                </button>
                            )}

                            {showDataSourceButton && onDataSourceOpen && (
                                <button
                                    onClick={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onDataSourceOpen();
                                        setIsOpen(false);
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                    type="button"
                                >
                                    <CodeBracketIcon className="w-4 h-4 mr-2" />
                                    データソースを編集
                                </button>
                            )}

                            {showJsonSourceButton && onJsonSourceOpen && (
                                <button
                                    onClick={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onJsonSourceOpen();
                                        setIsOpen(false);
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                    type="button"
                                >
                                    <CodeBracketIcon className="w-4 h-4 mr-2" />
                                    グラフ仕様を表示
                                </button>
                            )}

                            {(showConfigButton || showDataSourceButton || showJsonSourceButton) && (
                                <hr className="my-1 border-gray-200" />
                            )}

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCopyToClipboard();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                                クリップボードにコピー
                            </button>

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSaveAsPNG();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                                PNGとして保存
                            </button>

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSaveAsSVG();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                                SVGとして保存
                            </button>

                            {showExportButton && onExport && (
                                <>
                                    <hr className="my-1 border-gray-200" />

                                    <button
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!isExportDisabled) {
                                                onExport();
                                                setIsOpen(false);
                                            }
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className={`flex items-center w-full px-4 py-2 text-sm text-left transition-colors ${
                                            isExportDisabled
                                                ? 'text-gray-400 cursor-not-allowed'
                                                : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                                        }`}
                                        title={exportTooltip}
                                        disabled={isExportDisabled}
                                        type="button"
                                    >
                                        <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                                        ダッシュボードにエクスポート
                                    </button>
                                </>
                            )}

                            {showRemoveButton && onRemove && (
                                <>
                                    <hr className="my-1 border-gray-200" />

                                    <button
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            onRemove();
                                            setIsOpen(false);
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className="flex items-center w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                        type="button"
                                    >
                                        <TrashIcon className="w-4 h-4 mr-2" />
                                        グラフを削除
                                    </button>
                                </>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
