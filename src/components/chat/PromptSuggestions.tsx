import React from 'react';

interface Prompt {
    text: string;
    description?: string;
    id?: string;
}

interface PromptSuggestionsProps {
    prompts: Prompt[];
    onPromptClick: (promptText: string) => void;
    title?: string;
    className?: string;
    isSimple?: boolean;
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
    prompts,
    onPromptClick,
    title,
    className = '',
    isSimple = false,
}) => {
    if (!prompts || prompts.length === 0) {
        return null;
    }

    return (
        <div className={`${isSimple ? 'mt-8' : 'mt-4'} ${className}`}>
            {title && (
                <div className={`${isSimple ? 'text-xl font-semibold' : 'text-xs font-medium'} text-gray-600 mb-2`}>
                    {title}
                </div>
            )}
            <div
                className={`flex gap-2 pb-2 scrollbar-hide ${isSimple ? 'flex-wrap' : 'overflow-x-auto'}`}
                style={
                    isSimple
                        ? undefined
                        : ({
                              scrollbarWidth: 'none',
                              msOverflowStyle: 'none',
                          } as React.CSSProperties)
                }
            >
                {prompts.map((prompt, index) => (
                    <button
                        key={prompt.id || index}
                        onClick={() => onPromptClick(prompt.text)}
                        className={`${isSimple ? '' : 'flex-shrink-0'} ${isSimple ? 'px-4 py-3' : 'px-3 py-2'} bg-white border border-gray-300 rounded-lg ${isSimple ? 'text-base' : 'text-sm'} text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors text-left`}
                        style={
                            isSimple
                                ? undefined
                                : {
                                      minWidth: '150px',
                                      maxWidth: '250px',
                                  }
                        }
                        title={prompt.text}
                    >
                        <span className="line-clamp-3">{prompt.text}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
