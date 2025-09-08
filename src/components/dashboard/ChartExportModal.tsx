import { useState, useEffect } from 'react';
import { XMarkIcon, PresentationChartBarIcon } from '@heroicons/react/24/outline';
import type { Dashboard } from '../../store/remoteAtoms';

interface ChartExportModalProps {
    isOpen: boolean;
    onClose: () => void;
    dashboards: Dashboard[];
    onExport: (dashboardId: string) => void;
    chartTitle?: string;
    lastSelectedDashboard?: string | null;
}

export function ChartExportModal({
    isOpen,
    onClose,
    dashboards,
    onExport,
    chartTitle = 'Chart',
    lastSelectedDashboard
}: ChartExportModalProps) {
    const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(lastSelectedDashboard || null);

    // Update selected dashboard when modal opens or lastSelectedDashboard changes
    useEffect(() => {
        if (isOpen && lastSelectedDashboard && dashboards.some(d => d.id === lastSelectedDashboard)) {
            setSelectedDashboardId(lastSelectedDashboard);
        }
    }, [isOpen, lastSelectedDashboard, dashboards]);

    const handleExport = () => {
        if (selectedDashboardId) {
            onExport(selectedDashboardId);
            onClose();
            // Don't reset selectedDashboardId - keep it for next time
        }
    };

    const handleClose = () => {
        onClose();
        // Don't reset selectedDashboardId - keep it for next time
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                {/* Header */}
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-medium text-gray-900">
                        Export "{chartTitle}" to Dashboard
                    </h3>
                    <button
                        onClick={handleClose}
                        className="text-gray-400 hover:text-gray-500 transition-colors"
                    >
                        <XMarkIcon className="w-5 h-5" />
                    </button>
                </div>

                {/* Dashboard List */}
                <div className="space-y-2 mb-6">
                    <p className="text-sm text-gray-600 mb-3">
                        Select a dashboard to export this chart to:
                    </p>
                    
                    {dashboards.length === 0 ? (
                        <div className="text-center py-8 text-gray-500">
                            <PresentationChartBarIcon className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                            <p>No dashboards available.</p>
                            <p className="text-sm mt-1">Create a dashboard first to export charts.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                            {dashboards.map((dashboard) => (
                                <div
                                    key={dashboard.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                        selectedDashboardId === dashboard.id
                                            ? 'bg-blue-50 border-blue-200 text-blue-700'
                                            : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                                    }`}
                                    onClick={() => setSelectedDashboardId(dashboard.id)}
                                >
                                    <div className={`p-2 rounded ${
                                        selectedDashboardId === dashboard.id
                                            ? 'bg-blue-100'
                                            : 'bg-white'
                                    }`}>
                                        <PresentationChartBarIcon className={`w-5 h-5 ${
                                            selectedDashboardId === dashboard.id
                                                ? 'text-blue-600'
                                                : 'text-gray-500'
                                        }`} />
                                    </div>
                                    <div className="flex-1">
                                        <h4 className="font-medium">{dashboard.title}</h4>
                                        <p className="text-xs text-gray-500">
                                            {dashboard.visualizations.length} visualizations • 
                                            Created {dashboard.createdAt.toLocaleDateString()}
                                        </p>
                                    </div>
                                    {selectedDashboardId === dashboard.id && (
                                        <div className="w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                                            <div className="w-2 h-2 bg-white rounded-full"></div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 justify-end">
                    <button
                        onClick={handleClose}
                        className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleExport}
                        disabled={!selectedDashboardId}
                        className={`px-4 py-2 text-white rounded transition-colors ${
                            selectedDashboardId
                                ? 'bg-blue-500 hover:bg-blue-600'
                                : 'bg-gray-400 cursor-not-allowed'
                        }`}
                    >
                        Export Chart
                    </button>
                </div>
            </div>
        </div>
    );
}