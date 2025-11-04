import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback } from 'react';
import { dashboardPreviewsAtom, deleteDashboardPreviewAtom, setDashboardPreviewAtom } from '../store/previewAtoms';
import { captureDashboardScreenshot } from '../utils/screenshotUtils';

/**
 * Custom hook for managing dashboard preview images
 *
 * Provides functions to:
 * - Capture and save preview screenshots
 * - Retrieve preview images
 * - Delete preview images
 */
export function useDashboardPreview() {
    const previews = useAtomValue(dashboardPreviewsAtom);
    const setPreview = useSetAtom(setDashboardPreviewAtom);
    const deletePreview = useSetAtom(deleteDashboardPreviewAtom);

    /**
     * Captures a screenshot of the specified dashboard and saves it
     *
     * @param dashboardId - The ID of the dashboard to capture
     * @returns Promise resolving to true if capture succeeded, false otherwise
     */
    const capturePreview = useCallback(
        async (dashboardId: string): Promise<boolean> => {
            try {
                const imageData = await captureDashboardScreenshot(dashboardId);

                if (!imageData) {
                    console.warn(`Failed to capture preview for dashboard: ${dashboardId}`);
                    return false;
                }

                setPreview({ dashboardId, imageData });
                return true;
            } catch (error) {
                console.error('Error capturing dashboard preview:', error);
                return false;
            }
        },
        [setPreview]
    );

    /**
     * Gets the preview image for a specific dashboard
     *
     * @param dashboardId - The ID of the dashboard
     * @returns The Base64 Data URL of the preview image, or null if not found
     */
    const getPreview = useCallback(
        (dashboardId: string): string | null => {
            return previews[dashboardId] || null;
        },
        [previews]
    );

    /**
     * Deletes the preview image for a specific dashboard
     *
     * @param dashboardId - The ID of the dashboard
     */
    const removePreview = useCallback(
        (dashboardId: string): void => {
            deletePreview(dashboardId);
        },
        [deletePreview]
    );

    return {
        capturePreview,
        getPreview,
        removePreview,
        previews,
    };
}
