import { useState, useCallback } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import { ChartBarIcon, CogIcon, PuzzlePieceIcon, MapIcon } from '@heroicons/react/24/outline';
import { ChartPanel } from '../chart';
import { MapPanel } from '../map';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
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
    onUpdateDashboard: (dashboard: Dashboard) => void;
}

export function Dashboard({
    dashboard,
    dbContext,
    schemaName,
    onLayoutChange,
    onRemoveVisualization,
    onAddVisualization,
    onUpdateDashboard,
}: DashboardProps) {
    const [activeTab, setActiveTab] = useState<'charts' | 'layout' | 'plugins'>('charts');

    // Determine which visualizations are shown on dashboard
    const shownVisualizationIds = new Set(dashboard.layout.map(item => item.i));
    const shownVisualizations = dashboard.visualizations.filter(viz => shownVisualizationIds.has(viz.id));

    const handleLayoutChange = useCallback(
        (layout: Layout[]) => {
            onLayoutChange(layout);
        },
        [onLayoutChange]
    );

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
                        <button
                            onClick={() => setActiveTab('plugins')}
                            className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'plugins'
                                    ? 'border-blue-500 text-blue-600 bg-blue-50'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            <PuzzlePieceIcon className="w-4 h-4" />
                            Plugins
                        </button>
                    </div>
                </div>

                {/* Tab Content */}
                <div className="flex-1 overflow-auto p-4">
                    {activeTab === 'charts' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Available Visualizations</h3>
                            {dashboard.visualizations.map(viz => {
                                const isOnDashboard = shownVisualizationIds.has(viz.id);
                                return (
                                    <div
                                        key={viz.id}
                                        className="p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
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
                                            {isOnDashboard ? (
                                                <span className="text-xs text-green-600 font-medium flex-shrink-0">
                                                    ✓ Added
                                                </span>
                                            ) : (
                                                <button
                                                    onClick={() => onAddVisualization(viz.id)}
                                                    className="px-3 py-1 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors flex-shrink-0"
                                                    title="Add to dashboard"
                                                >
                                                    Add
                                                </button>
                                            )}
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

                    {activeTab === 'plugins' && (
                        <div className="space-y-3">
                            <h3 className="text-sm font-semibold text-gray-700">Plugin Settings</h3>
                            <p className="text-sm text-gray-500">
                                Plugins functionality will be available in future updates.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Right Side - Grid Layout */}
            <div className="flex-1 h-full overflow-auto bg-gray-50">
                <div className="p-4 h-full">
                    {shownVisualizations.length > 0 ? (
                        <ResponsiveGridLayout
                            className="layout"
                            layouts={{ lg: dashboard.layout }}
                            breakpoints={{ lg: 1200, md: 996, sm: 768, xs: 480, xxs: 0 }}
                            cols={{ lg: 12, md: 10, sm: 6, xs: 4, xxs: 2 }}
                            rowHeight={60}
                            onLayoutChange={handleLayoutChange}
                            isDraggable={true}
                            isResizable={true}
                            resizeHandles={['se', 'sw', 'ne', 'nw']}
                        >
                            {shownVisualizations.map(viz => (
                                <div
                                    key={viz.id}
                                    className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden"
                                    data-viz-id={viz.id}
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
                                            showControls={false}
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
                                <p className="text-sm text-gray-500 mb-4">Add charts from the sidebar to get started</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
