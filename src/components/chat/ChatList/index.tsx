import { useState } from 'react';
import { PlusIcon, TrashIcon, ChartBarIcon } from '@heroicons/react/24/outline';
import type { StructuredMessage } from '../../../types/message';
import type { StyleSpecification } from 'maplibre-gl';
import type { TableStyle, ExtraStyle } from '../../map';

export type ChatType = 'graph';

export interface MapState {
    center?: [number, number];
    zoom?: number;
    bearing?: number;
    pitch?: number;
    style?: StyleSpecification;
}

export interface Chat {
    id: string;
    title: string;
    createdAt: Date;
    messages: StructuredMessage[];
    schemaName?: string;
    selectedTable?: string | null;
    mapState?: MapState;
    tableStyles?: Record<string, TableStyle>;
    extraMapStyle?: ExtraStyle;
}

interface ChatListProps {
    chats: Chat[];
    selectedChatId: string | null;
    onSelectChat: (chatId: string) => void;
    onCreateChat: () => void | Promise<void>;
    onDeleteChat: (chatId: string) => void | Promise<void>;
    isInitialized?: boolean;
}

export function ChatList({
    chats,
    selectedChatId,
    onSelectChat,
    onCreateChat,
    onDeleteChat,
    isInitialized = false
}: ChatListProps) {
    const [hoveredChatId, setHoveredChatId] = useState<string | null>(null);

    return (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-gray-200">
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
            </div>
            
            <div className="flex-1 overflow-y-auto">
                {chats.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                        チャットがありません
                    </div>
                ) : (
                    <div className="p-2">
                        {[...chats].reverse().map((chat) => (
                            <div
                                key={chat.id}
                                className={`group relative flex items-center gap-2 p-3 mb-1 rounded cursor-pointer transition-colors ${
                                    selectedChatId === chat.id
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
        </div>
    );
}