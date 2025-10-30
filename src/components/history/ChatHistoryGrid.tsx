import { useState, useCallback } from 'react';
import type { Chat } from '../../store/remoteAtoms';
import { HistoryCard } from './HistoryCard';

interface ChatHistoryGridProps {
    chats: Chat[];
    onSelectChat: (chatId: string) => void;
    onDeleteChat: (chatId: string) => void;
    onRenameChat: (chatId: string, newName: string) => void;
}

export function ChatHistoryGrid({ chats, onSelectChat, onDeleteChat, onRenameChat }: ChatHistoryGridProps) {
    const [editingChatId, setEditingChatId] = useState<string | null>(null);
    const [deletingChatId, setDeletingChatId] = useState<string | null>(null);

    const handleStartEdit = useCallback((chatId: string) => {
        setEditingChatId(chatId);
        setDeletingChatId(null);
    }, []);

    const handleCancelEdit = useCallback(() => {
        setEditingChatId(null);
        setDeletingChatId(null);
    }, []);

    const handleRename = useCallback(
        (chatId: string, newTitle: string) => {
            onRenameChat(chatId, newTitle);
            setEditingChatId(null);
        },
        [onRenameChat]
    );

    const handleStartDelete = useCallback((chatId: string) => {
        setDeletingChatId(chatId);
        setEditingChatId(null);
    }, []);

    const handleConfirmDelete = useCallback(
        (chatId: string) => {
            onDeleteChat(chatId);
            setDeletingChatId(null);
        },
        [onDeleteChat]
    );

    return (
        <div className="p-6 h-full overflow-y-auto bg-gray-50">
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
