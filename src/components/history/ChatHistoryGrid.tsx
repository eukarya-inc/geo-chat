import { useState } from 'react';
import type { Chat } from '../../store/remoteAtoms';
import { HistoryCard } from './HistoryCard';

interface ChatHistoryGridProps {
    chats: Chat[];
    onSelectChat: (chatId: string) => void;
    onDeleteChat: (chatId: string) => void;
    onRenameChat: (chatId: string, newName: string) => void;
    onCreateChat: () => void;
}

export function ChatHistoryGrid({
    chats,
    onSelectChat,
    onDeleteChat,
    onRenameChat,
    onCreateChat,
}: ChatHistoryGridProps) {
    const [editingChatId, setEditingChatId] = useState<string | null>(null);
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

    const handleStartEdit = (chatId: string) => {
        setEditingChatId(chatId);
        setDeletingChatId(null);
    };

    const handleCancelEdit = () => {
        setEditingChatId(null);
        setDeletingChatId(null);
    };

    const handleRename = (chatId: string, newTitle: string) => {
        onRenameChat(chatId, newTitle);
        setEditingChatId(null);
    };

    const handleStartDelete = (chatId: string) => {
        setDeletingChatId(chatId);
        setEditingChatId(null);
    };

    const handleConfirmDelete = (chatId: string) => {
        onDeleteChat(chatId);
        setDeletingChatId(null);
    };
    return (
        <div className="p-6 h-full overflow-y-auto bg-gray-50">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-bold">Chat List</h1>
                <button
                    onClick={onCreateChat}
                    className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                >
                    + New chat
                </button>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {chats.map(chat => (
                    <HistoryCard
                        key={chat.id}
                        title={chat.title}
                        date={chat.createdAt}
                        onClick={() => onSelectChat(chat.id)}
                        onStartDelete={() => handleStartDelete(chat.id)}
                        onConfirmDelete={() => handleConfirmDelete(chat.id)}
                        onRename={newTitle => handleRename(chat.id, newTitle)}
                        isEditing={editingChatId === chat.id}
                        isDeleting={deletingChatId === chat.id}
                        onStartEdit={() => handleStartEdit(chat.id)}
                        onCancelEdit={handleCancelEdit}
                    />
                ))}
            </div>

            {chats.length === 0 && (
                <div className="text-center text-gray-500 mt-12">
                    <p>No chats found. Create your first chat!</p>
                </div>
            )}
        </div>
    );
}
