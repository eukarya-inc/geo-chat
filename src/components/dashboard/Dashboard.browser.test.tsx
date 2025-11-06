import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { Dashboard } from './Dashboard';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { Layout } from 'react-grid-layout';

describe('Dashboard Copy to Clipboard (Browser)', () => {
    let mockDBContext: DBContext;

    beforeEach(() => {
        // Mock DBContext
        mockDBContext = {
            executeQuery: async () => [],
            getConnection: () => null,
        } as unknown as DBContext;

        // Grant clipboard permissions
        Object.defineProperty(navigator, 'permissions', {
            value: {
                query: async () => ({ state: 'granted' }),
            },
            writable: true,
            configurable: true,
        });
    });

    it('should successfully copy dashboard with OKLCH colors using html-to-image', async () => {
        const user = userEvent.setup();

        render(
            <Dashboard
                dashboard={{
                    id: 'test-dashboard',
                    title: 'Test Dashboard with OKLCH Colors',
                    createdAt: new Date(),
                    visualizations: [
                        {
                            id: 'viz-1',
                            type: 'chart',
                            title: 'Sample Chart',
                            createdAt: new Date(),
                            chatId: 'chat-1',
                            chartSpec: {
                                id: 'chart-1',
                                title: 'Sample Chart',
                                spec: {
                                    mark: 'bar',
                                    encoding: {},
                                    data: { values: [] },
                                },
                                timestamp: new Date(),
                            },
                        },
                    ],
                    layout: [
                        {
                            i: 'viz-1',
                            x: 0,
                            y: 0,
                            w: 6,
                            h: 4,
                        } as Layout,
                    ],
                }}
                dbContext={mockDBContext}
                onLayoutChange={() => {}}
                onRemoveVisualization={() => {}}
                onAddVisualization={() => {}}
                onDeleteVisualization={() => {}}
                onUpdateDashboard={() => {}}
            />
        );

        // Wait for layout to render
        await waitFor(() => {
            expect(document.querySelector('.layout')).toBeInTheDocument();
        });

        // Add explicit OKLCH color element to verify html-to-image handles OKLCH correctly
        // This is the core test: html2canvas didn't support OKLCH, html-to-image does
        const layoutContainer = document.querySelector('.layout');
        expect(layoutContainer).toBeInTheDocument();

        const testDiv = document.createElement('div');
        testDiv.id = 'oklch-test-element';
        testDiv.textContent = 'OKLCH Test';
        testDiv.style.cssText = `
            background-color: oklch(0.7 0.15 200);
            color: oklch(0.3 0.1 300);
            padding: 10px;
            margin: 10px;
        `;
        layoutContainer?.appendChild(testDiv);

        // Verify the OKLCH element was added and has OKLCH colors
        const oklchElement = document.getElementById('oklch-test-element');
        expect(oklchElement).toBeInTheDocument();

        const oklchStyle = window.getComputedStyle(oklchElement!);
        console.log('OKLCH element computed styles:', {
            backgroundColor: oklchStyle.backgroundColor,
            color: oklchStyle.color,
        });

        // Confirm OKLCH colors are present in the DOM (not converted to RGB by browser)
        // Modern browsers support OKLCH and preserve it in computed styles
        expect(oklchStyle.backgroundColor).toContain('oklch');
        expect(oklchStyle.color).toContain('oklch');

        const copyButton = screen.getByTestId('dashboard-copy-button');
        await user.click(copyButton);

        // Wait for success feedback (indicates html-to-image completed)
        await waitFor(
            () => {
                expect(copyButton).toHaveAttribute('title', 'コピーしました！');
            },
            { timeout: 5000 }
        );

        // Verify clipboard contains a PNG image blob created by html-to-image
        const clipboardItems = await navigator.clipboard.read();
        expect(clipboardItems.length).toBeGreaterThan(0);
        expect(clipboardItems[0].types).toContain('image/png');

        // Verify the blob is actually an image with reasonable size
        const blob = await clipboardItems[0].getType('image/png');
        expect(blob.size).toBeGreaterThan(100); // Should be at least 100 bytes for a real image
        expect(blob.type).toBe('image/png');
    });

    it('should successfully download dashboard as PNG file', async () => {
        const user = userEvent.setup();

        // Mock URL.createObjectURL and URL.revokeObjectURL
        const mockObjectURL = 'blob:mock-url';
        const createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue(mockObjectURL);
        const revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

        // Mock link.click()
        const clickSpy = vi.fn();
        const capturedLinks: HTMLAnchorElement[] = [];
        const originalCreateElement = document.createElement.bind(document);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const createElementSpy = vi.spyOn(document, 'createElement').mockImplementation((tagName: any) => {
            const element = originalCreateElement(tagName);
            if (tagName === 'a') {
                const anchor = element as HTMLAnchorElement;
                anchor.click = clickSpy;
                capturedLinks.push(anchor);
            }
            return element;
        });

        render(
            <Dashboard
                dashboard={{
                    id: 'test-dashboard',
                    title: 'Test Dashboard',
                    createdAt: new Date(),
                    visualizations: [
                        {
                            id: 'viz-1',
                            type: 'chart',
                            title: 'Sample Chart',
                            createdAt: new Date(),
                            chatId: 'chat-1',
                            chartSpec: {
                                id: 'chart-1',
                                title: 'Sample Chart',
                                spec: {
                                    mark: 'bar',
                                    encoding: {},
                                    data: { values: [] },
                                },
                                timestamp: new Date(),
                            },
                        },
                    ],
                    layout: [
                        {
                            i: 'viz-1',
                            x: 0,
                            y: 0,
                            w: 6,
                            h: 4,
                        } as Layout,
                    ],
                }}
                dbContext={mockDBContext}
                onLayoutChange={() => {}}
                onRemoveVisualization={() => {}}
                onAddVisualization={() => {}}
                onDeleteVisualization={() => {}}
                onUpdateDashboard={() => {}}
            />
        );

        // Wait for layout to render
        await waitFor(() => {
            expect(document.querySelector('.layout')).toBeInTheDocument();
        });

        const downloadButton = screen.getByTestId('dashboard-download-button');
        await user.click(downloadButton);

        // Wait for download to complete
        await waitFor(
            () => {
                expect(createObjectURLSpy).toHaveBeenCalled();
                expect(clickSpy).toHaveBeenCalled();
                expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockObjectURL);
            },
            { timeout: 5000 }
        );

        // Verify the created link has correct attributes
        expect(capturedLinks.length).toBeGreaterThan(0);
        const link = capturedLinks[0];
        expect(link.href).toContain(mockObjectURL);
        expect(link.download).toMatch(/^Test_Dashboard_.*\.png$/);

        // Cleanup
        createObjectURLSpy.mockRestore();
        revokeObjectURLSpy.mockRestore();
        createElementSpy.mockRestore();
    });
});
