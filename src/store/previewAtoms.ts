import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';

/**
 * Dashboard preview images state management
 *
 * NOTE: This atom is intentionally separated from the main remote state atoms.
 * Reason: We plan to migrate some state management to backend storage in the future.
 * By keeping preview images in a separate atom, we can easily distinguish between:
 * - Data that will be stored on the backend (dashboard structure, visualizations, etc.)
 * - Data that remains client-side (preview images, UI state, etc.)
 *
 * This separation allows for a smoother transition when implementing backend storage
 * without having to refactor the entire state management structure.
 */

/**
 * Stores dashboard preview images as Base64 Data URLs
 * Key: Dashboard ID
 * Value: Base64 Data URL string (JPEG format)
 */
export const dashboardPreviewsAtom = atomWithStorage<Record<string, string>>('dashboardPreviews', {});

/**
 * Derived atom to get a specific dashboard's preview image
 */
export const getDashboardPreviewAtom = atom(get => (dashboardId: string) => {
    const previews = get(dashboardPreviewsAtom);
    return previews[dashboardId] || null;
});

/**
 * Derived atom to set a dashboard's preview image
 */
export const setDashboardPreviewAtom = atom(
    null,
    (get, set, { dashboardId, imageData }: { dashboardId: string; imageData: string }) => {
        const previews = get(dashboardPreviewsAtom);
        set(dashboardPreviewsAtom, {
            ...previews,
            [dashboardId]: imageData,
        });
    }
);

/**
 * Derived atom to delete a dashboard's preview image
 */
export const deleteDashboardPreviewAtom = atom(null, (get, set, dashboardId: string) => {
    const previews = get(dashboardPreviewsAtom);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { [dashboardId]: _deleted, ...rest } = previews;
    set(dashboardPreviewsAtom, rest);
});
