import { act, render, screen, waitFor } from '@testing-library/react';
import { getDefaultStore } from 'jotai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { defaultToolContext } from '@/lib/ai/toolContext';
import { activeTabAtom } from '@/store/atoms';
import { WorkspacePanel } from './WorkspacePanel';

// The Map/Chart panels lazy-load maplibre-gl / vega, which are heavy and not
// worth exercising here — we only care that the tab wiring reacts to tool calls.
vi.mock('@/components/map/MapPanel', () => ({
    MapPanel: () => <div>map-panel</div>,
}));
vi.mock('@/components/workspace/ChartPanel', () => ({
    ChartPanel: () => <div>chart-panel</div>,
}));

afterEach(() => {
    // Reset the shared default store between tests.
    getDefaultStore().set(activeTabAtom, 'table');
});

describe('WorkspacePanel + tool context share the jotai default store', () => {
    // Regression guard: main.tsx must NOT wrap the app in a jotai <Provider>
    // without a `store` prop. If it does, the UI reads an isolated store while
    // defaultToolContext() (getDefaultStore) writes to the default store, so
    // agent tool side-effects like setActiveTab never reach the UI. Because the
    // UI here renders under the default store (no Provider), a tool write must
    // switch the visible tab.
    it('switches the active tab when a tool calls setActiveTab', async () => {
        render(<WorkspacePanel />);

        // Starts on the Table tab.
        expect(screen.getByRole('tab', { name: 'Table', selected: true })).toBeInTheDocument();
        expect(screen.getByRole('tab', { name: 'Map', selected: false })).toBeInTheDocument();

        // A tool (running outside React, via the default store) opens the Map tab.
        // Async act so the lazy MapPanel's Suspense resolves inside act(...).
        await act(async () => {
            defaultToolContext().setActiveTab('map');
            await Promise.resolve();
        });

        await waitFor(() => {
            expect(screen.getByRole('tab', { name: 'Map', selected: true })).toBeInTheDocument();
        });
        expect(await screen.findByText('map-panel')).toBeInTheDocument();
    });
});
