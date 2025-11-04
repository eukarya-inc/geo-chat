import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'jotai';
import {
    dashboardPreviewsAtom,
    setDashboardPreviewAtom,
    deleteDashboardPreviewAtom,
    getDashboardPreviewAtom,
} from './previewAtoms';

describe('previewAtoms', () => {
    let store: ReturnType<typeof createStore>;

    beforeEach(() => {
        store = createStore();
        // Clear localStorage before each test
        localStorage.clear();
    });

    describe('dashboardPreviewsAtom', () => {
        it('should initialize with empty object', () => {
            const previews = store.get(dashboardPreviewsAtom);
            expect(previews).toEqual({});
        });

        it('should persist to localStorage', () => {
            const testData = {
                'dashboard-1': 'data:image/jpeg;base64,test1',
                'dashboard-2': 'data:image/jpeg;base64,test2',
            };

            store.set(dashboardPreviewsAtom, testData);

            const stored = localStorage.getItem('dashboardPreviews');
            expect(stored).toBeTruthy();
            expect(JSON.parse(stored!)).toEqual(testData);
        });

        it('should sync changes to localStorage automatically', () => {
            const testData = {
                'dashboard-1': 'data:image/jpeg;base64,test1',
            };

            // Set data through the atom
            store.set(dashboardPreviewsAtom, testData);

            // Verify it was persisted
            const stored = localStorage.getItem('dashboardPreviews');
            expect(stored).toBeTruthy();
            expect(JSON.parse(stored!)).toEqual(testData);

            // Update the data
            const updatedData = {
                ...testData,
                'dashboard-2': 'data:image/jpeg;base64,test2',
            };
            store.set(dashboardPreviewsAtom, updatedData);

            // Verify the update was persisted
            const storedUpdated = localStorage.getItem('dashboardPreviews');
            expect(storedUpdated).toBeTruthy();
            expect(JSON.parse(storedUpdated!)).toEqual(updatedData);
        });
    });

    describe('setDashboardPreviewAtom', () => {
        it('should add new preview image', () => {
            const dashboardId = 'dashboard-1';
            const imageData = 'data:image/jpeg;base64,testImage';

            store.set(setDashboardPreviewAtom, { dashboardId, imageData });

            const previews = store.get(dashboardPreviewsAtom);
            expect(previews[dashboardId]).toBe(imageData);
        });

        it('should update existing preview image', () => {
            const dashboardId = 'dashboard-1';
            const initialImage = 'data:image/jpeg;base64,initial';
            const updatedImage = 'data:image/jpeg;base64,updated';

            // Set initial image
            store.set(setDashboardPreviewAtom, { dashboardId, imageData: initialImage });
            expect(store.get(dashboardPreviewsAtom)[dashboardId]).toBe(initialImage);

            // Update image
            store.set(setDashboardPreviewAtom, { dashboardId, imageData: updatedImage });
            expect(store.get(dashboardPreviewsAtom)[dashboardId]).toBe(updatedImage);
        });

        it('should not affect other preview images', () => {
            const dashboard1 = 'dashboard-1';
            const dashboard2 = 'dashboard-2';
            const image1 = 'data:image/jpeg;base64,image1';
            const image2 = 'data:image/jpeg;base64,image2';

            store.set(setDashboardPreviewAtom, { dashboardId: dashboard1, imageData: image1 });
            store.set(setDashboardPreviewAtom, { dashboardId: dashboard2, imageData: image2 });

            const previews = store.get(dashboardPreviewsAtom);
            expect(previews[dashboard1]).toBe(image1);
            expect(previews[dashboard2]).toBe(image2);
        });
    });

    describe('deleteDashboardPreviewAtom', () => {
        it('should delete preview image', () => {
            const dashboardId = 'dashboard-1';
            const imageData = 'data:image/jpeg;base64,testImage';

            // Add image
            store.set(setDashboardPreviewAtom, { dashboardId, imageData });
            expect(store.get(dashboardPreviewsAtom)[dashboardId]).toBe(imageData);

            // Delete image
            store.set(deleteDashboardPreviewAtom, dashboardId);
            expect(store.get(dashboardPreviewsAtom)[dashboardId]).toBeUndefined();
        });

        it('should not affect other preview images when deleting', () => {
            const dashboard1 = 'dashboard-1';
            const dashboard2 = 'dashboard-2';
            const image1 = 'data:image/jpeg;base64,image1';
            const image2 = 'data:image/jpeg;base64,image2';

            // Add two images
            store.set(setDashboardPreviewAtom, { dashboardId: dashboard1, imageData: image1 });
            store.set(setDashboardPreviewAtom, { dashboardId: dashboard2, imageData: image2 });

            // Delete first image
            store.set(deleteDashboardPreviewAtom, dashboard1);

            const previews = store.get(dashboardPreviewsAtom);
            expect(previews[dashboard1]).toBeUndefined();
            expect(previews[dashboard2]).toBe(image2);
        });

        it('should handle deleting non-existent preview', () => {
            const dashboardId = 'non-existent';

            // Should not throw error
            expect(() => {
                store.set(deleteDashboardPreviewAtom, dashboardId);
            }).not.toThrow();

            const previews = store.get(dashboardPreviewsAtom);
            expect(previews).toEqual({});
        });
    });

    describe('getDashboardPreviewAtom', () => {
        it('should return preview image when it exists', () => {
            const dashboardId = 'dashboard-1';
            const imageData = 'data:image/jpeg;base64,testImage';

            store.set(setDashboardPreviewAtom, { dashboardId, imageData });

            const getPreview = store.get(getDashboardPreviewAtom);
            expect(getPreview(dashboardId)).toBe(imageData);
        });

        it('should return null when preview does not exist', () => {
            const getPreview = store.get(getDashboardPreviewAtom);
            expect(getPreview('non-existent')).toBeNull();
        });

        it('should return null after preview is deleted', () => {
            const dashboardId = 'dashboard-1';
            const imageData = 'data:image/jpeg;base64,testImage';

            store.set(setDashboardPreviewAtom, { dashboardId, imageData });
            store.set(deleteDashboardPreviewAtom, dashboardId);

            const getPreview = store.get(getDashboardPreviewAtom);
            expect(getPreview(dashboardId)).toBeNull();
        });
    });
});
