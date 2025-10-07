import { XMarkIcon } from '@heroicons/react/24/outline';
import { ChartConfigForm } from './ChartConfigForm';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';

interface ChartConfigModalProps {
    isOpen: boolean;
    onClose: () => void;
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onUpdateChart: (vizId: string, newSpec: ChartSpec) => void;
    vizId: string;
}

export function ChartConfigModal({
    isOpen,
    onClose,
    chartSpec,
    dbContext,
    schema,
    onUpdateChart,
    vizId
}: ChartConfigModalProps) {
    if (!isOpen) return null;

    const handleSpecChange = (newSpec: ChartSpec) => {
        // Auto-apply changes immediately
        onUpdateChart(vizId, newSpec);
    };

    return (
        <div className="fixed inset-0 bg-white bg-opacity-80 flex items-center justify-center z-[2000]">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl max-h-[80vh] w-full mx-4 flex flex-col">
                {/* Modal Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900">Chart Configuration</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <XMarkIcon className="w-6 h-6" />
                    </button>
                </div>

                {/* Modal Content - Configuration Panel Only */}
                <div className="flex-1 overflow-auto p-6">
                    <ChartConfigForm
                        chartSpec={chartSpec}
                        dbContext={dbContext}
                        schema={schema}
                        onSpecChange={handleSpecChange}
                        showApplyButton={false}
                        autoApplyChanges={true}
                    />
                </div>

                {/* Modal Footer */}
                <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
