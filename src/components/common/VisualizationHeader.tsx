import { ReactNode } from 'react';

export interface ToolButton {
    icon: ReactNode;
    onClick: () => void;
    title: string;
    disabled?: boolean;
    className?: string;
}

interface VisualizationHeaderProps {
    title: string;
    toolButtons?: ToolButton[];
    menu?: ReactNode;
}

export function VisualizationHeader({ title, toolButtons = [], menu }: VisualizationHeaderProps) {
    return (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
            <h4 className="text-sm font-medium text-gray-900 truncate">{title}</h4>
            <div className="flex items-center gap-0.5">
                {toolButtons.map((button, index) => (
                    <button
                        key={index}
                        onClick={button.onClick}
                        disabled={button.disabled}
                        className={
                            button.className ||
                            `text-gray-400 hover:text-gray-600 transition-colors p-2 cursor-pointer rounded hover:bg-gray-100 ${
                                button.disabled ? 'opacity-50 cursor-not-allowed' : ''
                            }`
                        }
                        title={button.title}
                        type="button"
                    >
                        {button.icon}
                    </button>
                ))}
                {menu}
            </div>
        </div>
    );
}
