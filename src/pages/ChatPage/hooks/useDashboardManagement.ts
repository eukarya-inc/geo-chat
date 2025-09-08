import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { Layout } from 'react-grid-layout';
import { remoteStateAtom, Dashboard, DashboardVisualization } from '../../../store/remoteAtoms';

export function useDashboardManagement() {
    const [remoteState, setRemoteState] = useAtom(remoteStateAtom);
    

    const createDashboard = useCallback((title?: string): Dashboard => {
        const newDashboard: Dashboard = {
            id: `dashboard-${Date.now()}`,
            title: title || `Dashboard ${Object.keys(remoteState.dashboards).length + 1}`,
            createdAt: new Date(),
            visualizations: [],
            layout: []
        };

        setRemoteState(prev => ({
            ...prev,
            dashboards: {
                ...prev.dashboards,
                [newDashboard.id]: newDashboard
            }
        }));

        return newDashboard;
    }, [remoteState.dashboards, setRemoteState]);

    const updateDashboard = useCallback((dashboard: Dashboard) => {
        
        // Ensure the dashboard object is properly structured
        const sanitizedDashboard: Dashboard = {
            id: dashboard.id,
            title: dashboard.title,
            createdAt: dashboard.createdAt,
            visualizations: [...dashboard.visualizations], // Create a new array
            layout: [...dashboard.layout] // Create a new array
        };
        
        
        setRemoteState(prev => {
            
            // Create completely new state object
            const newState: typeof prev = {
                chats: prev.chats,
                dashboards: {
                    ...prev.dashboards,
                    [sanitizedDashboard.id]: sanitizedDashboard
                }
            };
            
            
            return newState;
        });
    }, [setRemoteState]);

    const deleteDashboard = useCallback((dashboardId: string) => {
        setRemoteState(prev => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { [dashboardId]: _deleted, ...remainingDashboards } = prev.dashboards;
            return {
                ...prev,
                dashboards: remainingDashboards
            };
        });
    }, [setRemoteState]);

    const addVisualizationToDashboard = useCallback((
        dashboardId: string,
        visualization: DashboardVisualization,
        layout?: Layout
    ) => {
        const dashboard = remoteState.dashboards[dashboardId];
        if (!dashboard) return;

        const defaultLayout: Layout = {
            i: visualization.id,
            x: 0,
            y: 0,
            w: 6,
            h: 4,
            minW: 3,
            minH: 2
        };

        const updatedDashboard: Dashboard = {
            ...dashboard,
            visualizations: [...dashboard.visualizations, visualization],
            layout: [...dashboard.layout, layout || defaultLayout]
        };

        updateDashboard(updatedDashboard);
    }, [remoteState.dashboards, updateDashboard]);

    const removeVisualizationFromDashboard = useCallback((
        dashboardId: string,
        visualizationId: string
    ) => {
        const dashboard = remoteState.dashboards[dashboardId];
        if (!dashboard) return;

        const updatedDashboard: Dashboard = {
            ...dashboard,
            visualizations: dashboard.visualizations.filter(viz => viz.id !== visualizationId),
            layout: dashboard.layout.filter(item => item.i !== visualizationId)
        };

        updateDashboard(updatedDashboard);
    }, [remoteState.dashboards, updateDashboard]);

    const updateDashboardLayout = useCallback((
        dashboardId: string,
        layout: Layout[]
    ) => {
        const dashboard = remoteState.dashboards[dashboardId];
        if (!dashboard) return;

        const updatedDashboard: Dashboard = {
            ...dashboard,
            layout
        };

        updateDashboard(updatedDashboard);
    }, [remoteState.dashboards, updateDashboard]);

    const getDashboard = useCallback((dashboardId: string): Dashboard | undefined => {
        const dashboard = remoteState.dashboards[dashboardId];
        return dashboard;
    }, [remoteState.dashboards]);

    const getAllDashboards = useCallback((): Dashboard[] => {
        return Object.values(remoteState.dashboards);
    }, [remoteState.dashboards]);

    return {
        dashboards: remoteState.dashboards,
        createDashboard,
        updateDashboard,
        deleteDashboard,
        addVisualizationToDashboard,
        removeVisualizationFromDashboard,
        updateDashboardLayout,
        getDashboard,
        getAllDashboards
    };
}