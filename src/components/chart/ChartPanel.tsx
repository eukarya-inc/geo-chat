import { useState } from 'react';
import { createPortal } from 'react-dom';
import { XMarkIcon } from '@heroicons/react/24/outline';
import VegaLiteChart from './VegaLiteChart';
import { ChartConfigForm } from './ChartConfigForm';
import { ChartDropdownMenu } from './ChartDropdownMenu';
import { ChartConfigModal } from './ChartConfigModal';
import { DataSourceModal } from './DataSourceModal';
import { ChartSpecModal } from './ChartSpecModal';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { View } from 'vega';
import { VisualizationHeader } from '../common/VisualizationHeader';
import { createCopyButton, createExportButton, createStyleEditorButton } from '../common/VisualizationToolButtons';

interface ChartPanelProps {
    chartSpec: ChartSpec;
    dbContext?: DBContext;
    schema?: string;
    configMode: 'modal' | 'panel';
    vizId?: string; // Optional vizId for modal mode
    onViewReady?: (view: View | null) => void;
    onConfigOpen?: () => void;
    onJsonSourceOpen?: () => void;
    onDataSourceOpen?: () => void;
    onRemove?: () => void;
    onSpecChange?: (newSpec: ChartSpec) => void;
    showDataSourceButton?: boolean;
    showRemoveButton?: boolean;
    // For panel mode
    showConfigPanel?: boolean;
    onCloseConfigPanel?: () => void;
    // Additional config form props
    autoApplyChanges?: boolean;
    showApplyButton?: boolean;
    // Menu export button
    showMenuExportButton?: boolean;
    onExport?: () => void;
    isExportDisabled?: boolean;
    exportTooltip?: string;
}

export function ChartPanel({
    chartSpec,
    dbContext,
    schema,
    configMode,
    vizId,
    onViewReady,
    onConfigOpen,
    onJsonSourceOpen,
    onDataSourceOpen,
    onRemove,
    onSpecChange,
    showDataSourceButton = false,
    showRemoveButton = true,
    showConfigPanel = false,
    onCloseConfigPanel,
    autoApplyChanges = true,
    showApplyButton = false,
    showMenuExportButton = true,
    onExport,
    isExportDisabled = false,
    exportTooltip,
}: ChartPanelProps) {
    const [vegaViewRef, setVegaViewRef] = useState<View | null>(null);

    // Modal states for modal mode
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isDataSourceModalOpen, setIsDataSourceModalOpen] = useState(false);
    const [isChartSpecModalOpen, setIsChartSpecModalOpen] = useState(false);

    const handleViewReady = (view: View | null) => {
        setVegaViewRef(view);
        onViewReady?.(view);
    };

    const handleCopyToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
                return;
            }

            // Try canvas (PNG) first
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

    // Handle modal opening - use internal state for modal mode, callback for panel mode
    const handleConfigOpen = () => {
        if (configMode === 'modal') {
            setIsConfigModalOpen(true);
        } else {
            onConfigOpen?.();
        }
    };

    const handleDataSourceOpen = () => {
        if (configMode === 'modal') {
            setIsDataSourceModalOpen(true);
        } else {
            onDataSourceOpen?.();
        }
    };

    const handleJsonSourceOpen = () => {
        if (configMode === 'modal') {
            setIsChartSpecModalOpen(true);
        } else {
            onJsonSourceOpen?.();
        }
    };

    const toolButtons = [
        ...((configMode === 'modal' && dbContext && schema) || (onConfigOpen && dbContext && schema)
            ? [
                  createStyleEditorButton({
                      onOpenStyleEditor: handleConfigOpen,
                      type: 'chart',
                  }),
              ]
            : []),
        createCopyButton({ onCopy: handleCopyToClipboard }),
        ...(showMenuExportButton && onExport
            ? [
                  createExportButton({
                      onExport: () => {
                          if (!isExportDisabled) {
                              onExport();
                          }
                      },
                      disabled: isExportDisabled,
                      tooltip: exportTooltip,
                  }),
              ]
            : []),
    ];

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Chart Display Area */}
            <div
                className={`${configMode === 'panel' && showConfigPanel ? 'flex-1' : 'flex-1'} flex flex-col overflow-hidden`}
            >
                {/* Chart Title Bar with Menu */}
                <VisualizationHeader
                    title={chartSpec.title || 'Chart'}
                    toolButtons={toolButtons}
                    menu={
                        <ChartDropdownMenu
                            chartSpec={chartSpec}
                            vegaView={vegaViewRef}
                            dbContext={dbContext}
                            schema={schema}
                            onConfigOpen={handleConfigOpen}
                            onDataSourceOpen={handleDataSourceOpen}
                            onJsonSourceOpen={handleJsonSourceOpen}
                            onRemove={onRemove}
                            onExport={onExport}
                            showDataSourceButton={showDataSourceButton}
                            showRemoveButton={showRemoveButton}
                            showExportButton={showMenuExportButton}
                            isExportDisabled={isExportDisabled}
                        />
                    }
                />

                {/* Chart Content */}
                <div className="flex-1 overflow-auto p-4">
                    <VegaLiteChart
                        spec={chartSpec.spec}
                        dbContext={dbContext}
                        schema={schema}
                        showHeader={false}
                        enableActions={false}
                        onViewReady={handleViewReady}
                    />
                </div>
            </div>

            {/* Configuration Panel - Only for panel mode */}
            {configMode === 'panel' && showConfigPanel && onCloseConfigPanel && (
                <div className="border-t border-gray-200 bg-white" style={{ height: '280px' }}>
                    {/* Configuration Panel Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50">
                        <h5 className="text-sm font-medium text-gray-900">Chart Configuration</h5>
                        <button
                            onClick={onCloseConfigPanel}
                            className="p-1 text-gray-500 hover:text-gray-700 transition-colors rounded-md hover:bg-gray-200"
                            title="Close configuration panel"
                            type="button"
                        >
                            <XMarkIcon className="w-5 h-5" />
                        </button>
                    </div>
                    <div className="overflow-auto p-3" style={{ height: 'calc(100% - 41px)' }}>
                        {dbContext && schema && onSpecChange && (
                            <ChartConfigForm
                                chartSpec={chartSpec}
                                dbContext={dbContext}
                                schema={schema}
                                onSpecChange={onSpecChange}
                                autoApplyChanges={autoApplyChanges}
                                showApplyButton={showApplyButton}
                            />
                        )}
                    </div>
                </div>
            )}

            {/* Modals - Only for modal mode */}
            {configMode === 'modal' && dbContext && schema && onSpecChange && (
                <>
                    {/* Configuration Modal */}
                    {createPortal(
                        <ChartConfigModal
                            isOpen={isConfigModalOpen}
                            onClose={() => setIsConfigModalOpen(false)}
                            chartSpec={chartSpec}
                            dbContext={dbContext}
                            schema={schema}
                            vizId={vizId || 'chart'}
                            onUpdateChart={(_vizId: string, newSpec: ChartSpec) => onSpecChange(newSpec)}
                        />,
                        document.body
                    )}

                    {/* Data Source Modal */}
                    {createPortal(
                        <DataSourceModal
                            isOpen={isDataSourceModalOpen}
                            onClose={() => setIsDataSourceModalOpen(false)}
                            chartSpec={chartSpec}
                            onUpdateChart={onSpecChange}
                        />,
                        document.body
                    )}

                    {/* Chart Spec Modal */}
                    {createPortal(
                        <ChartSpecModal
                            isOpen={isChartSpecModalOpen}
                            onClose={() => setIsChartSpecModalOpen(false)}
                            chartSpec={chartSpec.spec}
                            vegaView={vegaViewRef}
                            onApply={newSpec => onSpecChange({ ...chartSpec, spec: newSpec })}
                        />,
                        document.body
                    )}
                </>
            )}
        </div>
    );
}
