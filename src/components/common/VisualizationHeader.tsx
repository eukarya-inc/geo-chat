import { ReactNode, useState, useCallback, useRef, useEffect } from 'react';
import { PencilIcon } from '@heroicons/react/24/outline';

export interface ToolButton {
    icon: ReactNode;
    onClick: () => void;
    title: string;
    disabled?: boolean;
    className?: string;
    // Temporary state after click (for visual feedback)
    temporaryIcon?: ReactNode;
    temporaryTitle?: string;
    temporaryDuration?: number; // milliseconds, default 2000ms
}

interface VisualizationHeaderProps {
    title: string;
    toolButtons?: ToolButton[];
    menu?: ReactNode;
    editable?: boolean;
    onTitleChange?: (newTitle: string) => void;
}

export function VisualizationHeader({
    title,
    toolButtons = [],
    menu,
    editable = false,
    onTitleChange,
}: VisualizationHeaderProps) {
    // Track which buttons are in temporary state
    const [temporaryStates, setTemporaryStates] = useState<Set<number>>(new Set());
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [editedTitle, setEditedTitle] = useState(title);
    const titleInputRef = useRef<HTMLInputElement>(null);

    const handleButtonClick = useCallback(
        (button: ToolButton, index: number) => {
            // Call the original onClick handler
            button.onClick();

            // If temporary state is configured, activate it
            if (button.temporaryIcon || button.temporaryTitle) {
                setTemporaryStates(prev => new Set(prev).add(index));

                // Reset after duration
                const duration = button.temporaryDuration ?? 2000;
                setTimeout(() => {
                    setTemporaryStates(prev => {
                        const next = new Set(prev);
                        next.delete(index);
                        return next;
                    });
                }, duration);
            }
        },
        [setTemporaryStates]
    );

    const handleStartEditingTitle = useCallback(() => {
        setIsEditingTitle(true);
        setEditedTitle(title);
    }, [title]);

    const handleSaveTitle = useCallback(() => {
        const trimmedTitle = editedTitle.trim();
        if (trimmedTitle && trimmedTitle !== title && onTitleChange) {
            onTitleChange(trimmedTitle);
        }
        setIsEditingTitle(false);
    }, [editedTitle, title, onTitleChange]);

    const handleCancelEditingTitle = useCallback(() => {
        setIsEditingTitle(false);
        setEditedTitle(title);
    }, [title]);

    const handleTitleKeyDown = useCallback(
        (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                handleSaveTitle();
            } else if (e.key === 'Escape') {
                handleCancelEditingTitle();
            }
        },
        [handleSaveTitle, handleCancelEditingTitle]
    );

    // Sync editedTitle when title prop changes externally
    useEffect(() => {
        if (!isEditingTitle) {
            setEditedTitle(title);
        }
    }, [title, isEditingTitle]);

    // Focus input when editing starts
    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            {isEditingTitle ? (
                <input
                    ref={titleInputRef}
                    type="text"
                    value={editedTitle}
                    onChange={e => setEditedTitle(e.target.value)}
                    onKeyDown={handleTitleKeyDown}
                    onBlur={handleSaveTitle}
                    className="flex-1 text-sm font-medium text-gray-900 border-b border-blue-500 focus:outline-none bg-transparent"
                    placeholder="Enter name"
                />
            ) : (
                <div className="flex items-center gap-1.5 group min-w-0">
                    <h4 className="text-sm font-medium text-gray-900 truncate">{title}</h4>
                    {editable && onTitleChange && (
                        <button
                            onClick={handleStartEditingTitle}
                            className="p-0.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                            title="Edit name"
                            type="button"
                        >
                            <PencilIcon className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            )}
            <div className="flex items-center gap-0.5">
                {toolButtons.map((button, index) => {
                    const isTemporary = temporaryStates.has(index);
                    const displayIcon = isTemporary && button.temporaryIcon ? button.temporaryIcon : button.icon;
                    const displayTitle = isTemporary && button.temporaryTitle ? button.temporaryTitle : button.title;

                    return (
                        <button
                            key={index}
                            onClick={() => handleButtonClick(button, index)}
                            disabled={button.disabled}
                            className={
                                button.className ||
                                `text-gray-400 hover:text-gray-600 transition-colors p-2 cursor-pointer rounded hover:bg-gray-100 ${
                                    button.disabled ? 'opacity-50 cursor-not-allowed' : ''
                                }`
                            }
                            title={displayTitle}
                            type="button"
                        >
                            {displayIcon}
                        </button>
                    );
                })}
                {menu}
            </div>
        </div>
    );
}
