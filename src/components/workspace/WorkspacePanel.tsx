import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ChartPlaceholder, MapPlaceholder, TablePlaceholder } from '@/components/workspace/placeholders';
import { SqlPanel } from '@/components/workspace/SqlPanel';

const TABS = [
    { value: 'table', label: 'Table', content: <TablePlaceholder /> },
    { value: 'chart', label: 'Chart', content: <ChartPlaceholder /> },
    { value: 'map', label: 'Map', content: <MapPlaceholder /> },
    { value: 'sql', label: 'SQL', content: <SqlPanel /> },
];

export function WorkspacePanel() {
    return (
        <Tabs defaultValue="table" className="flex h-full flex-col gap-0">
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
                    {tab.content}
                </TabsContent>
            ))}
        </Tabs>
    );
}
