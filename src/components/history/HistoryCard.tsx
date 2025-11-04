import { useState, useMemo } from 'react';
import { TrashIcon, PencilIcon } from '@heroicons/react/24/outline';
import { getRelativeTime } from '../../utils/timeUtils';

interface HistoryCardProps {
    title: string;
    date: Date;
    subtitle?: string;
    badge?: {
        label: string;
        color: 'blue' | 'green' | 'purple';
    };
    previewImage?: string | null;
    onClick: () => void;
    onStartDelete?: () => void;
    onConfirmDelete?: () => void;
    onRename?: (newTitle: string) => void;
    isEditing?: boolean;
    isDeleting?: boolean;
    onStartEdit?: () => void;
    onCancelEdit?: () => void;
}

export function HistoryCard({
    title,
    date,
    subtitle,
    badge,
    previewImage,
    onClick,
    onStartDelete,
    onConfirmDelete,
    onRename,
    isEditing = false,
    isDeleting = false,
    onStartEdit,
    onCancelEdit,
}: HistoryCardProps) {
    const [editingTitle, setEditingTitle] = useState(title);
    const [isHovered, setIsHovered] = useState(false);
    const relativeTime = useMemo(() => getRelativeTime(date), [date]);

    const handleSaveEdit = () => {
        if (onRename && editingTitle.trim()) {
            onRename(editingTitle.trim());
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSaveEdit();
        } else if (e.key === 'Escape') {
            setEditingTitle(title);
            onCancelEdit?.();
        }
    };

    // Deleting state - show confirmation
    if (isDeleting) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-start gap-2">
                    <TrashIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-red-900">Delete "{title}"?</div>
                        <div className="text-xs text-red-600 mt-1">This cannot be undone.</div>
                    </div>
                </div>
                <div className="flex gap-2 mt-3">
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onCancelEdit?.();
                        }}
                        className="flex-1 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 border border-gray-300 rounded transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={e => {
                            e.stopPropagation();
                            onConfirmDelete?.();
                        }}
                        className="flex-1 px-3 py-1.5 text-sm font-medium text-white bg-red-500 hover:bg-red-600 rounded transition-colors"
                    >
                        Delete
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onClick={!isEditing ? onClick : undefined}
            className={`bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow relative ${
                !isEditing ? 'hover:shadow-lg cursor-pointer' : ''
            }`}
        >
            {previewImage && (
                <div className="w-full aspect-video bg-gray-100 overflow-hidden">
                    <img src={previewImage} alt={`Preview of ${title}`} className="w-full h-full object-cover" />
                </div>
            )}
            <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                    {isEditing ? (
                        <input
                            type="text"
                            value={editingTitle}
                            onChange={e => setEditingTitle(e.target.value)}
                            onKeyDown={handleKeyDown}
                            onBlur={handleSaveEdit}
                            autoFocus
                            className="flex-1 font-medium text-lg border border-blue-500 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            onClick={e => e.stopPropagation()}
                        />
                    ) : (
                        <h3 className="font-medium text-lg truncate flex-1">{title}</h3>
                    )}
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {badge && (
                            <span
                                className={`text-xs px-2 py-1 rounded ${
                                    badge.color === 'blue'
                                        ? 'bg-blue-100 text-blue-700'
                                        : badge.color === 'green'
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-purple-100 text-purple-700'
                                }`}
                            >
                                {badge.label}
                            </span>
                        )}
                        {!isEditing && isHovered && onRename && (
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    onStartEdit?.();
                                }}
                                className="p-1 text-gray-400 hover:text-blue-500 transition-colors"
                            >
                                <PencilIcon className="w-4 h-4" />
                            </button>
                        )}
                        {!isEditing && isHovered && onStartDelete && (
                            <button
                                onClick={e => {
                                    e.stopPropagation();
                                    onStartDelete();
                                }}
                                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                            >
                                <TrashIcon className="w-4 h-4" />
                            </button>
                        )}
                    </div>
                </div>
                {!isEditing && (
                    <>
                        <p className="text-sm text-gray-500">last message {relativeTime}</p>
                        {subtitle && <p className="text-xs text-gray-400 mt-1 truncate">{subtitle}</p>}
                    </>
                )}
            </div>
        </div>
    );
}
