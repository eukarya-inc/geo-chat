import { useState, useCallback, useRef, useEffect } from 'react';
import { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import {
    ChartBarIcon,
    CogIcon,
    PuzzlePieceIcon,
    MapIcon,
    EllipsisVerticalIcon,
    TrashIcon,
    ArrowDownTrayIcon,
    CircleStackIcon,
    ClipboardDocumentIcon,
    CameraIcon,
    PhotoIcon,
    XMarkIcon,
} from '@heroicons/react/24/outline';
import VegaLiteChart from '../chart/VegaLiteChart';
import { ChartConfigModal, DataSourceModal } from '../chart';
import Map from '../map';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

const ResponsiveGridLayout = WidthProvider(Responsive);

interface ChartDropdownMenuProps {
    vizId: string;
    vizTitle: string;
    chartSpec: ChartSpec;
    dbContext: DBContext;
    schema: string;
    onRemove: (vizId: string) => void;
    onUpdateChart: (vizId: string, newSpec: ChartSpec) => void;
}

function ChartDropdownMenu({
    vizId,
    vizTitle,
    chartSpec,
    dbContext,
    schema,
    onRemove,
    onUpdateChart,
}: ChartDropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [isConfigModalOpen, setIsConfigModalOpen] = useState(false);
    const [isDataSourceModalOpen, setIsDataSourceModalOpen] = useState(false);
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

    const handleVegaConfigureOpen = () => {
        setIsConfigModalOpen(true);
        setIsOpen(false);
    };

    const handleDataSourceOpen = () => {
        setIsDataSourceModalOpen(true);
        setIsOpen(false);
    };

    const handleVegaSaveAsPNG = () => {
        // Use HTML5 canvas to capture the chart as PNG
        const chartContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
        if (chartContainer) {
            const canvas = chartContainer.querySelector('canvas');
            if (canvas) {
                try {
                    canvas.toBlob(blob => {
                        if (blob) {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = `${vizTitle.replace(/[^a-z0-9]/gi, '_') || 'chart'}.png`;
                            a.click();
                            URL.revokeObjectURL(url);
                        } else {
                            alert('Failed to export chart as PNG. Please try again.');
                        }
                    }, 'image/png');
                } catch (error) {
                    console.error('Error exporting PNG:', error);
                    alert('Failed to export chart as PNG. Please try again.');
                }
            } else {
                alert('Chart canvas not found. Please try again.');
            }
        }
        setIsOpen(false);
    };

    const handleVegaSaveAsSVG = () => {
        // For SVG export, we need to access the Vega view
        const chartContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
        if (chartContainer) {
            // Try to find the Vega view in various ways
            const vegaContainer = chartContainer.querySelector('[class*="vega"]');
            if (vegaContainer) {
                // Try to get SVG content directly from the DOM
                const svgElement = vegaContainer.querySelector('svg');
                if (svgElement) {
                    try {
                        const svgData = new XMLSerializer().serializeToString(svgElement);
                        const svgBlob = new Blob([svgData], { type: 'image/svg+xml' });
                        const url = URL.createObjectURL(svgBlob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${vizTitle.replace(/[^a-z0-9]/gi, '_') || 'chart'}.svg`;
                        a.click();
                        URL.revokeObjectURL(url);
                    } catch (error) {
                        console.error('Error exporting SVG:', error);
                        alert('Failed to export chart as SVG. Please try again.');
                    }
                } else {
                    alert('SVG element not found. Please try PNG export instead.');
                }
            } else {
                alert('Chart not found. Please try again.');
            }
        }
        setIsOpen(false);
    };

    const handleCopyToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
                setIsOpen(false);
                return;
            }

            const chartContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            if (!chartContainer) {
                alert('Chart not found. Please try again.');
                setIsOpen(false);
                return;
            }

            // Try canvas (PNG) first
            const canvas = chartContainer.querySelector('canvas');
            if (canvas) {
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
                setIsOpen(false);
                return;
            }

            // Try SVG - convert to PNG for clipboard
            const svgElement = chartContainer.querySelector('svg');
            if (svgElement) {
                const svgData = new XMLSerializer().serializeToString(svgElement);
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
                setIsOpen(false);
                return;
            }

            alert('Chart not found. Please try again.');
        } catch (err) {
            console.error('Error copying chart:', err);
            alert(`Failed to copy chart to clipboard: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
        setIsOpen(false);
    };

    const handleRemove = () => {
        onRemove(vizId);
        setIsOpen(false);
    };

    return (
        <>
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
                    title="Chart options"
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
                                    handleVegaConfigureOpen();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ChartBarIcon className="w-4 h-4 mr-2" />
                                Edit Chart Style
                            </button>

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleDataSourceOpen();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <CircleStackIcon className="w-4 h-4 mr-2" />
                                Edit Data Source
                            </button>

                            <hr className="my-1 border-gray-200" />

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCopyToClipboard();
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
                                    handleVegaSaveAsPNG();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                                Save as PNG
                            </button>

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleVegaSaveAsSVG();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ArrowDownTrayIcon className="w-4 h-4 mr-2" />
                                Save as SVG
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

            {/* Configuration Modal */}
            <ChartConfigModal
                isOpen={isConfigModalOpen}
                onClose={() => setIsConfigModalOpen(false)}
                chartSpec={chartSpec}
                dbContext={dbContext}
                schema={schema}
                onUpdateChart={onUpdateChart}
                vizId={vizId}
            />

            {/* Data Source Modal */}
            <DataSourceModal
                isOpen={isDataSourceModalOpen}
                onClose={() => setIsDataSourceModalOpen(false)}
                chartSpec={chartSpec}
                onUpdateChart={newSpec => onUpdateChart(vizId, newSpec)}
            />
        </>
    );
}

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
    const [isExporting, setIsExporting] = useState(false);
    const [showMenu, setShowMenu] = useState(false);
    const dashboardRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

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

    // Close menu when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowMenu(false);
            }
        }

        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

    const handleExportDashboard = async () => {
        if (!dashboardRef.current || dashboard.visualizations.length === 0) {
            alert('No visualizations to export. Please add some visualizations first.');
            return;
        }

        setShowMenu(false);
        setIsExporting(true);

        try {
            // Wait for rendering to complete - longer wait for maps to finish loading tiles
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Find the grid layout container
            const gridLayout = dashboardRef.current.querySelector('.react-grid-layout');
            if (!gridLayout) {
                throw new Error('Grid layout not found');
            }

            // Get all grid items and their bounding boxes
            const gridItems = gridLayout.querySelectorAll('.react-grid-item');
            const dashboardRect = dashboardRef.current.getBoundingClientRect();

            // Calculate canvas dimensions
            let maxRight = 0;
            let maxBottom = 0;
            gridItems.forEach(item => {
                const rect = item.getBoundingClientRect();
                maxRight = Math.max(maxRight, rect.right - dashboardRect.left);
                maxBottom = Math.max(maxBottom, rect.bottom - dashboardRect.top);
            });

            const canvasWidth = Math.ceil(maxRight + 32); // Add padding
            const canvasHeight = Math.ceil(maxBottom + 32);
            const scale = 2; // For high quality export

            // Create canvas for final composite
            const finalCanvas = document.createElement('canvas');
            finalCanvas.width = canvasWidth * scale;
            finalCanvas.height = canvasHeight * scale;
            const ctx = finalCanvas.getContext('2d');
            if (!ctx) throw new Error('Could not get canvas context');

            // Set scale and fill background
            ctx.scale(scale, scale);
            ctx.fillStyle = '#f9fafb'; // Match bg-gray-50
            ctx.fillRect(0, 0, canvasWidth, canvasHeight);

            // Capture and composite each visualization
            for (const viz of dashboard.visualizations) {
                const container = document.querySelector(`[data-viz-id="${viz.id}"]`);
                if (!container) continue;

                const containerRect = container.getBoundingClientRect();
                const x = containerRect.left - dashboardRect.left;
                const y = containerRect.top - dashboardRect.top;
                const width = containerRect.width;
                const height = containerRect.height;

                // Draw container background and border
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(x, y, width, height);
                ctx.strokeStyle = '#e5e7eb';
                ctx.lineWidth = 1;
                ctx.strokeRect(x, y, width, height);

                // Draw title bar
                ctx.fillStyle = '#f9fafb';
                ctx.fillRect(x, y, width, 38);
                ctx.strokeStyle = '#e5e7eb';
                ctx.beginPath();
                ctx.moveTo(x, y + 38);
                ctx.lineTo(x + width, y + 38);
                ctx.stroke();

                // Draw title text
                ctx.fillStyle = '#111827';
                ctx.font = '14px system-ui, -apple-system, sans-serif';
                ctx.fillText(viz.title, x + 12, y + 24);

                // Get the canvas element (different selectors for charts vs maps)
                let vizCanvas: HTMLCanvasElement | null = null;

                if (viz.type === 'map') {
                    // For maps, specifically look for MapLibre canvas
                    vizCanvas = container.querySelector(
                        'canvas.maplibregl-canvas, canvas.mapboxgl-canvas'
                    ) as HTMLCanvasElement | null;
                } else {
                    // For charts, any canvas will do
                    vizCanvas = container.querySelector('canvas') as HTMLCanvasElement | null;
                }

                if (vizCanvas instanceof HTMLCanvasElement) {
                    try {
                        // Get the canvas position
                        const vizRect = vizCanvas.getBoundingClientRect();
                        const vizX = vizRect.left - dashboardRect.left;
                        const vizY = vizRect.top - dashboardRect.top;

                        console.log(`Capturing ${viz.type}:`, {
                            id: viz.id,
                            width: vizCanvas.width,
                            height: vizCanvas.height,
                            displayWidth: vizRect.width,
                            displayHeight: vizRect.height,
                            hasMaplibreClass: vizCanvas.classList.contains('maplibregl-canvas'),
                        });

                        // Check if canvas has actual dimensions
                        if (vizCanvas.width === 0 || vizCanvas.height === 0) {
                            console.warn(`Canvas has zero dimensions for ${viz.type}`);
                            ctx.fillStyle = '#f3f4f6';
                            ctx.fillRect(vizX, vizY, vizRect.width, vizRect.height);
                            ctx.fillStyle = '#9ca3af';
                            ctx.font = '12px system-ui';
                            ctx.textAlign = 'center';
                            ctx.fillText(`Map not rendered`, vizX + vizRect.width / 2, vizY + vizRect.height / 2);
                            continue;
                        }

                        // For MapLibre canvases, verify they're ready
                        if (viz.type === 'map') {
                            // Check if the canvas appears to have content by sampling a pixel
                            const testCtx = document.createElement('canvas').getContext('2d');
                            if (testCtx) {
                                testCtx.canvas.width = 1;
                                testCtx.canvas.height = 1;
                                try {
                                    testCtx.drawImage(vizCanvas, 0, 0, 1, 1);
                                    const pixelData = testCtx.getImageData(0, 0, 1, 1).data;
                                    const isBlank = pixelData[3] === 0; // Check alpha channel
                                    console.log(`Map canvas blank check:`, {
                                        isBlank,
                                        pixelData: Array.from(pixelData),
                                    });
                                } catch (err) {
                                    console.warn('Could not test canvas content:', err);
                                }
                            }
                        }

                        // Draw the visualization canvas
                        console.log(`Drawing canvas at position (${vizX}, ${vizY})`);
                        ctx.drawImage(vizCanvas, vizX, vizY, vizRect.width, vizRect.height);
                        console.log(`Successfully drew ${viz.type} canvas`);
                    } catch (err) {
                        console.error(`Could not capture ${viz.type} canvas:`, err);
                        // Draw error placeholder
                        const vizRect = vizCanvas.getBoundingClientRect();
                        const vizX = vizRect.left - dashboardRect.left;
                        const vizY = vizRect.top - dashboardRect.top;
                        ctx.fillStyle = '#fee2e2';
                        ctx.fillRect(vizX, vizY, vizRect.width, vizRect.height);
                        ctx.fillStyle = '#991b1b';
                        ctx.font = '12px system-ui';
                        ctx.textAlign = 'center';
                        ctx.fillText(
                            `Failed to capture ${viz.type}`,
                            vizX + vizRect.width / 2,
                            vizY + vizRect.height / 2
                        );
                    }
                }
            }

            // Convert to blob and download
            finalCanvas.toBlob(
                blob => {
                    if (blob) {
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        const fileName = `${dashboard.title.replace(/[^a-z0-9]/gi, '_') || 'dashboard'}_${new Date().toISOString().split('T')[0]}.png`;
                        a.href = url;
                        a.download = fileName;
                        a.click();
                        URL.revokeObjectURL(url);
                        alert('Dashboard exported successfully!');
                    } else {
                        alert('Failed to export dashboard. Please try again.');
                    }
                    setIsExporting(false);
                },
                'image/png',
                1.0
            );
        } catch (error) {
            console.error('Error exporting dashboard:', error);
            alert(`Failed to export dashboard: ${error instanceof Error ? error.message : 'Unknown error'}`);
            setIsExporting(false);
        }
    };

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
            <div className="flex-1 h-full overflow-auto bg-gray-50 relative">
                {/* Hamburger Menu - Floating in top right */}
                {dashboard.visualizations.length > 0 && (
                    <div className="absolute top-4 right-4 z-10" ref={menuRef}>
                        <button
                            onClick={e => {
                                e.preventDefault();
                                e.stopPropagation();
                                setShowMenu(!showMenu);
                            }}
                            disabled={isExporting}
                            className={`p-2.5 rounded-lg shadow-lg transition-all duration-300 ${
                                isExporting
                                    ? 'bg-gray-400 cursor-not-allowed'
                                    : 'bg-white hover:bg-gray-50 cursor-pointer border border-gray-200'
                            } ${showMenu ? 'rotate-90' : 'rotate-0'}`}
                            title={showMenu ? 'Close menu' : 'Dashboard options'}
                        >
                            {isExporting ? (
                                <svg
                                    className="animate-spin h-5 w-5 text-gray-600"
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                >
                                    <circle
                                        className="opacity-25"
                                        cx="12"
                                        cy="12"
                                        r="10"
                                        stroke="currentColor"
                                        strokeWidth="4"
                                    ></circle>
                                    <path
                                        className="opacity-75"
                                        fill="currentColor"
                                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                    ></path>
                                </svg>
                            ) : (
                                <div className="relative w-5 h-5">
                                    {/* Hamburger Icon */}
                                    <svg
                                        className={`absolute inset-0 w-5 h-5 text-gray-600 transition-all duration-300 ${
                                            showMenu ? 'opacity-0 rotate-90 scale-0' : 'opacity-100 rotate-0 scale-100'
                                        }`}
                                        fill="none"
                                        stroke="currentColor"
                                        viewBox="0 0 24 24"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            strokeWidth={2}
                                            d="M4 6h16M4 12h16M4 18h16"
                                        />
                                    </svg>
                                    {/* Close (X) Icon */}
                                    <XMarkIcon
                                        className={`absolute inset-0 w-5 h-5 text-gray-600 transition-all duration-300 ${
                                            showMenu ? 'opacity-100 rotate-0 scale-100' : 'opacity-0 rotate-90 scale-0'
                                        }`}
                                    />
                                </div>
                            )}
                        </button>

                        {/* Dropdown Menu */}
                        {showMenu && !isExporting && (
                            <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-gray-200 rounded-lg shadow-lg">
                                <div className="py-1">
                                    <button
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleExportDashboard();
                                        }}
                                        className="flex items-center w-full px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                        type="button"
                                    >
                                        <PhotoIcon className="w-4 h-4 mr-3 text-gray-500" />
                                        <div className="flex-1 text-left">
                                            <div className="font-medium">Export Dashboard</div>
                                            <div className="text-xs text-gray-500">Save as PNG image</div>
                                        </div>
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                <div className="p-4 h-full" ref={dashboardRef}>
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
                                    <div className="h-full flex flex-col">
                                        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 cursor-move">
                                            <h4 className="text-sm font-medium text-gray-900 truncate">{viz.title}</h4>
                                            {viz.type === 'chart' && viz.chartSpec && (
                                                <ChartDropdownMenu
                                                    vizId={viz.id}
                                                    vizTitle={viz.title}
                                                    chartSpec={viz.chartSpec}
                                                    dbContext={dbContext}
                                                    schema={schemaName}
                                                    onRemove={handleRemoveVisualization}
                                                    onUpdateChart={handleUpdateChart}
                                                />
                                            )}
                                            {viz.type === 'map' && (
                                                <MapDropdownMenu
                                                    vizId={viz.id}
                                                    vizTitle={viz.title}
                                                    onRemove={handleRemoveVisualization}
                                                />
                                            )}
                                        </div>
                                        <div className="flex-1 p-2 overflow-hidden">
                                            {viz.type === 'chart' && viz.chartSpec ? (
                                                <div className="h-full dashboard-chart-container">
                                                    <VegaLiteChart
                                                        spec={viz.chartSpec.spec}
                                                        dbContext={dbContext}
                                                        schema={schemaName}
                                                        showHeader={false}
                                                        enableActions={false}
                                                    />
                                                </div>
                                            ) : viz.type === 'map' && viz.tableName ? (
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
                                                        preserveDrawingBuffer={true}
                                                    />
                                                </div>
                                            ) : (
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
                                            )}
                                        </div>
                                    </div>
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
