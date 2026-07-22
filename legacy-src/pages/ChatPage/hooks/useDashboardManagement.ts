import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { Layout } from 'react-grid-layout';
import { remoteStateAtom, Dashboard, DashboardVisualization } from '../../../store/remoteAtoms';

/**
 * Helper function to create default layout for a visualization.
 * Extracted to avoid code duplication between export and manual add flows.
 */
export function createDefaultLayoutForVisualization(
    visualizationId: string,
    visualizationType: 'chart' | 'map' | 'table',
    layoutOverride?: Partial<Layout>
): Layout {
    return {
        i: visualizationId,
        x: 0,
        y: Infinity, // Put at bottom
        w: visualizationType === 'map' ? 8 : 6,
        h: visualizationType === 'map' ? 6 : 4,
        minW: visualizationType === 'map' ? 4 : 3,
        minH: visualizationType === 'map' ? 3 : 2,
        ...layoutOverride,
    };
}

/**
 * Helper function to add a visualization to dashboard with automatic layout creation.
 * Extracted from export handlers to make the auto-add logic testable.
 */
export function exportVisualizationToDashboard(dashboard: Dashboard, visualization: DashboardVisualization): Dashboard {
    const defaultLayout = createDefaultLayoutForVisualization(visualization.id, visualization.type);
    return {
        ...dashboard,
        visualizations: [...dashboard.visualizations, visualization],
        layout: [...dashboard.layout, defaultLayout],
    };
}

export function useDashboardManagement() {
    const [remoteState, setRemoteState] = useAtom(remoteStateAtom);

    const createDashboard = useCallback(
        (title?: string): Dashboard => {
            let newDashboard: Dashboard | null = null;

            setRemoteState(prev => {
                // Generate unique ID with timestamp and random component
                const id = `dashboard-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

                newDashboard = {
                    id,
                    title: title || `Dashboard ${Object.keys(prev.dashboards).length + 1}`,
                    createdAt: new Date(),
                    visualizations: [],
                    layout: [],
                };

                return {
                    ...prev,
                    dashboards: {
                        ...prev.dashboards,
                        [newDashboard.id]: newDashboard,
                    },
                };
            });

            return newDashboard!;
        },
        [setRemoteState]
    );

    const updateDashboard = useCallback(
        (dashboard: Dashboard) => {
            // Ensure the dashboard object is properly structured
            const sanitizedDashboard: Dashboard = {
                id: dashboard.id,
                title: dashboard.title,
                createdAt: dashboard.createdAt,
                visualizations: [...dashboard.visualizations], // Create a new array
                layout: [...dashboard.layout], // Create a new array
                responsive: dashboard.responsive,
            };

            setRemoteState(prev => {
                // Create completely new state object
                const newState: typeof prev = {
                    chats: prev.chats,
                    dashboards: {
                        ...prev.dashboards,
                        [sanitizedDashboard.id]: sanitizedDashboard,
                    },
                };

                return newState;
            });
        },
        [setRemoteState]
    );

    const deleteDashboard = useCallback(
        (dashboardId: string) => {
            setRemoteState(prev => {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { [dashboardId]: _deleted, ...remainingDashboards } = prev.dashboards;
                return {
                    ...prev,
                    dashboards: remainingDashboards,
                };
            });
        },
        [setRemoteState]
    );

    const addVisualizationToDashboard = useCallback(
        (dashboardId: string, visualization: DashboardVisualization, layout?: Layout) => {
            const dashboard = remoteState.dashboards[dashboardId];
            if (!dashboard) return;

            const defaultLayout: Layout = {
                i: visualization.id,
                x: 0,
                y: 0,
                w: 6,
                h: 4,
                minW: 3,
                minH: 2,
            };

            const updatedDashboard: Dashboard = {
                ...dashboard,
                visualizations: [...dashboard.visualizations, visualization],
                layout: [...dashboard.layout, layout || defaultLayout],
            };

            updateDashboard(updatedDashboard);
        },
        [remoteState.dashboards, updateDashboard]
    );

    const removeVisualizationFromDashboard = useCallback(
        (dashboardId: string, visualizationId: string) => {
            const dashboard = remoteState.dashboards[dashboardId];
            if (!dashboard) {
                console.error('Dashboard not found:', dashboardId);
                return;
            }

            const updatedDashboard: Dashboard = {
                ...dashboard,
                visualizations: dashboard.visualizations.filter(viz => viz.id !== visualizationId),
                layout: dashboard.layout.filter(item => item.i !== visualizationId),
            };

            updateDashboard(updatedDashboard);
        },
        [remoteState.dashboards, updateDashboard]
    );

    const updateDashboardLayout = useCallback(
        (dashboardId: string, layout: Layout[]) => {
            const dashboard = remoteState.dashboards[dashboardId];
            if (!dashboard) return;

            const updatedDashboard: Dashboard = {
                ...dashboard,
                layout,
            };

            updateDashboard(updatedDashboard);
        },
        [remoteState.dashboards, updateDashboard]
    );

    const getDashboard = useCallback(
        (dashboardId: string): Dashboard | undefined => {
            const dashboard = remoteState.dashboards[dashboardId];
            return dashboard;
        },
        [remoteState.dashboards]
    );

    const getAllDashboards = useCallback((): Dashboard[] => {
        return Object.values(remoteState.dashboards);
    }, [remoteState.dashboards]);

    const renameDashboard = useCallback(
        (dashboardId: string, newTitle: string) => {
            const dashboard = remoteState.dashboards[dashboardId];
            if (!dashboard) return;

            const updatedDashboard: Dashboard = {
                ...dashboard,
                title: newTitle.trim() || dashboard.title, // Fallback to original title if empty
            };

            updateDashboard(updatedDashboard);
        },
        [remoteState.dashboards, updateDashboard]
    );

    const hideVisualizationFromDashboard = useCallback(
        (dashboardId: string, visualizationId: string) => {
            const dashboard = remoteState.dashboards[dashboardId];
            if (!dashboard) {
                console.error('Dashboard not found:', dashboardId);
                return;
            }

            // Only remove from layout, keep in visualizations array
            const updatedDashboard: Dashboard = {
                ...dashboard,
                layout: dashboard.layout.filter(item => item.i !== visualizationId),
            };

            updateDashboard(updatedDashboard);
        },
        [remoteState.dashboards, updateDashboard]
    );

    const showVisualizationOnDashboard = useCallback(
        (dashboardId: string, visualizationId: string, layoutOverride?: Partial<Layout>) => {
            const dashboard = remoteState.dashboards[dashboardId];
            if (!dashboard) {
                console.error('Dashboard not found:', dashboardId);
                return;
            }

            // Check if already in layout
            if (dashboard.layout.some(item => item.i === visualizationId)) {
                console.warn('Visualization already on dashboard:', visualizationId);
                return;
            }

            // Find the visualization to determine default size
            const viz = dashboard.visualizations.find(v => v.id === visualizationId);
            if (!viz) {
                console.error('Visualization not found:', visualizationId);
                return;
            }

            // Create default layout based on visualization type
            const defaultLayout = createDefaultLayoutForVisualization(visualizationId, viz.type, layoutOverride);

            const updatedDashboard: Dashboard = {
                ...dashboard,
                layout: [...dashboard.layout, defaultLayout],
            };

            updateDashboard(updatedDashboard);
        },
        [remoteState.dashboards, updateDashboard]
    );

    return {
        dashboards: remoteState.dashboards,
        createDashboard,
        updateDashboard,
        deleteDashboard,
        addVisualizationToDashboard,
        removeVisualizationFromDashboard,
        hideVisualizationFromDashboard,
        showVisualizationOnDashboard,
        updateDashboardLayout,
        getDashboard,
        getAllDashboards,
        renameDashboard,
    };
}
