import { useState, useCallback } from 'react';
import type { Dashboard } from '../../store/remoteAtoms';
import { HistoryCard } from './HistoryCard';

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
                <h1 className="text-2xl font-bold">Dashboard List</h1>
                <button
                    onClick={onCreateDashboard}
                    className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors"
                >
                    + New dashboard
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {dashboards.map(dashboard => (
                    <HistoryCard
                        key={dashboard.id}
                        title={dashboard.title}
                        date={dashboard.createdAt}
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
                <div className="text-center text-gray-500 mt-12">
                    <p>No dashboards found. Create your first dashboard!</p>
                </div>
            )}
        </div>
    );
}
