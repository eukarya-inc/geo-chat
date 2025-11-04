import { useState, useCallback } from 'react';
import { PresentationChartBarIcon } from '@heroicons/react/24/outline';
import type { Dashboard } from '../../store/remoteAtoms';
import { HistoryCard } from './HistoryCard';
import { useDashboardPreview } from '../../hooks/useDashboardPreview';

interface DashboardHistoryGridProps {
    dashboards: Dashboard[];
    onSelectDashboard: (dashboardId: string) => void;
    onDeleteDashboard: (dashboardId: string) => void;
    onRenameDashboard: (dashboardId: string, newName: string) => void;
    onCreateDashboard: () => void;
}

export function DashboardHistoryGrid({
    dashboards,
    onSelectDashboard,
    onDeleteDashboard,
    onRenameDashboard,
    onCreateDashboard,
}: DashboardHistoryGridProps) {
    const [editingDashboardId, setEditingDashboardId] = useState<string | null>(null);
    const [deletingDashboardId, setDeletingDashboardId] = useState<string | null>(null);
    const { getPreview } = useDashboardPreview();

    const handleStartEdit = useCallback((dashboardId: string) => {
        setEditingDashboardId(dashboardId);
        setDeletingDashboardId(null);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setEditingDashboardId(null);
        setDeletingDashboardId(null);
    }, []);

    const handleRename = useCallback(
        (dashboardId: string, newTitle: string) => {
            onRenameDashboard(dashboardId, newTitle);
            setEditingDashboardId(null);
        },
        [onRenameDashboard]
    );

    const handleStartDelete = useCallback((dashboardId: string) => {
        setDeletingDashboardId(dashboardId);
        setEditingDashboardId(null);
    }, []);

    const handleConfirmDelete = useCallback(
        (dashboardId: string) => {
            onDeleteDashboard(dashboardId);
            setDeletingDashboardId(null);
        },
        [onDeleteDashboard]
    );

    return (
        <div className="p-6 h-full overflow-y-auto bg-gray-50">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">ダッシュボード</h1>
                <button
                    onClick={onCreateDashboard}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                    + 新しいダッシュボード
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboards.map(dashboard => (
                    <HistoryCard
                        key={dashboard.id}
                        title={dashboard.title}
                        date={dashboard.createdAt}
                        previewImage={getPreview(dashboard.id)}
                        onClick={() => onSelectDashboard(dashboard.id)}
                        onStartDelete={() => handleStartDelete(dashboard.id)}
                        onConfirmDelete={() => handleConfirmDelete(dashboard.id)}
                        onRename={newTitle => handleRename(dashboard.id, newTitle)}
                        isEditing={editingDashboardId === dashboard.id}
                        isDeleting={deletingDashboardId === dashboard.id}
                        onStartEdit={() => handleStartEdit(dashboard.id)}
                        onCancelEdit={handleCancelEdit}
                    />
                ))}
            </div>

            {dashboards.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                    <PresentationChartBarIcon className="w-24 h-24 mb-4" />
                    <p className="text-lg">ダッシュボードがありません</p>
                    <p className="text-sm mt-2">最初のダッシュボードを作成しましょう！</p>
                </div>
            )}
        </div>
    );
}
