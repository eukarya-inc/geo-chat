import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Provider, createStore } from 'jotai';
import { useDashboardManagement } from './useDashboardManagement';
import type { Dashboard } from '../../../store/remoteAtoms';
import type { ReactNode } from 'react';
import React from 'react';

// Create a test wrapper with isolated Jotai store for each test
function createWrapper() {
  const store = createStore();
  return ({ children }: { children: ReactNode }) =>
    React.createElement(Provider, { store }, children);
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
        id: expect.stringMatching(/^dashboard-\d+$/),
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

    // Create two dashboards with small delay to ensure unique IDs
    act(() => {
      dashboard1 = result.current.createDashboard('Dashboard 1');
    });

    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1));

    act(() => {
      dashboard2 = result.current.createDashboard('Dashboard 2');
    });

    if (dashboard1 && dashboard2) {
      // Verify both dashboards exist
      expect(result.current.dashboards[dashboard1.id]).toBeDefined();
      expect(result.current.dashboards[dashboard2.id]).toBeDefined();

      // Delete the first dashboard
      act(() => {
        result.current.deleteDashboard(dashboard1!.id);
      });

      // First dashboard should be deleted, second should remain
      expect(result.current.dashboards[dashboard1.id]).toBeUndefined();
      expect(result.current.dashboards[dashboard2.id]).toBeDefined();
    }
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

    // Create two dashboards with small delay to ensure unique IDs
    act(() => {
      dashboard1 = result.current.createDashboard('Dashboard 1');
    });

    // Small delay to ensure different timestamp
    await new Promise(resolve => setTimeout(resolve, 1));

    act(() => {
      dashboard2 = result.current.createDashboard('Dashboard 2');
    });

    const allDashboards = result.current.getAllDashboards();

    expect(allDashboards).toHaveLength(2);
    if (dashboard1 && dashboard2) {
      expect(allDashboards).toContain(dashboard1);
      expect(allDashboards).toContain(dashboard2);
    }
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
      chartSpec: {
        id: 'chart-1',
        title: 'Test Chart',
        spec: {
          $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
          mark: { type: 'bar' as const },
          encoding: {},
          data: { values: [] }
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
});