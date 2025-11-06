import { describe, it, expect, beforeEach } from 'vitest';
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

    it('should show copy button in dashboard header', () => {
        render(
            <Dashboard
                dashboard={{
                    id: 'test-dashboard',
                    title: 'Test Dashboard',
                    createdAt: new Date(),
                    visualizations: [],
                    layout: [],
                }}
                dbContext={mockDBContext}
                onLayoutChange={() => {}}
                onRemoveVisualization={() => {}}
                onAddVisualization={() => {}}
                onDeleteVisualization={() => {}}
                onUpdateDashboard={() => {}}
            />
        );

        const copyButton = screen.getByTestId('dashboard-copy-button');
        expect(copyButton).toBeInTheDocument();
        expect(copyButton).toHaveAttribute('title', 'クリップボードにコピー');
    });

    it('should copy dashboard to clipboard when copy button is clicked', async () => {
        const user = userEvent.setup();

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
                            title: 'Test Chart',
                            createdAt: new Date(),
                            chatId: 'chat-1',
                            chartSpec: {
                                id: 'chart-1',
                                title: 'Test Chart',
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

        const copyButton = screen.getByTestId('dashboard-copy-button');
        await user.click(copyButton);

        // Wait for success feedback to appear (indicates copy operation completed)
        await waitFor(
            () => {
                expect(screen.getByTestId('dashboard-copy-button')).toHaveAttribute('title', 'コピーしました！');
            },
            { timeout: 5000 }
        );

        // Verify that clipboard now contains an image
        // Note: We can't directly verify clipboard contents in tests due to security restrictions,
        // but we can verify that the operation completed successfully (feedback shown)
        const clipboardItems = await navigator.clipboard.read();
        expect(clipboardItems.length).toBeGreaterThan(0);

        // Check that first item has image/png type
        const types = clipboardItems[0].types;
        expect(types).toContain('image/png');
    });

    it('should show and hide success feedback', async () => {
        const user = userEvent.setup();

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
                            title: 'Test Chart',
                            createdAt: new Date(),
                            chatId: 'chat-1',
                            chartSpec: {
                                id: 'chart-1',
                                title: 'Test Chart',
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

        const copyButton = screen.getByTestId('dashboard-copy-button');

        // Initial state
        expect(copyButton).toHaveAttribute('title', 'クリップボードにコピー');

        await user.click(copyButton);

        // Wait for success feedback
        await waitFor(
            () => {
                expect(copyButton).toHaveAttribute('title', 'コピーしました！');
            },
            { timeout: 5000 }
        );

        // Wait for feedback to disappear
        await waitFor(
            () => {
                expect(copyButton).toHaveAttribute('title', 'クリップボードにコピー');
            },
            { timeout: 2500 }
        );
    });
});
