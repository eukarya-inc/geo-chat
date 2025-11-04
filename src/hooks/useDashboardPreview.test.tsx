import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { useDashboardPreview } from './useDashboardPreview';
import * as screenshotUtils from '../utils/screenshotUtils';

// Mock the screenshot utils
vi.mock('../utils/screenshotUtils', () => ({
    captureDashboardScreenshot: vi.fn(),
}));

describe('useDashboardPreview', () => {
    let store: ReturnType<typeof createStore>;

    beforeEach(() => {
        store = createStore();
        localStorage.clear();
        vi.clearAllMocks();
    });

    const wrapper = ({ children }: { children: React.ReactNode }) => <Provider store={store}>{children}</Provider>;

    describe('capturePreview', () => {
        it('should capture and save preview successfully', async () => {
            const dashboardId = 'dashboard-1';
            const mockImageData = 'data:image/jpeg;base64,mockImage';

            vi.mocked(screenshotUtils.captureDashboardScreenshot).mockResolvedValue(mockImageData);

            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            let captureResult: boolean = false;
            await act(async () => {
                captureResult = await result.current.capturePreview(dashboardId);
            });

            expect(captureResult).toBe(true);
            expect(screenshotUtils.captureDashboardScreenshot).toHaveBeenCalledWith(dashboardId);
            expect(result.current.getPreview(dashboardId)).toBe(mockImageData);
        });

        it('should return false when screenshot capture fails', async () => {
            const dashboardId = 'dashboard-1';

            vi.mocked(screenshotUtils.captureDashboardScreenshot).mockResolvedValue(null);

            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            let captureResult: boolean = true;
            await act(async () => {
                captureResult = await result.current.capturePreview(dashboardId);
            });

            expect(captureResult).toBe(false);
            expect(result.current.getPreview(dashboardId)).toBeNull();
        });

        it('should handle errors during capture', async () => {
            const dashboardId = 'dashboard-1';
            const error = new Error('Screenshot failed');

            vi.mocked(screenshotUtils.captureDashboardScreenshot).mockRejectedValue(error);

            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            let captureResult: boolean = true;
            await act(async () => {
                captureResult = await result.current.capturePreview(dashboardId);
            });

            expect(captureResult).toBe(false);
        });
    });

    describe('getPreview', () => {
        it('should return preview image when it exists', async () => {
            const dashboardId = 'dashboard-1';
            const mockImageData = 'data:image/jpeg;base64,mockImage';

            vi.mocked(screenshotUtils.captureDashboardScreenshot).mockResolvedValue(mockImageData);

            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            // Capture preview
            await act(async () => {
                await result.current.capturePreview(dashboardId);
            });

            // Get preview
            expect(result.current.getPreview(dashboardId)).toBe(mockImageData);
        });

        it('should return null when preview does not exist', () => {
            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            expect(result.current.getPreview('non-existent')).toBeNull();
        });
    });

    describe('removePreview', () => {
        it('should remove preview image', async () => {
            const dashboardId = 'dashboard-1';
            const mockImageData = 'data:image/jpeg;base64,mockImage';

            vi.mocked(screenshotUtils.captureDashboardScreenshot).mockResolvedValue(mockImageData);

            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            // Capture preview
            await act(async () => {
                await result.current.capturePreview(dashboardId);
            });

            expect(result.current.getPreview(dashboardId)).toBe(mockImageData);

            // Remove preview
            act(() => {
                result.current.removePreview(dashboardId);
            });

            expect(result.current.getPreview(dashboardId)).toBeNull();
        });

        it('should not throw when removing non-existent preview', () => {
            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            expect(() => {
                act(() => {
                    result.current.removePreview('non-existent');
                });
            }).not.toThrow();
        });
    });

    describe('previews', () => {
        it('should return all previews', async () => {
            const dashboard1 = 'dashboard-1';
            const dashboard2 = 'dashboard-2';
            const image1 = 'data:image/jpeg;base64,image1';
            const image2 = 'data:image/jpeg;base64,image2';

            vi.mocked(screenshotUtils.captureDashboardScreenshot)
                .mockResolvedValueOnce(image1)
                .mockResolvedValueOnce(image2);

            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            // Capture two previews
            await act(async () => {
                await result.current.capturePreview(dashboard1);
                await result.current.capturePreview(dashboard2);
            });

            const previews = result.current.previews;
            expect(previews).toEqual({
                [dashboard1]: image1,
                [dashboard2]: image2,
            });
        });

        it('should return empty object when no previews exist', () => {
            const { result } = renderHook(() => useDashboardPreview(), { wrapper });

            expect(result.current.previews).toEqual({});
        });
    });
});
