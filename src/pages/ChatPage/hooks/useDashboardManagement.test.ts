import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import {
    useDashboardManagement,
    exportVisualizationToDashboard,
    createDefaultLayoutForVisualization,
} from './useDashboardManagement';
import type { Dashboard, DashboardVisualization } from '../../../store/remoteAtoms';
import type { ReactNode } from 'react';
import React from 'react';

// Create a test wrapper with isolated Jotai store for each test
function createWrapper() {
    const store = createStore();
    return ({ children }: { children: ReactNode }) => React.createElement(Provider, { store }, children);
}

describe('useDashboardManagement', () => {
    let wrapper: ReturnType<typeof createWrapper>;

    beforeEach(() => {
        wrapper = createWrapper();
    });

    it('should create a new dashboard', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let newDashboard: Dashboard | undefined;

        act(() => {
            newDashboard = result.current.createDashboard('Test Dashboard');
        });

        expect(newDashboard).toEqual(
            expect.objectContaining({
                id: expect.stringMatching(/^dashboard-\d+-[a-z0-9]+$/),
                title: 'Test Dashboard',
                createdAt: expect.any(Date),
                visualizations: [],
                layout: [],
            })
        );

        // Dashboard should be added to the state
        if (newDashboard) {
            expect(result.current.dashboards[newDashboard.id]).toEqual(newDashboard);
        }
    });

    it('should create dashboard with default title when no title provided', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let newDashboard: Dashboard | undefined;

        act(() => {
            newDashboard = result.current.createDashboard();
        });

        if (newDashboard) {
            expect(newDashboard.title).toMatch(/^Dashboard \d+$/);
        }
    });

    it('should delete an existing dashboard', async () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard1: Dashboard | undefined;
        let dashboard2: Dashboard | undefined;

        // Create first dashboard
        act(() => {
            dashboard1 = result.current.createDashboard('Dashboard 1');
        });

        // Create second dashboard
        act(() => {
            dashboard2 = result.current.createDashboard('Dashboard 2');
        });

        // Ensure we have valid dashboards before proceeding
        expect(dashboard1).toBeDefined();
        expect(dashboard2).toBeDefined();
        expect(dashboard1?.id).toBeDefined();
        expect(dashboard2?.id).toBeDefined();

        // Store IDs for later verification
        const dashboard1Id = dashboard1!.id;
        const dashboard2Id = dashboard2!.id;

        // Wait for both dashboards to be created in state
        await waitFor(() => {
            expect(result.current.dashboards[dashboard1Id]).toBeDefined();
            expect(result.current.dashboards[dashboard2Id]).toBeDefined();
        });

        // Delete the first dashboard
        act(() => {
            result.current.deleteDashboard(dashboard1Id);
        });

        // Wait for deletion to complete and verify state
        await waitFor(() => {
            expect(result.current.dashboards[dashboard1Id]).toBeUndefined();
            expect(result.current.dashboards[dashboard2Id]).toBeDefined();
        });
    });

    it('should handle deleting non-existent dashboard gracefully', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        // Create one dashboard
        let dashboard: Dashboard | undefined;
        act(() => {
            dashboard = result.current.createDashboard('Test Dashboard');
        });

        const dashboardCount = Object.keys(result.current.dashboards).length;

        // Try to delete a non-existent dashboard
        act(() => {
            result.current.deleteDashboard('non-existent-id');
        });

        // Should not affect existing dashboards
        expect(Object.keys(result.current.dashboards)).toHaveLength(dashboardCount);
        if (dashboard) {
            expect(result.current.dashboards[dashboard.id]).toBeDefined();
        }
    });

    it('should update dashboard correctly', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard: Dashboard | undefined;

        act(() => {
            dashboard = result.current.createDashboard('Original Title');
        });

        if (dashboard) {
            const updatedDashboard: Dashboard = {
                ...dashboard,
                title: 'Updated Title',
            };

            act(() => {
                result.current.updateDashboard(updatedDashboard);
            });

            expect(result.current.dashboards[dashboard.id].title).toBe('Updated Title');
        }
    });

    it('should rename dashboard correctly', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard: Dashboard | undefined;

        act(() => {
            dashboard = result.current.createDashboard('Original Title');
        });

        if (dashboard) {
            act(() => {
                result.current.renameDashboard(dashboard!.id, 'New Title');
            });

            expect(result.current.dashboards[dashboard!.id].title).toBe('New Title');
        }
    });

    it('should handle renaming with empty string by keeping original title', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard: Dashboard | undefined;

        act(() => {
            dashboard = result.current.createDashboard('Original Title');
        });

        if (dashboard) {
            act(() => {
                result.current.renameDashboard(dashboard!.id, '   ');
            });

            // Should keep original title when new title is empty/whitespace
            expect(result.current.dashboards[dashboard!.id].title).toBe('Original Title');
        }
    });

    it('should get all dashboards as array', async () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard1: Dashboard | undefined;
        let dashboard2: Dashboard | undefined;

        // Create first dashboard
        act(() => {
            dashboard1 = result.current.createDashboard('Dashboard 1');
        });

        // Wait for state update
        await waitFor(() => {
            expect(dashboard1).toBeDefined();
            expect(result.current.getAllDashboards()).toHaveLength(1);
        });

        // Create second dashboard
        act(() => {
            dashboard2 = result.current.createDashboard('Dashboard 2');
        });

        // Wait for state update and verify final state
        await waitFor(() => {
            expect(dashboard2).toBeDefined();
            const allDashboards = result.current.getAllDashboards();
            expect(allDashboards).toHaveLength(2);
            if (dashboard1 && dashboard2) {
                expect(allDashboards).toContain(dashboard1);
                expect(allDashboards).toContain(dashboard2);
            }
        });
    });

    it('should get specific dashboard by id', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard: Dashboard | undefined;

        act(() => {
            dashboard = result.current.createDashboard('Test Dashboard');
        });

        if (dashboard) {
            const retrievedDashboard = result.current.getDashboard(dashboard.id);
            expect(retrievedDashboard).toEqual(dashboard);
        }

        // Should return undefined for non-existent id
        const nonExistent = result.current.getDashboard('non-existent-id');
        expect(nonExistent).toBeUndefined();
    });

    it('should remove visualization from dashboard', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        let dashboard: Dashboard | undefined;

        act(() => {
            dashboard = result.current.createDashboard('Test Dashboard');
        });

        if (!dashboard) return;

        // Add a visualization manually to test removal
        const mockVisualization = {
            id: 'viz-1',
            type: 'chart' as const,
            title: 'Test Chart',
            chatId: 'chat_1234567890',
            chartSpec: {
                id: 'chart-1',
                title: 'Test Chart',
                spec: {
                    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                    mark: { type: 'bar' as const },
                    encoding: {},
                    data: { values: [] },
                },
                timestamp: new Date(),
            },
            createdAt: new Date(),
        };

        const mockLayout = {
            i: 'viz-1',
            x: 0,
            y: 0,
            w: 6,
            h: 4,
        };

        const dashboardWithViz: Dashboard = {
            ...dashboard,
            visualizations: [mockVisualization],
            layout: [mockLayout],
        };

        act(() => {
            result.current.updateDashboard(dashboardWithViz);
        });

        // Verify visualization was added
        expect(result.current.dashboards[dashboard.id].visualizations).toHaveLength(1);
        expect(result.current.dashboards[dashboard.id].layout).toHaveLength(1);

        // Remove the visualization
        act(() => {
            result.current.removeVisualizationFromDashboard(dashboard!.id, 'viz-1');
        });

        // Verify visualization was removed
        expect(result.current.dashboards[dashboard!.id].visualizations).toHaveLength(0);
        expect(result.current.dashboards[dashboard!.id].layout).toHaveLength(0);
    });

    it('should handle removing visualization from non-existent dashboard', () => {
        const { result } = renderHook(() => useDashboardManagement(), { wrapper });

        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        act(() => {
            result.current.removeVisualizationFromDashboard('non-existent-id', 'viz-1');
        });

        expect(consoleSpy).toHaveBeenCalledWith('Dashboard not found:', 'non-existent-id');

        consoleSpy.mockRestore();
    });

    describe('exportVisualizationToDashboard', () => {
        it('should add chart visualization to dashboard with auto-generated layout', () => {
            const dashboard: Dashboard = {
                id: 'dashboard-1',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [],
                layout: [],
            };

            const chartVisualization: DashboardVisualization = {
                id: 'viz-chart-1',
                type: 'chart',
                title: 'Test Chart',
                chartSpec: {
                    id: 'chart-1',
                    title: 'Test Chart',
                    spec: {
                        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                        mark: { type: 'bar' },
                        encoding: {},
                        data: { values: [] },
                    },
                    timestamp: new Date(),
                },
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            const result = exportVisualizationToDashboard(dashboard, chartVisualization);

            // Verify visualization was added
            expect(result.visualizations).toHaveLength(1);
            expect(result.visualizations[0]).toEqual(chartVisualization);

            // Verify layout was auto-generated with correct dimensions for chart
            expect(result.layout).toHaveLength(1);
            expect(result.layout[0].i).toBe('viz-chart-1');
            expect(result.layout[0].w).toBe(6); // Chart default width
            expect(result.layout[0].h).toBe(4); // Chart default height
            expect(result.layout[0].x).toBe(0);
            expect(result.layout[0].y).toBe(Infinity); // Always at bottom
        });

        it('should add map visualization to dashboard with correct dimensions', () => {
            const dashboard: Dashboard = {
                id: 'dashboard-2',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [],
                layout: [],
            };

            const mapVisualization: DashboardVisualization = {
                id: 'viz-map-1',
                type: 'map',
                title: 'Test Map',
                mapSpec: {},
                tableId: 'table-1',
                geometryColumn: 'geom',
                sql: 'SELECT * FROM table-1',
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            const result = exportVisualizationToDashboard(dashboard, mapVisualization);

            expect(result.visualizations).toHaveLength(1);
            expect(result.layout).toHaveLength(1);
            expect(result.layout[0].i).toBe('viz-map-1');
            expect(result.layout[0].w).toBe(8); // Map default width (larger)
            expect(result.layout[0].h).toBe(6); // Map default height (larger)
        });

        it('should add table visualization to dashboard', () => {
            const dashboard: Dashboard = {
                id: 'dashboard-3',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [],
                layout: [],
            };

            const tableVisualization: DashboardVisualization = {
                id: 'viz-table-1',
                type: 'table',
                title: 'Test Table',
                tableId: 'test_table',
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            const result = exportVisualizationToDashboard(dashboard, tableVisualization);

            expect(result.visualizations).toHaveLength(1);
            expect(result.layout).toHaveLength(1);
            expect(result.layout[0].i).toBe('viz-table-1');
            expect(result.layout[0].w).toBe(6); // Table default width
            expect(result.layout[0].h).toBe(4); // Table default height
        });

        it('should preserve existing visualizations and layouts', () => {
            const existingVisualization: DashboardVisualization = {
                id: 'viz-existing',
                type: 'chart',
                title: 'Existing Chart',
                chartSpec: {
                    id: 'chart-existing',
                    title: 'Existing',
                    spec: {
                        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                        mark: { type: 'line' },
                        encoding: {},
                        data: { values: [] },
                    },
                    timestamp: new Date(),
                },
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            const dashboard: Dashboard = {
                id: 'dashboard-4',
                title: 'Test Dashboard',
                createdAt: new Date(),
                visualizations: [existingVisualization],
                layout: [{ i: 'viz-existing', x: 0, y: 0, w: 6, h: 4 }],
            };

            const newVisualization: DashboardVisualization = {
                id: 'viz-new',
                type: 'chart',
                title: 'New Chart',
                chartSpec: {
                    id: 'chart-new',
                    title: 'New',
                    spec: {
                        $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
                        mark: { type: 'bar' },
                        encoding: {},
                        data: { values: [] },
                    },
                    timestamp: new Date(),
                },
                createdAt: new Date(),
                chatId: 'chat-1',
            };

            const result = exportVisualizationToDashboard(dashboard, newVisualization);

            // Verify both old and new exist
            expect(result.visualizations).toHaveLength(2);
            expect(result.visualizations[0]).toEqual(existingVisualization);
            expect(result.visualizations[1]).toEqual(newVisualization);

            expect(result.layout).toHaveLength(2);
            expect(result.layout[0].i).toBe('viz-existing');
            expect(result.layout[1].i).toBe('viz-new');
        });
    });

    describe('createDefaultLayoutForVisualization', () => {
        it('should create layout with chart dimensions', () => {
            const layout = createDefaultLayoutForVisualization('viz-1', 'chart');

            expect(layout.i).toBe('viz-1');
            expect(layout.x).toBe(0);
            expect(layout.y).toBe(Infinity);
            expect(layout.w).toBe(6);
            expect(layout.h).toBe(4);
            expect(layout.minW).toBe(3);
            expect(layout.minH).toBe(2);
        });

        it('should create layout with map dimensions', () => {
            const layout = createDefaultLayoutForVisualization('viz-2', 'map');

            expect(layout.i).toBe('viz-2');
            expect(layout.w).toBe(8);
            expect(layout.h).toBe(6);
            expect(layout.minW).toBe(4);
            expect(layout.minH).toBe(3);
        });

        it('should create layout with table dimensions', () => {
            const layout = createDefaultLayoutForVisualization('viz-3', 'table');

            expect(layout.i).toBe('viz-3');
            expect(layout.w).toBe(6);
            expect(layout.h).toBe(4);
        });

        it('should apply layout override', () => {
            const layout = createDefaultLayoutForVisualization('viz-4', 'chart', {
                x: 5,
                y: 10,
                w: 10,
                h: 8,
            });

            expect(layout.i).toBe('viz-4');
            expect(layout.x).toBe(5);
            expect(layout.y).toBe(10);
            expect(layout.w).toBe(10);
            expect(layout.h).toBe(8);
            // Original minW/minH should be preserved
            expect(layout.minW).toBe(3);
            expect(layout.minH).toBe(2);
        });
    });
});
