import { PlusIcon, PresentationChartBarIcon } from '@heroicons/react/24/outline';

interface ChatListProps {
    onCreateChat: () => void | Promise<void>;
    onCreateDashboard?: () => void;
    isInitialized?: boolean;
    selectedView?: 'datasource-list' | 'chat-list' | 'dashboard-list';
    onNavigate?: (view: 'datasource-list' | 'chat-list' | 'dashboard-list') => void;
}

export function ChatList({
    onCreateChat,
    onCreateDashboard,
    isInitialized = false,
    selectedView,
    onNavigate,
}: ChatListProps) {
    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-gray-200 space-y-2">
                <button
                    onClick={() => onCreateChat()}
                    disabled={!isInitialized}
                    className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded transition-colors ${
                        isInitialized
                            ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    <PlusIcon className="w-4 h-4" />
                    <span className="text-sm font-medium">{isInitialized ? '新しいチャット' : '初期化中...'}</span>
                </button>

                {onCreateDashboard && (
                    <button
                        onClick={() => onCreateDashboard()}
                        disabled={!isInitialized}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-2 rounded transition-colors ${
                            isInitialized
                                ? 'bg-green-500 text-white hover:bg-green-600 cursor-pointer'
                                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        }`}
                    >
                        <PresentationChartBarIcon className="w-4 h-4" />
                        <span className="text-sm font-medium">
                            {isInitialized ? '新しいダッシュボード' : '初期化中...'}
                        </span>
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                {/* Navigation Buttons */}
                <div className="space-y-1">
                    <button
                        onClick={() => onNavigate?.('datasource-list')}
                        className={`w-full px-4 py-3 text-left text-sm font-medium rounded transition-colors ${
                            selectedView === 'datasource-list'
                                ? 'bg-blue-50 border border-blue-200'
                                : 'hover:bg-gray-100'
                        }`}
                    >
                        Data Source
                    </button>

                    <button
                        onClick={() => onNavigate?.('chat-list')}
                        className={`w-full px-4 py-3 text-left text-sm font-medium rounded transition-colors ${
                            selectedView === 'chat-list' ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100'
                        }`}
                    >
                        Chat
                    </button>

                    <button
                        onClick={() => onNavigate?.('dashboard-list')}
                        className={`w-full px-4 py-3 text-left text-sm font-medium rounded transition-colors ${
                            selectedView === 'dashboard-list'
                                ? 'bg-blue-50 border border-blue-200'
                                : 'hover:bg-gray-100'
                        }`}
                    >
                        Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
