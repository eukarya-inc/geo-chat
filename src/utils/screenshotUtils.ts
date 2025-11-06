import { toPng } from 'html-to-image';

/**
 * Configuration for screenshot capture
 */
const SCREENSHOT_CONFIG = {
    maxWidth: 800, // Maximum width for thumbnail
    quality: 0.7, // JPEG quality (60-70%)
    delay: 500, // Delay in ms to ensure rendering is complete
} as const;

/**
 * Captures a screenshot of a DOM element and returns it as a Base64 Data URL
 *
 * @param element - The DOM element to capture
 * @returns Promise resolving to a Base64 Data URL string (PNG format), or null if capture fails
 */
export async function captureElementScreenshot(element: HTMLElement): Promise<string | null> {
    try {
        // Wait a bit to ensure all rendering is complete (charts, maps, etc.)
        await new Promise(resolve => setTimeout(resolve, SCREENSHOT_CONFIG.delay));

        // Capture the element using html-to-image
        const dataUrl = await toPng(element, {
            cacheBust: true,
            pixelRatio: 1, // Use 1 for thumbnail quality
        });

        // Calculate thumbnail dimensions while maintaining aspect ratio
        const img = new Image();
        img.src = dataUrl;

        return new Promise((resolve, reject) => {
            img.onload = () => {
                const originalWidth = img.width;
                const originalHeight = img.height;
                let thumbnailWidth = originalWidth;
                let thumbnailHeight = originalHeight;

                if (originalWidth > SCREENSHOT_CONFIG.maxWidth) {
                    const scale = SCREENSHOT_CONFIG.maxWidth / originalWidth;
                    thumbnailWidth = SCREENSHOT_CONFIG.maxWidth;
                    thumbnailHeight = Math.round(originalHeight * scale);
                }

                // Create a new canvas for the thumbnail
                const thumbnailCanvas = document.createElement('canvas');
                thumbnailCanvas.width = thumbnailWidth;
                thumbnailCanvas.height = thumbnailHeight;

                const ctx = thumbnailCanvas.getContext('2d');
                if (!ctx) {
                    console.error('Failed to get canvas 2D context');
                    resolve(null);
                    return;
                }

                // Draw the scaled image
                ctx.drawImage(img, 0, 0, thumbnailWidth, thumbnailHeight);

                // Convert to PNG Data URL
                const thumbnailDataUrl = thumbnailCanvas.toDataURL('image/png', SCREENSHOT_CONFIG.quality);
                resolve(thumbnailDataUrl);
            };

            img.onerror = () => {
                console.error('Failed to load captured image');
                reject(new Error('Failed to load captured image'));
            };
        });
    } catch (error) {
        console.error('Failed to capture screenshot:', error);
        return null;
    }
}

/**
 * Captures a screenshot of a dashboard by its container element
 *
 * @param dashboardId - The ID of the dashboard to capture
 * @returns Promise resolving to a Base64 Data URL string, or null if capture fails
 */
export async function captureDashboardScreenshot(dashboardId: string): Promise<string | null> {
    // Find the dashboard container element
    // The dashboard is typically rendered in a container with a specific data attribute or class
    const dashboardElement = document.querySelector(`[data-dashboard-id="${dashboardId}"]`) as HTMLElement;

    if (!dashboardElement) {
        // Fallback: try to find the main dashboard container
        const fallbackElement = document.querySelector('.dashboard-container') as HTMLElement;
        if (!fallbackElement) {
            console.warn(`Dashboard element not found for ID: ${dashboardId}`);
            return null;
        }
        return captureElementScreenshot(fallbackElement);
    }

    return captureElementScreenshot(dashboardElement);
}
