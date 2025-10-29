import { useState, useCallback } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import {
    ChartBarIcon,
    CogIcon,
    MapIcon,
    EllipsisVerticalIcon,
    TrashIcon,
    ArrowDownTrayIcon,
} from '@heroicons/react/24/outline';
import { ChartPanel } from '../chart';
import { MapPanel } from '../map';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
import {
    getMapLibreCanvas,
    forceMapRepaint,
    calculateDashboardDimensions,
    createManualComposite,
    createOnCloneHandler,
    createHtml2CanvasOptions,
    downloadCanvasAsPNG,
    hasMapContent,
} from '../../utils/dashboardExport';
import html2canvas from 'html2canvas';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

// Re-export for backward compatibility, but use the one from remoteAtoms
export type DashboardVisualization = DashboardVisualizationType;

export interface Dashboard {
    id: string;
    title: string;
    createdAt: Date;
    visualizations: DashboardVisualization[];
    layout: Layout[];
}

interface DashboardProps {
    dashboard: Dashboard;
    dbContext: DBContext;
    schemaName: string;
    onLayoutChange: (layout: Layout[]) => void;
    onRemoveVisualization: (vizId: string) => void;
    onAddVisualization: (vizId: string) => void;
    onDeleteVisualization: (vizId: string) => void;
    onUpdateDashboard: (dashboard: Dashboard) => void;
}

export function Dashboard({
    dashboard,
    dbContext,
    schemaName,
    onLayoutChange,
    onRemoveVisualization,
    onAddVisualization,
    onDeleteVisualization,
    onUpdateDashboard,
}: DashboardProps) {
    const [activeTab, setActiveTab] = useState<'charts' | 'layout'>('charts');
    const [openDropdownId, setOpenDropdownId] = useState<string | null>(null);
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [showMenuDropdown, setShowMenuDropdown] = useState(false);

    // Determine which visualizations are shown on dashboard
    const shownVisualizationIds = new Set(dashboard.layout.map(item => item.i));
    const shownVisualizations = dashboard.visualizations.filter(viz => shownVisualizationIds.has(viz.id));

    const handleLayoutChange = useCallback(
        (layout: Layout[]) => {
            onLayoutChange(layout);
        },
        [onLayoutChange]
    );

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

    const handleSaveAsPNG = useCallback(async () => {
        // Close the dropdown first
        setShowMenuDropdown(false);

        const gridElement = document.querySelector('.dashboard-grid-container');
        if (!gridElement) {
            alert('ダッシュボードの内容が見つかりません。');
            return;
        }

        // Find canvas elements within the dashboard
        const canvasElements = gridElement.querySelectorAll('canvas, .maplibregl-canvas');
        console.log('Found canvas elements:', canvasElements.length);

        // Check if dashboard has map content
        const hasMapContentFlag = hasMapContent(gridElement);

        if (hasMapContentFlag) {
            try {
                console.log('Processing dashboard with map content...');

                // Get MapLibre GL canvas and force repaint
                const mapCanvas = await getMapLibreCanvas(gridElement);
                await forceMapRepaint(gridElement);

                // Calculate dashboard dimensions
                const dimensions = calculateDashboardDimensions(gridElement);
                console.log('Dashboard dimensions:', dimensions);

                // Try manual composite approach first if we have both maps and charts
                if (mapCanvas && canvasElements.length > 0) {
                    const compositeSuccess = await createManualComposite(
                        gridElement,
                        mapCanvas,
                        dimensions.fullWidth,
                        dimensions.fullHeight,
                        dashboard.title || 'dashboard'
                    );

                    if (compositeSuccess) return;
                }

                // Fallback to html2canvas with enhanced map handling
                console.log('Using html2canvas with enhanced map handling...');
                const oncloneHandler = mapCanvas ? createOnCloneHandler(mapCanvas) : undefined;
                const html2canvasOptions = createHtml2CanvasOptions(
                    dimensions.fullWidth,
                    dimensions.fullHeight,
                    oncloneHandler
                );

                const canvas = await html2canvas(gridElement as HTMLElement, html2canvasOptions);
                downloadCanvasAsPNG(canvas, `${dashboard.title || 'dashboard'}.png`);
            } catch (error) {
                console.error('Dashboard export with maps failed:', error);
                alert('ダッシュボードの出力に失敗しました。再試行してください。');
            }
        } else if (canvasElements.length > 0) {
            // Handle charts-only dashboard
            try {
                const dimensions = calculateDashboardDimensions(gridElement);
                const html2canvasOptions = createHtml2CanvasOptions(dimensions.fullWidth, dimensions.fullHeight);

                const canvas = await html2canvas(gridElement as HTMLElement, html2canvasOptions);
                downloadCanvasAsPNG(canvas, `${dashboard.title || 'dashboard'}.png`);
            } catch (error) {
                console.error('Charts-only dashboard export failed:', error);
                alert('ダッシュボードの出力に失敗しました。再試行してください。');
            }
        } else {
            alert('ダッシュボードにチャートまたはマップが見つかりません。コンテンツを追加してから再試行してください。');
        }
    }, [dashboard.title, setShowMenuDropdown]);

    return (
        <div className="flex h-full">
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

            {/* Right Side - Dashboard with Header */}
            <div className="flex-1 h-full overflow-hidden flex flex-col">
                {/* Dashboard Header */}
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-white border-b border-gray-200">
                    <div className="flex items-center gap-4">
                        <h1 className="text-lg font-medium text-gray-900">{dashboard.title}</h1>
                    </div>

                    <div className="flex items-center gap-3">
                        {/* Menu Dropdown */}
                        <div className="relative">
                            <button
                                onClick={() => setShowMenuDropdown(!showMenuDropdown)}
                                className="p-2 text-gray-600 hover:bg-gray-100 rounded-md transition-colors cursor-pointer"
                                title="Options"
                            >
                                <EllipsisVerticalIcon className="w-4 h-4" />
                            </button>

                            {showMenuDropdown && (
                                <>
                                    {/* Backdrop to close dropdown */}
                                    <div className="fixed inset-0 z-10" onClick={() => setShowMenuDropdown(false)} />

                                    {/* Dropdown menu */}
                                    <div className="absolute right-0 top-full mt-1 w-56 bg-white border border-gray-200 rounded-md shadow-lg z-20">
                                        <button
                                            onClick={handleSaveAsPNG}
                                            className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer"
                                        >
                                            <ArrowDownTrayIcon className="w-4 h-4" />
                                            PNGとして保存
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                </div>

                {/* Grid Layout Area */}
                <div className="flex-1 h-full overflow-auto bg-gray-50 dashboard-grid-container">
                    <div className="p-4 h-full">
                        {shownVisualizations.length > 0 ? (
                            <ResponsiveGridLayout
                                className="layout"
                                layouts={{ lg: dashboard.layout }}
                                breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                                cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
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
                                        className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
                                        data-viz-id={viz.id}
                                        style={{ height: '100%' }}
                                    >
                                        {viz.type === 'chart' && viz.chartSpec ? (
                                            <ChartPanel
                                                chartSpec={viz.chartSpec}
                                                dbContext={dbContext}
                                                schema={schemaName}
                                                configMode="modal"
                                                vizId={viz.id}
                                                onRemove={() => handleRemoveVisualization(viz.id)}
                                                onSpecChange={newSpec => handleUpdateChart(viz.id, newSpec)}
                                                showDataSourceButton={true}
                                            />
                                        ) : viz.type === 'map' && viz.tableName ? (
                                            <MapPanel
                                                title={viz.title}
                                                tableName={viz.tableName}
                                                geometryColumn={viz.geometryColumn}
                                                dbContext={dbContext}
                                                schema={schemaName}
                                                mapSpec={viz.mapSpec}
                                                onRemove={() => handleRemoveVisualization(viz.id)}
                                                vizId={viz.id}
                                            />
                                        ) : (
                                            <div className="h-full flex flex-col">
                                                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 cursor-move">
                                                    <h4 className="text-sm font-medium text-gray-900 truncate">
                                                        {viz.title}
                                                    </h4>
                                                </div>
                                                <div className="flex-1 p-2 overflow-hidden">
                                                    <div className="h-full flex items-center justify-center text-gray-500">
                                                        <div className="text-center">
                                                            <div className="mb-2">
                                                                {viz.type === 'chart' && (
                                                                    <ChartBarIcon className="w-8 h-8 mx-auto text-gray-300" />
                                                                )}
                                                                {viz.type === 'map' && (
                                                                    <MapIcon className="w-8 h-8 mx-auto text-gray-300" />
                                                                )}
                                                            </div>
                                                            <p className="text-sm">
                                                                {viz.type === 'chart'
                                                                    ? 'Chart spec missing'
                                                                    : viz.type === 'map'
                                                                      ? 'Map table missing'
                                                                      : `${viz.type} visualization`}
                                                            </p>
                                                            {viz.sql && (
                                                                <p className="text-xs mt-2 font-mono bg-gray-100 p-2 rounded">
                                                                    {viz.sql}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </ResponsiveGridLayout>
                        ) : (
                            <div className="h-full flex items-center justify-center">
                                <div className="text-center">
                                    <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                                    <h3 className="text-lg font-medium text-gray-900 mb-2">Empty Dashboard</h3>
                                    <p className="text-sm text-gray-500 mb-4">
                                        Add charts from the sidebar to get started
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
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
