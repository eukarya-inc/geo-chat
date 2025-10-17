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
    // For panel mode
    showConfigPanel?: boolean;
    onCloseConfigPanel?: () => void;
    // Additional config form props
    autoApplyChanges?: boolean;
    showApplyButton?: boolean;
    showSaveButton?: boolean;
    onSave?: () => void;
    isSaveDisabled?: boolean;
    saveTooltip?: string;
    showExportButton?: boolean;
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
    showConfigPanel = false,
    onCloseConfigPanel,
    autoApplyChanges = true,
    showApplyButton = false,
    showSaveButton = true,
    onSave,
    isSaveDisabled = false,
    saveTooltip,
    showExportButton = true,
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

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Chart Display Area */}
            <div
                className={`${configMode === 'panel' && showConfigPanel ? 'flex-1' : 'flex-1'} flex flex-col overflow-hidden`}
            >
                {/* Chart Title Bar with Menu */}
                <div className="flex items-center justify-between p-3 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate">{chartSpec.title || 'Chart'}</h4>
                    <ChartDropdownMenu
                        chartSpec={chartSpec}
                        vegaView={vegaViewRef}
                        dbContext={dbContext}
                        schema={schema}
                        onConfigOpen={handleConfigOpen}
                        onDataSourceOpen={handleDataSourceOpen}
                        onJsonSourceOpen={handleJsonSourceOpen}
                        onRemove={onRemove}
                        showDataSourceButton={showDataSourceButton}
                    />
                </div>

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
                                showSaveButton={showSaveButton}
                                onSave={onSave}
                                isSaveDisabled={isSaveDisabled}
                                saveTooltip={saveTooltip}
                                showExportButton={showExportButton}
                                onExport={onExport}
                                isExportDisabled={isExportDisabled}
                                exportTooltip={exportTooltip}
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
