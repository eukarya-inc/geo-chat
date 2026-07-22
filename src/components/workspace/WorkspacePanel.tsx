import { useAtom } from 'jotai';
import { lazy, Suspense } from 'react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SqlPanel } from '@/components/workspace/SqlPanel';
import { TablePanel } from '@/components/workspace/TablePanel';
import { activeTabAtom, type WorkspaceTab } from '@/store/atoms';

// Chart and Map pull in heavy libs (vega, maplibre-gl); load them only when
// their tab is opened. Radix unmounts inactive tabs, so this also code-splits.
const ChartPanel = lazy(() => import('@/components/workspace/ChartPanel').then(m => ({ default: m.ChartPanel })));
const MapPanel = lazy(() => import('@/components/map/MapPanel').then(m => ({ default: m.MapPanel })));

const TABS = [
    { value: 'table', label: 'Table', content: <TablePanel /> },
    { value: 'chart', label: 'Chart', content: <ChartPanel /> },
    { value: 'map', label: 'Map', content: <MapPanel /> },
    { value: 'sql', label: 'SQL', content: <SqlPanel /> },
];

export function WorkspacePanel() {
    // Controlled by a shared atom so AI tools can switch tabs to reveal their output.
    const [activeTab, setActiveTab] = useAtom(activeTabAtom);
    return (
        <Tabs
            value={activeTab}
            onValueChange={value => setActiveTab(value as WorkspaceTab)}
            className="flex h-full flex-col gap-0"
        >
            <div className="border-b px-3 py-2">
                <TabsList>
                    {TABS.map(tab => (
                        <TabsTrigger key={tab.value} value={tab.value}>
                            {tab.label}
                        </TabsTrigger>
                    ))}
                </TabsList>
            </div>
            {TABS.map(tab => (
                <TabsContent key={tab.value} value={tab.value} className="min-h-0 flex-1">
                    <Suspense fallback={<div className="text-muted-foreground p-4 text-sm">Loading…</div>}>
                        {tab.content}
                    </Suspense>
                </TabsContent>
            ))}
        </Tabs>
    );
}
