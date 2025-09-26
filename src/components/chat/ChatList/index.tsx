import { useState } from 'react';
import { PlusIcon, TrashIcon, ChartBarIcon, PresentationChartBarIcon } from '@heroicons/react/24/outline';
import type { StructuredMessage } from '../../../types/message';
import type { MapSpec, Dashboard } from '../../../store/remoteAtoms';

export type ChatType = 'graph';

export interface Chat {
    id: string;
    title: string;
    createdAt: Date;
    messages: StructuredMessage[];
    schemaName?: string;
    selectedTable?: string | null;
    mapSpecs?: Record<string, MapSpec>;
}

interface ChatListProps {
    chats: Chat[];
    selectedChatId: string | null;
    onSelectChat: (chatId: string) => void;
    onCreateChat: () => void | Promise<void>;
    onDeleteChat: (chatId: string) => void | Promise<void>;
    isInitialized?: boolean;
    dashboards?: Dashboard[];
    onCreateDashboard?: () => void;
    onSelectDashboard?: (dashboardId: string) => void;
    onDeleteDashboard?: (dashboardId: string) => void;
    onRenameDashboard?: (dashboardId: string, newName: string) => void;
    selectedDashboardId?: string | null;
}

export function ChatList({
    chats,
    selectedChatId,
    onSelectChat,
    onCreateChat,
    onDeleteChat,
    isInitialized = false,
    dashboards = [],
    onCreateDashboard,
    onSelectDashboard,
    onDeleteDashboard,
    onRenameDashboard,
    selectedDashboardId
}: ChatListProps) {
    const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);
    const [hoveredDashboardId, setHoveredDashboardId] = useState<string | null>(null);
    const [editingDashboardId, setEditingDashboardId] = useState<string | null>(null);
    const [editingTitle, setEditingTitle] = useState<string>('');
    const [dashboardToDelete, setDashboardToDelete] = useState<{id: string, title: string} | null>(null);

    const handleStartEditing = (dashboardId: string, currentTitle: string) => {
        setEditingDashboardId(dashboardId);
        setEditingTitle(currentTitle);
    };

    const handleSaveEdit = () => {
        if (editingDashboardId && onRenameDashboard && editingTitle.trim()) {
            onRenameDashboard(editingDashboardId, editingTitle.trim());
        }
        setEditingDashboardId(null);
        setEditingTitle('');
    };

    const handleCancelEdit = () => {
        setEditingDashboardId(null);
        setEditingTitle('');
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            handleCancelEdit();
        }
    };

    const handleDeleteClick = (dashboardId: string, dashboardTitle: string) => {
        setDashboardToDelete({ id: dashboardId, title: dashboardTitle });
    };

    const handleConfirmDelete = () => {
        if (dashboardToDelete && onDeleteDashboard) {
            onDeleteDashboard(dashboardToDelete.id);
            setDashboardToDelete(null);
        }
    };

    const handleCancelDelete = () => {
        setDashboardToDelete(null);
    };

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
                    <span className="text-sm font-medium">
                        {isInitialized ? '新しいチャット' : '初期化中...'}
                    </span>
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
            
            <div className="flex-1 overflow-y-auto">
                {/* Chats Section */}
                <div className="border-b border-gray-200">
                    <div className="p-2 bg-gray-100">
                        <h3 className="text-xs font-semibold text-gray-600 uppercase">チャット</h3>
                    </div>
                    {chats.length === 0 ? (
                        <div className="p-4 text-center text-gray-500 text-sm">
                            チャットがありません
                        </div>
                    ) : (
                        <div className="p-2">
                            {chats.map((chat) => (
                                <div
                                    key={chat.id}
                                    className={`group relative flex items-center gap-2 p-3 mb-1 rounded cursor-pointer transition-colors ${
                                        selectedChatId === chat.id && !selectedDashboardId
                                            ? 'bg-blue-50 border border-blue-200'
                                            : 'hover:bg-gray-100'
                                    }`}
                                    onClick={() => onSelectChat(chat.id)}
                                    onMouseEnter={() => setHoveredChatId(chat.id)}
                                    onMouseLeave={() => setHoveredChatId(null)}
                                >
                                    <ChartBarIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm font-medium truncate">
                                            {chat.title}
                                        </div>
                                        <div className="text-xs text-gray-500">
                                            {chat.createdAt.toLocaleDateString('ja-JP')}
                                        </div>
                                    </div>
                                    {hoveredChatId === chat.id && (
                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onDeleteChat(chat.id);
                                            }}
                                            className="absolute right-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                                        >
                                            <TrashIcon className="w-4 h-4" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Dashboards Section */}
                {onSelectDashboard && (
                    <div>
                        <div className="p-2 bg-gray-100">
                            <h3 className="text-xs font-semibold text-gray-600 uppercase">ダッシュボード</h3>
                        </div>
                        {dashboards.length === 0 ? (
                            <div className="p-4 text-center text-gray-500 text-sm">
                                ダッシュボードがありません
                            </div>
                        ) : (
                            <div className="p-2">
                                {dashboards.map((dashboard) => (
                                    <div
                                        key={dashboard.id}
                                        className={`group relative flex items-center gap-2 p-3 mb-1 rounded transition-colors ${
                                            selectedDashboardId === dashboard.id
                                                ? 'bg-green-50 border border-green-200'
                                                : 'hover:bg-gray-100'
                                        } ${
                                            editingDashboardId !== dashboard.id ? 'cursor-pointer' : ''
                                        }`}
                                        onClick={() => {
                                            if (editingDashboardId !== dashboard.id && onSelectDashboard) {
                                                onSelectDashboard(dashboard.id);
                                            }
                                        }}
                                        onMouseEnter={() => setHoveredDashboardId(dashboard.id)}
                                        onMouseLeave={() => setHoveredDashboardId(null)}
                                    >
                                        <PresentationChartBarIcon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium">
                                                {editingDashboardId === dashboard.id ? (
                                                    <div className="flex items-center gap-1">
                                                        <input
                                                            type="text"
                                                            value={editingTitle}
                                                            onChange={(e) => setEditingTitle(e.target.value)}
                                                            onKeyDown={handleKeyDown}
                                                            onBlur={handleSaveEdit}
                                                            autoFocus
                                                            className="flex-1 px-1 py-0.5 text-sm border border-green-300 rounded focus:outline-none focus:ring-1 focus:ring-green-500"
                                                        />
                                                        <button
                                                            onClick={handleCancelEdit}
                                                            className="p-0.5 text-gray-400 hover:text-red-500 transition-colors"
                                                        >
                                                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <div
                                                        className="truncate cursor-pointer hover:bg-green-100 px-1 py-0.5 rounded"
                                                        onClick={(e) => {
                                                            e.stopPropagation(); // Prevent dashboard selection
                                                            if (onRenameDashboard) {
                                                                handleStartEditing(dashboard.id, dashboard.title);
                                                            }
                                                        }}
                                                        title="Click to edit name"
                                                    >
                                                        {dashboard.title}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="text-xs text-gray-500">
                                                {dashboard.createdAt.toLocaleDateString('ja-JP')}
                                            </div>
                                        </div>
                                        {hoveredDashboardId === dashboard.id && onDeleteDashboard && (
                                            <button
                                                data-testid="dashboard-delete-button"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleDeleteClick(dashboard.id, dashboard.title);
                                                }}
                                                className="absolute right-2 p-1 text-gray-400 hover:text-red-500 transition-colors"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Dashboard Delete Confirmation Modal */}
            {dashboardToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-lg shadow-xl p-6 max-w-sm mx-4">
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">
                            Delete Dashboard
                        </h3>
                        <p className="text-gray-600 mb-4">
                            Are you sure you want to delete "{dashboardToDelete.title}"? This action cannot be undone.
                        </p>
                        <div className="flex gap-3 justify-end">
                            <button
                                onClick={handleCancelDelete}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                data-testid="confirm-delete-dashboard"
                                onClick={handleConfirmDelete}
                                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}