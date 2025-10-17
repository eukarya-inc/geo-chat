import { ReactNode, useState, useCallback } from 'react';

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
}

export function VisualizationHeader({ title, toolButtons = [], menu }: VisualizationHeaderProps) {
    // Track which buttons are in temporary state
    const [temporaryStates, setTemporaryStates] = useState<Set<number>>(new Set());

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

    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <h4 className="text-sm font-medium text-gray-900 truncate">{title}</h4>
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
