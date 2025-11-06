import { useState, useCallback, useEffect, useRef } from 'react';
import ReactGridLayout, { Responsive, WidthProvider, Layout } from 'react-grid-layout';
import {
    ChartBarIcon,
    CogIcon,
    EllipsisVerticalIcon,
    TrashIcon,
    PencilIcon,
    ClipboardDocumentIcon,
    CheckIcon,
} from '@heroicons/react/24/outline';
import { VisualizationGridItem } from './VisualizationGridItem';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization as DashboardVisualizationType } from '../../store/remoteAtoms';
import html2canvas from 'html2canvas';
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
    const [showCopyFeedback, setShowCopyFeedback] = useState(false);
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

    const handleCopyDashboardToClipboard = useCallback(async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                console.error('Clipboard API is not supported');
                return;
            }

            // Find the grid layout container
            const gridContainer = document.querySelector('.layout');
            if (!gridContainer) {
                console.error('Dashboard grid container not found');
                return;
            }

            // Utility: Convert OKLCH to RGBA for html2canvas compatibility
            const oklchToRgba = (input: string): string | null => {
                // Match oklch(L C H / A?) with optional % on L and optional alpha
                const match = input
                    .trim()
                    .match(/^oklch\(\s*([0-9.]+%?)\s+([0-9.]+)\s+([0-9.]+)(?:deg)?(?:\s*\/\s*([0-9.]+))?\s*\)$/i);
                if (!match) return null;
                const [, lRaw, cRaw, hRaw, aRaw] = match;
                let L = parseFloat(lRaw);
                // Percent handling
                if (lRaw.endsWith('%')) L = L / 100;
                const C = parseFloat(cRaw);
                let h = parseFloat(hRaw);
                // Normalize hue to radians
                if (!isFinite(h)) h = 0;
                const hr = (h * Math.PI) / 180;
                const a = C * Math.cos(hr);
                const b = C * Math.sin(hr);
                const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
                const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
                const s_ = L - 0.0894841775 * a - 1.291485548 * b;
                const l = l_ * l_ * l_;
                const m = m_ * m_ * m_;
                const s = s_ * s_ * s_;
                let r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
                let g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
                let b2 = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
                // clamp
                r = Math.min(1, Math.max(0, r));
                g = Math.min(1, Math.max(0, g));
                b2 = Math.min(1, Math.max(0, b2));
                // gamma encode
                const enc = (v: number) => (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
                const R = Math.round(enc(r) * 255);
                const G = Math.round(enc(g) * 255);
                const B = Math.round(enc(b2) * 255);
                let A = 1;
                if (aRaw != null) {
                    const aStr = aRaw.trim();
                    A = aStr.endsWith('%') ? parseFloat(aStr) / 100 : parseFloat(aStr);
                    if (!isFinite(A)) A = 1;
                    A = Math.max(0, Math.min(1, A));
                }
                return A === 1 ? `rgb(${R}, ${G}, ${B})` : `rgba(${R}, ${G}, ${B}, ${A})`;
            };

            // Convert oklch() inside a value if present; otherwise return original
            const normalizeColorValue = (value: string): string => {
                if (!value) return value;
                const v = value.trim();
                if (!/oklch\(/i.test(v)) return v;
                // If value is exactly one oklch(), convert
                const converted = oklchToRgba(v);
                if (converted) return converted;
                // For complex values (e.g., gradients or shadows), drop to a safe fallback
                if (/gradient\(/i.test(v)) return 'none';
                if (/box-shadow/i.test(v)) return 'none';
                // As a last resort, try replacing any oklch(...) occurrences individually
                return v.replace(/oklch\([^)]*\)/gi, m => oklchToRgba(m) || 'transparent');
            };

            // Build list including the root container first to ensure it's also normalized
            const sourceElements: Element[] = [
                gridContainer as Element,
                ...Array.from(gridContainer.querySelectorAll('*')),
            ];
            const elementsWithStyles = sourceElements.map(el => ({
                styles: window.getComputedStyle(el as Element),
            }));

            // Use html2canvas to capture the entire dashboard grid
            const canvas = await html2canvas(gridContainer as HTMLElement, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null, // keep transparent to avoid background merges
                onclone: (_clonedDoc: Document, clonedElement: HTMLElement) => {
                    // Apply computed styles as inline styles and normalize OKLCH
                    const clonedElements: Element[] = [
                        clonedElement as Element,
                        ...Array.from(clonedElement.querySelectorAll('*')),
                    ];

                    elementsWithStyles.forEach(({ styles }, index) => {
                        const clonedEl = clonedElements[index];
                        if (!clonedEl) return;
                        const htmlElement = clonedEl as HTMLElement;

                        // Key color-related properties to normalize
                        const colorProps = [
                            'background-color',
                            'color',
                            'border-top-color',
                            'border-right-color',
                            'border-bottom-color',
                            'border-left-color',
                            'outline-color',
                            'text-decoration-color',
                            'column-rule-color',
                            'caret-color',
                            'accent-color',
                            'fill',
                            'stroke',
                        ];

                        colorProps.forEach(prop => {
                            const raw = styles.getPropertyValue(prop);
                            if (!raw) return;
                            const value = normalizeColorValue(raw);
                            if (value && value !== 'rgba(0, 0, 0, 0)' && value !== 'transparent') {
                                htmlElement.style.setProperty(prop, value, 'important');
                            }
                        });

                        // Neutralize complex properties that may embed oklch()
                        const bgImage = styles.getPropertyValue('background-image');
                        if (bgImage && /oklch\(/i.test(bgImage)) {
                            htmlElement.style.setProperty('background-image', 'none', 'important');
                        }
                        const boxShadow = styles.getPropertyValue('box-shadow');
                        if (boxShadow && /oklch\(/i.test(boxShadow)) {
                            htmlElement.style.setProperty('box-shadow', 'none', 'important');
                        }
                        const textShadow = styles.getPropertyValue('text-shadow');
                        if (textShadow && /oklch\(/i.test(textShadow)) {
                            htmlElement.style.setProperty('text-shadow', 'none', 'important');
                        }

                        // Fallback: scan all computed properties and sanitize any with oklch()
                        for (let i = 0; i < styles.length; i++) {
                            const propName = styles.item(i);
                            if (!propName) continue;
                            const rawVal = styles.getPropertyValue(propName);
                            if (!rawVal || !/oklch\(/i.test(rawVal)) continue;

                            let safeVal = rawVal;
                            if (/background-image|mask-image|list-style-image/i.test(propName)) {
                                safeVal = 'none';
                            } else if (/shadow/i.test(propName)) {
                                safeVal = 'none';
                            } else if (
                                /color|background|border|outline|fill|stroke|caret|accent|text-decoration|column-rule/i.test(
                                    propName
                                )
                            ) {
                                safeVal = normalizeColorValue(rawVal);
                            } else {
                                // Replace any oklch() occurrences within the value
                                safeVal = rawVal.replace(/oklch\([^)]*\)/gi, m => oklchToRgba(m) || 'transparent');
                            }

                            // If normalization didn't change and still has oklch or gradient, neutralize
                            if (/oklch\(/i.test(safeVal) || /gradient\(/i.test(safeVal)) {
                                safeVal = /background/i.test(propName) ? 'transparent' : 'initial';
                            }

                            try {
                                htmlElement.style.setProperty(propName, safeVal, 'important');
                            } catch {
                                // Ignore invalid property set
                            }
                        }
                    });
                },
            });

            // Safari requires ClipboardItem to be created synchronously with a Promise
            const blobPromise = new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create image from dashboard'));
                    }
                }, 'image/png');
            });

            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);

            // Show success feedback
            setShowCopyFeedback(true);
            setTimeout(() => {
                setShowCopyFeedback(false);
            }, 1500);
        } catch (err) {
            console.error('Error copying dashboard:', err);
        }
    }, []);

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
                    <div className="flex items-center justify-between">
                        {isEditingTitle ? (
                            <div className="flex items-center gap-2 flex-1">
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
                        <button
                            onClick={handleCopyDashboardToClipboard}
                            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors"
                            title={showCopyFeedback ? 'コピーしました！' : 'クリップボードにコピー'}
                            data-testid="dashboard-copy-button"
                        >
                            {showCopyFeedback ? (
                                <CheckIcon className="w-5 h-5 text-green-500" />
                            ) : (
                                <ClipboardDocumentIcon className="w-5 h-5" />
                            )}
                        </button>
                    </div>
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
