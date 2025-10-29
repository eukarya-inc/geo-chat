export interface GridDimensions {
    visibleWidth: number;
    visibleHeight: number;
    scrollWidth: number;
    scrollHeight: number;
    offsetWidth: number;
    offsetHeight: number;
    fullWidth: number;
    fullHeight: number;
}

export interface MapLibreInstance {
    triggerRepaint?: () => void;
    once?: (event: string, fn: () => void) => void;
    getCanvas?: () => HTMLCanvasElement;
}

/**
 * Get MapLibre GL canvas directly from map instance
 */
export async function getMapLibreCanvas(gridElement: Element): Promise<HTMLCanvasElement | null> {
    const mapCanvases = gridElement.querySelectorAll('.maplibregl-canvas');

    for (const canvas of mapCanvases) {
        const htmlCanvas = canvas as HTMLCanvasElement;
        if (htmlCanvas.width > 0 && htmlCanvas.height > 0) {
            // Try to get the map instance to access preserved buffer
            let mapInstance: unknown = null;
            const mapElement = canvas.closest('[data-viz-id]');

            if (mapElement) {
                // Try various ways to access the map instance
                const elemWithMap = mapElement as HTMLElement & {
                    _map?: unknown;
                    mapInstance?: unknown;
                };
                mapInstance = elemWithMap._map || elemWithMap.mapInstance;

                if (!mapInstance) {
                    // Try to find map instance through the map container
                    const mapContainer = mapElement.querySelector('#map');
                    if (mapContainer) {
                        mapInstance = (mapContainer as HTMLElement & { _map?: unknown })._map;
                    }
                }
            }

            const mapInstanceWithCanvas = mapInstance as { getCanvas?: () => HTMLCanvasElement };
            if (mapInstanceWithCanvas && typeof mapInstanceWithCanvas.getCanvas === 'function') {
                console.log('Found MapLibre GL instance, using getCanvas() method');
                try {
                    return mapInstanceWithCanvas.getCanvas();
                } catch (e) {
                    console.warn('Failed to get canvas from MapLibre GL instance:', e);
                }
            }

            // Fallback: return the canvas element directly
            console.log('Using MapLibre canvas element directly');
            return htmlCanvas;
        }
    }

    return null;
}

/**
 * Force map repaint to ensure canvas buffer is populated
 */
export async function forceMapRepaint(gridElement: Element): Promise<void> {
    return new Promise<void>(resolve => {
        const mapCanvases = gridElement.querySelectorAll('.maplibregl-canvas');
        const repaintPromises: Promise<void>[] = [];

        mapCanvases.forEach(canvasEl => {
            const mapElement = canvasEl.closest('[data-viz-id]');
            if (mapElement) {
                const mapInstance = (
                    mapElement as HTMLElement & {
                        _map?: MapLibreInstance;
                    }
                )?._map;
                if (mapInstance && mapInstance.triggerRepaint) {
                    const repaintPromise = new Promise<void>(resolveRepaint => {
                        if (mapInstance.once) {
                            mapInstance.once('render', resolveRepaint);
                        } else {
                            setTimeout(resolveRepaint, 200);
                        }
                    });
                    repaintPromises.push(repaintPromise);
                    mapInstance.triggerRepaint();
                }
            }
        });

        if (repaintPromises.length > 0) {
            Promise.all(repaintPromises).then(() => {
                setTimeout(resolve, 100); // Extra delay for rendering to complete
            });
        } else {
            setTimeout(resolve, 300); // Fallback delay
        }
    });
}

/**
 * Calculate full dashboard dimensions including off-screen content
 */
export function calculateDashboardDimensions(gridElement: Element): GridDimensions {
    const gridRect = gridElement.getBoundingClientRect();
    const gridHtmlElement = gridElement as HTMLElement;

    // Calculate full content dimensions including off-screen content
    // Also check all grid items to ensure we capture everything
    const gridItems = gridElement.querySelectorAll('[data-viz-id]');
    let maxRight = gridRect.width;
    let maxBottom = gridRect.height;

    gridItems.forEach(item => {
        const itemRect = item.getBoundingClientRect();
        const containerRect = gridElement.getBoundingClientRect();
        const relativeRight = itemRect.right - containerRect.left + 20; // Add some padding
        const relativeBottom = itemRect.bottom - containerRect.top + 20; // Add some padding
        maxRight = Math.max(maxRight, relativeRight);
        maxBottom = Math.max(maxBottom, relativeBottom);
    });

    const fullWidth = Math.max(gridRect.width, gridHtmlElement.scrollWidth, gridHtmlElement.offsetWidth, maxRight);
    const fullHeight = Math.max(gridRect.height, gridHtmlElement.scrollHeight, gridHtmlElement.offsetHeight, maxBottom);

    return {
        visibleWidth: gridRect.width,
        visibleHeight: gridRect.height,
        scrollWidth: gridHtmlElement.scrollWidth,
        scrollHeight: gridHtmlElement.scrollHeight,
        offsetWidth: gridHtmlElement.offsetWidth,
        offsetHeight: gridHtmlElement.offsetHeight,
        fullWidth,
        fullHeight,
    };
}

/**
 * Create manual composite image using direct canvas approach
 */
export async function createManualComposite(
    gridElement: Element,
    mapCanvas: HTMLCanvasElement,
    fullWidth: number,
    fullHeight: number,
    dashboardTitle: string
): Promise<boolean> {
    console.log('Attempting manual composite approach with direct map canvas and chart canvases');

    try {
        // Create composite canvas
        const compositeCanvas = document.createElement('canvas');
        const compositeCtx = compositeCanvas.getContext('2d');

        if (!compositeCtx) return false;

        compositeCanvas.width = fullWidth;
        compositeCanvas.height = fullHeight;

        // Set background
        compositeCtx.fillStyle = '#f9fafb';
        compositeCtx.fillRect(0, 0, fullWidth, fullHeight);

        // Get all grid items and position them correctly
        const gridItems = gridElement.querySelectorAll('[data-viz-id]');
        const containerRect = gridElement.getBoundingClientRect();

        console.log(`Processing ${gridItems.length} grid items for composite`);

        // Process each grid item individually with accurate positioning
        gridItems.forEach((gridItem, index) => {
            const vizId = gridItem.getAttribute('data-viz-id');
            const itemRect = gridItem.getBoundingClientRect();
            const itemX = itemRect.left - containerRect.left;
            const itemY = itemRect.top - containerRect.top;

            console.log(
                `Grid item ${index} (viz-id: ${vizId}): position ${itemX}, ${itemY}, size ${itemRect.width}x${itemRect.height}`
            );

            // First, draw the item background (to match dashboard styling)
            compositeCtx.fillStyle = '#ffffff';
            compositeCtx.fillRect(itemX, itemY, itemRect.width, itemRect.height);

            // Add border to match dashboard styling
            compositeCtx.strokeStyle = '#e5e7eb';
            compositeCtx.lineWidth = 1;
            compositeCtx.strokeRect(itemX, itemY, itemRect.width, itemRect.height);

            // Check if this is a map item
            const mapCanvasInItem = gridItem.querySelector('.maplibregl-canvas');
            if (mapCanvasInItem && mapCanvas) {
                console.log(`Drawing map canvas for item ${index}`);

                // Find the content area (excluding header)
                const contentArea = gridItem.querySelector('.flex-1') || gridItem;
                const contentRect = contentArea.getBoundingClientRect();
                const contentX = contentRect.left - containerRect.left;
                const contentY = contentRect.top - containerRect.top;

                console.log(`Map content area: ${contentX}, ${contentY}, ${contentRect.width}x${contentRect.height}`);
                compositeCtx.drawImage(mapCanvas, contentX, contentY, contentRect.width, contentRect.height);
            } else {
                // Look for chart canvas in this grid item
                const chartCanvasInItem = gridItem.querySelector('canvas:not(.maplibregl-canvas)');
                if (chartCanvasInItem) {
                    const chartCanvas = chartCanvasInItem as HTMLCanvasElement;
                    const chartRect = chartCanvasInItem.getBoundingClientRect();
                    const chartX = chartRect.left - containerRect.left;
                    const chartY = chartRect.top - containerRect.top;

                    console.log(
                        `Drawing chart canvas for item ${index} at actual canvas position: ${chartX}, ${chartY}`
                    );
                    compositeCtx.drawImage(chartCanvas, chartX, chartY, chartRect.width, chartRect.height);
                }
            }

            // Add title/header text if exists
            const titleElement = gridItem.querySelector('h4, h3, .text-sm.font-medium');
            if (titleElement) {
                const titleText = titleElement.textContent || '';
                if (titleText.trim()) {
                    compositeCtx.fillStyle = '#374151';
                    compositeCtx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto';
                    compositeCtx.fillText(titleText, itemX + 12, itemY + 24);
                }
            }
        });

        console.log('Manual composite succeeded, downloading...');
        const link = document.createElement('a');
        link.download = `${dashboardTitle || 'dashboard'}.png`;
        link.href = compositeCanvas.toDataURL('image/png');
        link.click();
        return true;
    } catch (e) {
        console.warn('Manual composite approach failed:', e);
        return false;
    }
}

/**
 * Create enhanced onclone handler for html2canvas
 */
export function createOnCloneHandler(mapCanvas: HTMLCanvasElement | null) {
    return (clonedDoc: Document) => {
        console.log('onclone: Processing cloned document for better map rendering');

        // Find all MapLibre GL canvases in both original and cloned documents
        const originalMapCanvases = document.querySelectorAll('.maplibregl-canvas');
        const clonedMapCanvases = clonedDoc.querySelectorAll('.maplibregl-canvas');

        console.log(`Found ${originalMapCanvases.length} original and ${clonedMapCanvases.length} cloned map canvases`);

        // Try multiple approaches to get map canvas content
        clonedMapCanvases.forEach((clonedCanvasEl, index) => {
            const clonedCanvas = clonedCanvasEl as HTMLCanvasElement;
            const ctx = clonedCanvas.getContext('2d');

            if (ctx) {
                console.log(`Processing cloned canvas ${index}: ${clonedCanvas.width}x${clonedCanvas.height}`);

                // Clear the cloned canvas first
                ctx.clearRect(0, 0, clonedCanvas.width, clonedCanvas.height);

                // Try to get corresponding original canvas
                const originalCanvas = originalMapCanvases[index] as HTMLCanvasElement;

                if (originalCanvas) {
                    try {
                        // Method 1: Use direct canvas if available
                        if (
                            mapCanvas &&
                            clonedCanvas.width === mapCanvas.width &&
                            clonedCanvas.height === mapCanvas.height
                        ) {
                            console.log('Using direct mapCanvas');
                            ctx.drawImage(mapCanvas, 0, 0);
                        }
                        // Method 2: Copy from original canvas
                        else if (originalCanvas.width > 0 && originalCanvas.height > 0) {
                            console.log('Copying from original canvas');
                            ctx.drawImage(originalCanvas, 0, 0);
                        }
                        // Method 3: Try to get canvas from map instance
                        else {
                            console.log('Trying to get canvas from map instance');
                            const mapElement = originalCanvas.closest('[data-viz-id]');
                            if (mapElement) {
                                const mapInstance = (mapElement as HTMLElement & { _map?: unknown })?._map;
                                const mapWithCanvas = mapInstance as {
                                    getCanvas?: () => HTMLCanvasElement;
                                };
                                if (mapWithCanvas?.getCanvas) {
                                    const instanceCanvas = mapWithCanvas.getCanvas();
                                    ctx.drawImage(instanceCanvas, 0, 0);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to copy map canvas content:', e);
                        // Fallback: fill with a light color instead of black
                        ctx.fillStyle = '#e5e7eb';
                        ctx.fillRect(0, 0, clonedCanvas.width, clonedCanvas.height);
                    }
                }
            }
        });
    };
}

/**
 * Create html2canvas options with common settings
 */
export function createHtml2CanvasOptions(
    fullWidth: number,
    fullHeight: number,
    oncloneHandler?: (clonedDoc: Document) => void
) {
    const baseOptions = {
        useCORS: true,
        allowTaint: true,
        backgroundColor: null,
        width: fullWidth,
        height: fullHeight,
        scrollX: 0,
        scrollY: 0,
        x: 0,
        y: 0,
        ignoreElements: (element: Element) => {
            // Skip control elements that can interfere with map rendering
            if (element.classList.contains('maplibregl-control-container')) return true;
            if (element.classList.contains('maplibregl-ctrl')) return true;
            return false;
        },
    };

    if (oncloneHandler) {
        return { ...baseOptions, onclone: oncloneHandler };
    }

    return baseOptions;
}

/**
 * Download canvas as PNG
 */
export function downloadCanvasAsPNG(canvas: HTMLCanvasElement, filename: string): void {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
}

/**
 * Check if dashboard has map content
 */
export function hasMapContent(gridElement: Element): boolean {
    const mapContainers = gridElement.querySelectorAll('[data-viz-id]');
    return Array.from(mapContainers).some(
        container => container.querySelector('#map') || container.textContent?.includes('map')
    );
}
