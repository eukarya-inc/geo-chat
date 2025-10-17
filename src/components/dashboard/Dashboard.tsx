import { useState, useCallback, useRef, useEffect } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import {
    ChartBarIcon,
    CogIcon,
    PuzzlePieceIcon,
    MapIcon,
    EllipsisVerticalIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CameraIcon,
} from '@heroicons/react/24/outline';
import { ChartPanel } from '../chart';
import Map from '../map';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface MapDropdownMenuProps {
    vizId: string;
    vizTitle: string;
    onRemove: (vizId: string) => void;
}

function MapDropdownMenu({ vizId, vizTitle, onRemove }: MapDropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleSaveMapAsImage = async () => {
        try {
            const mapContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            if (!mapContainer) {
                alert('Map not found. Please try again.');
                setIsOpen(false);
                return;
            }

            // Find the canvas element within the map container
            const canvas = mapContainer.querySelector('canvas.maplibregl-canvas, canvas.mapboxgl-canvas');
            if (canvas instanceof HTMLCanvasElement) {
                canvas.toBlob(blob => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${vizTitle.replace(/[^a-z0-9]/gi, '_') || 'map'}.png`;
                        a.click();
                        URL.revokeObjectURL(url);
                    } else {
                        alert('Failed to export map as image. Please try again.');
                    }
                }, 'image/png');
            } else {
                alert('Map canvas not found. Please ensure the map is fully loaded and try again.');
            }
        } catch (error) {
            console.error('Error exporting map:', error);
            alert('Failed to export map as image. Please try again.');
        }
        setIsOpen(false);
    };

    const handleCopyMapToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
                setIsOpen(false);
                return;
            }

            const mapContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            if (!mapContainer) {
                alert('Map not found. Please try again.');
                setIsOpen(false);
                return;
            }

            // Find the canvas element within the map container
            const canvas = mapContainer.querySelector('canvas.maplibregl-canvas, canvas.mapboxgl-canvas');
            if (canvas instanceof HTMLCanvasElement) {
                // Safari requires ClipboardItem to be created synchronously with a Promise
                const blobPromise = new Promise<Blob>((resolve, reject) => {
                    canvas.toBlob(blob => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Failed to create image from map canvas'));
                        }
                    }, 'image/png');
                });

                await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);

                alert('Map copied to clipboard!');
                setIsOpen(false);
                return;
            }

            alert('Map canvas not found. Please ensure the map is fully loaded and try again.');
        } catch (err) {
            console.error('Error copying map:', err);
            alert(`Failed to copy map to clipboard: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        setIsOpen(false);
    };

    const handleRemove = () => {
        onRemove(vizId);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                onMouseDown={e => {
                    e.stopPropagation();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer"
                title="Map options"
                type="button"
            >
                <EllipsisVerticalIcon className="w-4 h-4" />
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[1000]">
                    <div className="py-1">
                        <button
                            onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleCopyMapToClipboard();
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            type="button"
                        >
                            <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                            Copy to Clipboard
                        </button>

                        <button
                            onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleSaveMapAsImage();
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                            type="button"
                        >
                            <CameraIcon className="w-4 h-4 mr-2" />
                            Save as Image
                        </button>

                        <hr className="my-1 border-gray-200" />

                        <button
                            onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemove();
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            className="flex items-center w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            type="button"
                        >
                            <TrashIcon className="w-4 h-4 mr-2" />
                            Remove
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

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
    onUpdateDashboard: (dashboard: Dashboard) => void;
}

export function Dashboard({
    dashboard,
    dbContext,
    schemaName,
    onLayoutChange,
    onRemoveVisualization,
    onUpdateDashboard,
}: DashboardProps) {
    const [activeTab, setActiveTab] = useState<'charts' | 'layout' | 'plugins'>('charts');

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
                            {dashboard.visualizations.map(viz => (
                                <div
                                    key={viz.id}
                                    className="p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 transition-colors"
                                >
                                    <div className="flex items-center justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="text-sm font-medium text-gray-900">
                                                    {viz.title || 'Untitled Visualization'}
                                                </h4>
                                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                                                    {viz.type}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Created: {viz.createdAt?.toLocaleDateString() || 'Unknown'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
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
                    {dashboard.visualizations.length > 0 ? (
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
                            {dashboard.visualizations.map(viz => (
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
                                        <div className="h-full flex flex-col">
                                            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 cursor-move">
                                                <h4 className="text-sm font-medium text-gray-900 truncate">
                                                    {viz.title}
                                                </h4>
                                                <MapDropdownMenu
                                                    vizId={viz.id}
                                                    vizTitle={viz.title}
                                                    onRemove={handleRemoveVisualization}
                                                />
                                            </div>
                                            <div className="flex-1 p-2 overflow-hidden">
                                                <div
                                                    className="h-full"
                                                    onMouseDown={e => e.stopPropagation()}
                                                    onTouchStart={e => e.stopPropagation()}
                                                >
                                                    <Map
                                                        dbContext={dbContext}
                                                        schema={schemaName}
                                                        selectedTable={viz.tableName}
                                                        geometryColumnName={viz.geometryColumn}
                                                        tableStyles={viz.mapSpec?.tableStyles}
                                                        initialStyle={viz.mapSpec?.style}
                                                        showControls={false}
                                                    />
                                                </div>
                                            </div>
                                        </div>
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
