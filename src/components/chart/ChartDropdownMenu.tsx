import {
    CogIcon,
    ArrowDownTrayIcon,
    ArrowUpTrayIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CodeBracketIcon,
} from '@heroicons/react/24/outline';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { View } from 'vega';
import { DropdownMenu, type DropdownMenuItem } from '../common/DropdownMenu';

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
}: ChartDropdownMenuProps) {
    const handleCopyToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
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
                return;
            }

            alert('Chart not found. Please ensure the chart is fully rendered and try again.');
        } catch (err) {
            console.error('Error copying chart:', err);
            alert(`Failed to copy chart to clipboard: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
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
            return;
        }

        // If canvas not found
        alert('PNG export is only available for canvas-rendered charts. Please use "Save as SVG" instead.');
    };

    const handleSaveAsSVG = async () => {
        if (!vegaView) {
            alert('Chart not ready. Please try again in a moment.');
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
    };

    const hasConfigSection =
        (showConfigButton && onConfigOpen && dbContext && schema) ||
        (showDataSourceButton && onDataSourceOpen) ||
        (showJsonSourceButton && onJsonSourceOpen);

    const menuItems: DropdownMenuItem[] = [
        ...(showConfigButton && onConfigOpen && dbContext && schema
            ? [
                  {
                      title: 'グラフスタイルを編集',
                      icon: <CogIcon className="w-4 h-4" />,
                      onClick: onConfigOpen,
                  } as DropdownMenuItem,
              ]
            : []),
        ...(showDataSourceButton && onDataSourceOpen
            ? [
                  {
                      title: 'データソースを編集',
                      icon: <CodeBracketIcon className="w-4 h-4" />,
                      onClick: onDataSourceOpen,
                  } as DropdownMenuItem,
              ]
            : []),
        ...(showJsonSourceButton && onJsonSourceOpen
            ? [
                  {
                      title: 'グラフ仕様を表示',
                      icon: <CodeBracketIcon className="w-4 h-4" />,
                      onClick: onJsonSourceOpen,
                  } as DropdownMenuItem,
              ]
            : []),
        {
            title: 'クリップボードにコピー',
            icon: <ClipboardDocumentIcon className="w-4 h-4" />,
            onClick: handleCopyToClipboard,
            divider: hasConfigSection ? 'before' : undefined,
        },
        {
            title: 'PNGとして保存',
            icon: <ArrowDownTrayIcon className="w-4 h-4" />,
            onClick: handleSaveAsPNG,
        },
        {
            title: 'SVGとして保存',
            icon: <ArrowDownTrayIcon className="w-4 h-4" />,
            onClick: handleSaveAsSVG,
        },
        ...(showExportButton && onExport
            ? [
                  {
                      title: 'ダッシュボードにエクスポート',
                      icon: <ArrowUpTrayIcon className="w-4 h-4" />,
                      onClick: onExport,
                      disabled: isExportDisabled,
                      divider: 'before',
                  } as DropdownMenuItem,
              ]
            : []),
        ...(showRemoveButton && onRemove
            ? [
                  {
                      title: 'グラフを削除',
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: onRemove,
                      variant: 'danger' as const,
                      divider: 'before',
                  } as DropdownMenuItem,
              ]
            : []),
    ];

    return <DropdownMenu title="グラフオプション" items={menuItems} menuWidth="w-56" />;
}
