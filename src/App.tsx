import { useSetAtom } from 'jotai';
import { Settings } from 'lucide-react';

import { ChatPanel } from '@/components/chat/ChatPanel';
import { SettingsDialog } from '@/components/settings/SettingsDialog';
import { WorkspacePanel } from '@/components/workspace/WorkspacePanel';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { settingsOpenAtom } from '@/store/atoms';

function App() {
    const openSettings = useSetAtom(settingsOpenAtom);
    return (
        <div className="flex h-full flex-col">
            <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
                <h1 className="text-sm font-semibold tracking-tight">geo-chat</h1>
                <Button variant="ghost" size="icon" aria-label="Settings" onClick={() => openSettings(true)}>
                    <Settings />
                </Button>
            </header>
            <SettingsDialog />
            <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
                <ResizablePanel defaultSize={35} minSize={20}>
                    <ChatPanel />
                </ResizablePanel>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={65} minSize={30}>
                    <WorkspacePanel />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}

export default App;
