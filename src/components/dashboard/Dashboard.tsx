import { useState, useCallback, useEffect, useRef } from 'react';
import ReactGridLayout, { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { ChartBarIcon, CogIcon, EllipsisVerticalIcon, TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { VisualizationGridItem } from './VisualizationGridItem';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const GridLayout = WidthProvider(ReactGridLayout);
const ResponsiveGridLayout = WidthProvider(Responsive);

/**
 * Helper function to detect newly added visualization IDs.
 * Extracted to follow project's "aggressively split" principle.
 */
function detectNewlyAddedIds(prevLayout: Layout[], currentLayout: Layout[]): string[] {
    const prevIds = new Set(prevLayout.map(item => item.i));
    const currentIds = new Set(currentLayout.map(item => item.i));
    return Array.from(currentIds).filter(id => !prevIds.has(id));
}

// Re-export for backward compatibility, but use the one from remoteAtoms
export type DashboardVisualization = DashboardVisualizationType;

export interface Dashboard {
    id: string;
    title: string;
    createdAt: Date;
    visualizations: DashboardVisualization[];
    layout: Layout[];
    responsive?: boolean;
}

interface DashboardProps {
    dashboard: Dashboard;
    dbContext: DBContext;
    onLayoutChange: (layout: Layout[]) => void;
    onRemoveVisualization: (vizId: string) => void;
    onAddVisualization: (vizId: string) => void;
    onDeleteVisualization: (vizId: string) => void;
    onUpdateDashboard: (dashboard: Dashboard) => void;
}

export function Dashboard({
    dashboard,
    dbContext,
    onLayoutChange,
    onRemoveVisualization,
    onAddVisualization,
    onDeleteVisualization,
    onUpdateDashboard,
}: DashboardProps) {
    const [activeTab, setActiveTab] = useState<'charts' | 'layout'>('charts');
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(dashboard.title);
    const [newlyAddedIds, setNewlyAddedIds] = useState<Set<string>>(new Set());
    const titleInputRef = useRef<HTMLInputElement>(null);
    const prevDashboardIdRef = useRef<string>(dashboard.id);
    const prevLayoutRef = useRef<Layout[]>(dashboard.layout);

    // Determine which visualizations are shown on dashboard
    const shownVisualizationIds = new Set(dashboard.layout.map(item => item.i));
    const shownVisualizations = dashboard.visualizations.filter(viz => shownVisualizationIds.has(viz.id));

    // Detect newly added visualizations and trigger animation
    useEffect(() => {
        // If dashboard changed, reset refs without animation
        if (prevDashboardIdRef.current !== dashboard.id) {
            prevDashboardIdRef.current = dashboard.id;
            prevLayoutRef.current = dashboard.layout;
            return;
        }

        // Detect newly added items using helper function
        const newIds = detectNewlyAddedIds(prevLayoutRef.current, dashboard.layout);
        prevLayoutRef.current = dashboard.layout;

        if (newIds.length > 0) {
            setNewlyAddedIds(new Set(newIds));

            // Clear animation after 400ms (animation duration)
            const timer = setTimeout(() => {
                setNewlyAddedIds(new Set());
            }, 400);

            return () => clearTimeout(timer);
        }
    }, [dashboard.layout, dashboard.id]);

    const handleLayoutChange = useCallback(
        (layout: Layout[]) => {
            onLayoutChange(layout);
        },
        [onLayoutChange]
    );

    const handleResponsiveLayoutChange = useCallback(
        (layout: Layout[]) => {
            // For responsive mode, save the current breakpoint's layout
            onLayoutChange(layout);
        },
        [onLayoutChange]
    );

    const handleToggleResponsive = useCallback(() => {
        onUpdateDashboard({
            ...dashboard,
            responsive: !dashboard.responsive,
        });
    }, [dashboard, onUpdateDashboard]);

    const handleResizeStop = useCallback(() => {
        // Dispatch resize event to trigger chart resize
        window.dispatchEvent(new Event('resize'));
    }, []);

    const handleRemoveVisualization = useCallback(
        (vizId: string) => {
            onRemoveVisualization(vizId);
        },
        [onRemoveVisualization]
    );

    const handleUpdateChart = useCallback(
        (vizId: string, newSpec: ChartSpec) => {
            const updatedDashboard = {
                ...dashboard,
                visualizations: dashboard.visualizations.map(viz =>
                    viz.id === vizId ? { ...viz, chartSpec: newSpec, title: newSpec.title || viz.title } : viz
                ),
            };
            onUpdateDashboard(updatedDashboard);
        },
        [dashboard, onUpdateDashboard]
    );

    const handleUpdateTitle = useCallback(
        (vizId: string, newTitle: string) => {
            const updatedDashboard = {
                ...dashboard,
                visualizations: dashboard.visualizations.map(viz =>
                    viz.id === vizId ? { ...viz, title: newTitle } : viz
                ),
            };
            onUpdateDashboard(updatedDashboard);
        },
        [dashboard, onUpdateDashboard]
    );

    const handleDeleteVisualization = useCallback((vizId: string) => {
        // Close dropdown and show confirmation
        setOpenDropdownId(null);
        setDeleteConfirmId(vizId);
    }, []);

    const confirmDelete = useCallback(
        (vizId: string) => {
            onDeleteVisualization(vizId);
            setDeleteConfirmId(null);
        },
        [onDeleteVisualization]
    );

    const cancelDelete = useCallback(() => {
        setDeleteConfirmId(null);
    }, []);

    const toggleDropdown = useCallback((vizId: string) => {
        setOpenDropdownId(prev => (prev === vizId ? null : vizId));
    }, []);

    const closeDropdown = useCallback(() => {
        setOpenDropdownId(null);
    }, []);

    const handleStartEditingTitle = useCallback(() => {
        setIsEditingTitle(true);
        setEditedTitle(dashboard.title);
    }, [dashboard.title]);

    const handleSaveTitle = useCallback(() => {
        const trimmedTitle = editedTitle.trim();
        if (trimmedTitle && trimmedTitle !== dashboard.title) {
            onUpdateDashboard({
                ...dashboard,
                title: trimmedTitle,
            });
        }
        setIsEditingTitle(false);
    }, [editedTitle, dashboard, onUpdateDashboard]);

    const handleCancelEditingTitle = useCallback(() => {
        setIsEditingTitle(false);
        setEditedTitle(dashboard.title);
    }, [dashboard.title]);

    const handleTitleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                handleSaveTitle();
            } else if (e.key === 'Escape') {
                handleCancelEditingTitle();
            }
        },
        [handleSaveTitle, handleCancelEditingTitle]
    );

    // Focus input when editing starts
    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    // Trigger resize event after dashboard mount and when visualizations change
    // This ensures Vega charts recalculate their size correctly
    useEffect(() => {
        // Use setTimeout to ensure grid layout has finished rendering
        const timerId = setTimeout(() => {
            window.dispatchEvent(new Event('resize'));
        }, 100);

        return () => {
            clearTimeout(timerId);
        };
    }, [shownVisualizations.length]);

    return (
        <div className="flex h-full" data-dashboard-id={dashboard.id}>
            {/* Left Sidebar with Tabs */}
            <div className="w-80 h-full border-r border-gray-300 bg-gray-50 flex flex-col">
                {/* Tab Navigation */}
                <div className="flex-shrink-0 border-b border-gray-200 bg-white">
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('charts')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'charts'
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <ChartBarIcon className="w-4 h-4" />
                            Visualizations
                        </button>
                        <button
                            onClick={() => setActiveTab('layout')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'layout'
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <CogIcon className="w-4 h-4" />
                            Layout
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto p-4">
                    {activeTab === 'charts' && (
                        <div className="space-y-3">
                            {dashboard.visualizations.map(viz => {
                                const isOnDashboard = shownVisualizationIds.has(viz.id);
                                const isDropdownOpen = openDropdownId === viz.id;
                                return (
                                    <div
                                        key={viz.id}
                                        className="p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors relative"
                                    >
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h4 className="text-sm font-medium text-gray-900 truncate">
                                                        {viz.title || 'Untitled Visualization'}
                                                    </h4>
                                                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 flex-shrink-0">
                                                        {viz.type}
                                                    </span>
                                                </div>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    Created: {viz.createdAt?.toLocaleDateString() || 'Unknown'}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                {isOnDashboard ? (
                                                    <span className="text-xs text-green-600 font-medium">✓ Added</span>
                                                ) : (
                                                    <button
                                                        onClick={() => onAddVisualization(viz.id)}
                                                        className="px-3 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
                                                        title="Add to dashboard"
                                                    >
                                                        Add
                                                    </button>
                                                )}

                                                {/* Options dropdown */}
                                                <div className="relative">
                                                    <button
                                                        onClick={() => toggleDropdown(viz.id)}
                                                        className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
                                                        title="Options"
                                                    >
                                                        <EllipsisVerticalIcon className="w-4 h-4" />
                                                    </button>

                                                    {isDropdownOpen && (
                                                        <>
                                                            {/* Backdrop to close dropdown */}
                                                            <div
                                                                className="fixed inset-0 z-10"
                                                                onClick={closeDropdown}
                                                            />

                                                            {/* Dropdown menu */}
                                                            <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-gray-200 rounded-md shadow-lg z-20">
                                                                <button
                                                                    onClick={() => handleDeleteVisualization(viz.id)}
                                                                    className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 transition-colors"
                                                                >
                                                                    <TrashIcon className="w-4 h-4" />
                                                                    Delete
                                                                </button>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                            {dashboard.visualizations.length === 0 && (
                                <p className="text-sm text-gray-500 text-center py-8">
                                    No visualizations available. Export charts or maps from chat to add them here.
                                </p>
                            )}
                        </div>
                    )}

                    {activeTab === 'layout' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Layout Settings</h3>
                            <div className="space-y-2">
                                <div className="p-3 bg-white border border-gray-200 rounded">
                                    <label className="flex items-center justify-between cursor-pointer">
                                        <div>
                                            <div className="text-xs font-medium text-gray-600">Responsive Mode</div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Adjust layout based on screen size
                                            </p>
                                        </div>
                                        <input
                                            type="checkbox"
                                            checked={dashboard.responsive ?? false}
                                            onChange={handleToggleResponsive}
                                            className="w-4 h-4 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                                        />
                                    </label>
                                </div>
                                <div className="p-3 bg-white border border-gray-200 rounded">
                                    <label className="text-xs font-medium text-gray-600">Grid Columns</label>
                                    <p className="text-sm text-gray-500">12 columns (default)</p>
                                </div>
                                <div className="p-3 bg-white border border-gray-200 rounded">
                                    <label className="text-xs font-medium text-gray-600">Row Height</label>
                                    <p className="text-sm text-gray-500">60px (default)</p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Side - Grid Layout */}
            <div className="flex-1 h-full flex flex-col bg-gray-50">
                {/* Dashboard Title Header */}
                <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-200">
                    {isEditingTitle ? (
                        <div className="flex items-center gap-2">
                            <input
                                ref={titleInputRef}
                                type="text"
                                value={editedTitle}
                                onChange={e => setEditedTitle(e.target.value)}
                                onKeyDown={handleTitleKeyDown}
                                onBlur={handleSaveTitle}
                                className="flex-1 text-2xl font-bold text-gray-900 border-b-2 border-blue-500 focus:outline-none bg-transparent"
                                placeholder="Dashboard name"
                            />
                        </div>
                    ) : (
                        <div className="flex items-center gap-3 group">
                            <h1 className="text-2xl font-bold text-gray-900">{dashboard.title}</h1>
                            <button
                                onClick={handleStartEditingTitle}
                                className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors opacity-0 group-hover:opacity-100"
                                title="Edit dashboard name"
                            >
                                <PencilIcon className="w-5 h-5" />
                            </button>
                        </div>
                    )}
                </div>

                {/* Grid Layout Area */}
                <div className="flex-1 overflow-auto p-4">
                    {shownVisualizations.length > 0 ? (
                        dashboard.responsive ? (
                            <ResponsiveGridLayout
                                className="layout"
                                layouts={{ lg: dashboard.layout }}
                                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                                rowHeight={60}
                                onLayoutChange={handleResponsiveLayoutChange}
                                onResizeStop={handleResizeStop}
                                isDraggable={true}
                                isResizable={true}
                                resizeHandles={['se', 'sw', 'ne', 'nw']}
                                draggableCancel="button"
                            >
                                {shownVisualizations.map(viz => (
                                    <div
                                        key={viz.id}
                                        className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ${newlyAddedIds.has(viz.id) ? 'animate-fadeInScale' : ''}`}
                                        data-viz-id={viz.id}
                                        style={{ height: '100%' }}
                                    >
                                        <VisualizationGridItem
                                            viz={viz}
                                            dbContext={dbContext}
                                            chatId={viz.chatId}
                                            onRemove={handleRemoveVisualization}
                                            onUpdateChart={handleUpdateChart}
                                            onUpdateTitle={handleUpdateTitle}
                                        />
                                    </div>
                                ))}
                            </ResponsiveGridLayout>
                        ) : (
                            <GridLayout
                                className="layout"
                                layout={dashboard.layout}
                                cols={12}
                                rowHeight={60}
                                onLayoutChange={handleLayoutChange}
                                onResizeStop={handleResizeStop}
                                isDraggable={true}
                                isResizable={true}
                                resizeHandles={['se', 'sw', 'ne', 'nw']}
                                draggableCancel="button"
                            >
                                {shownVisualizations.map(viz => (
                                    <div
                                        key={viz.id}
                                        className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ${newlyAddedIds.has(viz.id) ? 'animate-fadeInScale' : ''}`}
                                        data-viz-id={viz.id}
                                        style={{ height: '100%' }}
                                    >
                                        <VisualizationGridItem
                                            viz={viz}
                                            dbContext={dbContext}
                                            chatId={viz.chatId}
                                            onRemove={handleRemoveVisualization}
                                            onUpdateChart={handleUpdateChart}
                                            onUpdateTitle={handleUpdateTitle}
                                        />
                                    </div>
                                ))}
                            </GridLayout>
                        )
                    ) : (
                        <div className="h-full flex items-center justify-center">
                            <div className="text-center">
                                <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                <h3 className="text-lg font-medium text-gray-900 mb-2">Empty Dashboard</h3>
                                <p className="text-sm text-gray-500 mb-4">Add charts from the sidebar to get started</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="flex-shrink-0 w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                                <TrashIcon className="w-5 h-5 text-red-600" />
                            </div>
                            <div>
                                <h3 className="text-lg font-medium text-gray-900">Visualizationを削除</h3>
                                <p className="text-sm text-gray-500 mt-1">
                                    このVisualizationを削除してもよろしいですか？この操作は取り消すことができません。
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={cancelDelete}
                                className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                            >
                                キャンセル
                            </button>
                            <button
                                onClick={() => confirmDelete(deleteConfirmId)}
                                className="px-4 py-2 text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                            >
                                削除
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
