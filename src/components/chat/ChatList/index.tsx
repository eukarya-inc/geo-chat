import { ChatBubbleLeftRightIcon, PresentationChartBarIcon } from '@heroicons/react/24/outline';
import type { StructuredMessage } from '../../../types/message';
import type { MapSpec } from '../../../store/remoteAtoms';

export type ChatType = 'graph';

export interface Chat {
    id: string;
    title: string;
    createdAt: Date;
    messages: StructuredMessage[];
    schemaName?: string;
    selectedTable?: string | null;
    mapSpecs?: Record<string, MapSpec>;
    isTitleDefault?: boolean;
}

interface ChatListProps {
    selectedView?: 'chat' | 'dashboard-list';
    onNavigate?: (view: 'chat' | 'dashboard-list') => void;
}

export function ChatList({ selectedView, onNavigate }: ChatListProps) {
    return (
        <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto p-2">
                {/* Navigation Buttons */}
                <div className="space-y-1">
                    <button
                        onClick={() => onNavigate?.('chat')}
                        className={`w-full px-4 py-3 text-left text-sm font-medium rounded transition-colors flex items-center gap-2 ${
                            selectedView === 'chat' ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100'
                        }`}
                    >
                        <ChatBubbleLeftRightIcon className="w-5 h-5" />
                        <span>チャット</span>
                    </button>

                    <button
                        onClick={() => onNavigate?.('dashboard-list')}
                        className={`w-full px-4 py-3 text-left text-sm font-medium rounded transition-colors flex items-center gap-2 ${
                            selectedView === 'dashboard-list'
                                ? 'bg-blue-50 border border-blue-200'
                                : 'hover:bg-gray-100'
                        }`}
                    >
                        <PresentationChartBarIcon className="w-5 h-5" />
                        <span>ダッシュボード</span>
                    </button>
                </div>
            </div>
        </div>
    );
}
