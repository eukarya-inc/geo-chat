import { useCallback } from 'react';
import { useAtom } from 'jotai';
import { Layout } from 'react-grid-layout';
import { remoteStateAtom, Dashboard, DashboardVisualization } from '../../../store/remoteAtoms';

export function useDashboardManagement() {
    const [remoteState, setRemoteState] = useAtom(remoteStateAtom);
    
    // Debug: Log the current state whenever it changes
    console.log('useDashboardManagement: remoteState changed, dashboard count:', Object.keys(remoteState.dashboards).length);

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
        console.log('useDashboardManagement: updateDashboard called with:', dashboard.title);
        console.log('useDashboardManagement: dashboard visualizations:', dashboard.visualizations.length);
        console.log('useDashboardManagement: dashboard ID:', dashboard.id);
        console.log('useDashboardManagement: dashboard object:', dashboard);
        
        // Ensure the dashboard object is properly structured
        const sanitizedDashboard: Dashboard = {
            id: dashboard.id,
            title: dashboard.title,
            createdAt: dashboard.createdAt,
            visualizations: [...dashboard.visualizations], // Create a new array
            layout: [...dashboard.layout] // Create a new array
        };
        
        console.log('useDashboardManagement: sanitized dashboard:', sanitizedDashboard);
        
        setRemoteState(prev => {
            console.log('useDashboardManagement: Previous state dashboards:', Object.keys(prev.dashboards));
            console.log('useDashboardManagement: Previous dashboard visualizations:', prev.dashboards[dashboard.id]?.visualizations.length || 0);
            
            // Create completely new state object
            const newState: typeof prev = {
                chats: prev.chats,
                dashboards: {
                    ...prev.dashboards,
                    [sanitizedDashboard.id]: sanitizedDashboard
                }
            };
            
            console.log('useDashboardManagement: New state dashboards:', Object.keys(newState.dashboards));
            console.log('useDashboardManagement: Updated dashboard in state:', newState.dashboards[sanitizedDashboard.id]);
            console.log('useDashboardManagement: Updated dashboard visualizations:', newState.dashboards[sanitizedDashboard.id].visualizations.length);
            
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
        if (dashboard) {
            console.log('useDashboardManagement: getDashboard found dashboard:', dashboard.title);
            console.log('useDashboardManagement: dashboard visualizations:', dashboard.visualizations.length);
        } else {
            console.log('useDashboardManagement: getDashboard - dashboard not found:', dashboardId);
        }
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