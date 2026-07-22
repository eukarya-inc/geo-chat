import { XMarkIcon } from '@heroicons/react/24/outline';
import type { ReactNode } from 'react';
import { useState } from 'react';

export interface ToolButton {
    icon: ReactNode;
    label?: string;
    onClick: () => void;
    disabled?: boolean;
    tooltip?: string;
    // Temporary state after click (for visual feedback)
    temporaryIcon?: ReactNode;
    temporaryLabel?: string;
    temporaryTooltip?: string;
    temporaryDuration?: number; // milliseconds, default 2000ms
}

interface ModalWrapperProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    children: ReactNode;
    toolButtons?: ToolButton[];
}

export function ModalWrapper({ isOpen, onClose, title, children, toolButtons = [] }: ModalWrapperProps) {
    // Track which buttons are in temporary state
    const [temporaryStates, setTemporaryStates] = useState<Set<number>>(new Set());

    const handleButtonClick = (button: ToolButton, index: number) => {
        // Call the original onClick handler
        button.onClick();

        // If temporary state is configured, activate it
        if (button.temporaryIcon || button.temporaryLabel || button.temporaryTooltip) {
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
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl w-[90%] h-[90%] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
                    <div className="flex items-center gap-2">
                        {/* Tool Buttons */}
                        {toolButtons.map((button, index) => {
                            const isTemporary = temporaryStates.has(index);
                            const displayIcon =
                                isTemporary && button.temporaryIcon ? button.temporaryIcon : button.icon;
                            const displayLabel =
                                isTemporary && button.temporaryLabel ? button.temporaryLabel : button.label;
                            const displayTooltip =
                                isTemporary && button.temporaryTooltip ? button.temporaryTooltip : button.tooltip;

                            return (
                                <button
                                    key={index}
                                    onClick={() => handleButtonClick(button, index)}
                                    disabled={button.disabled}
                                    className="flex items-center gap-1 px-3 py-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    title={displayTooltip}
                                >
                                    {displayIcon}
                                    {displayLabel && (
                                        <span className="text-sm font-medium text-gray-700">{displayLabel}</span>
                                    )}
                                </button>
                            );
                        })}
                        {/* Close Button */}
                        <button
                            onClick={onClose}
                            className="flex items-center gap-1 px-3 py-1 hover:bg-gray-100 rounded transition-colors"
                            title="閉じる"
                        >
                            <XMarkIcon className="w-5 h-5 text-gray-600" />
                            <span className="text-sm font-medium text-gray-700">閉じる</span>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden rounded-b-lg">{children}</div>
            </div>
        </div>
    );
}
