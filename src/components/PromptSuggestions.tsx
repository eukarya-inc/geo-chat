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
}

export const PromptSuggestions: React.FC<PromptSuggestionsProps> = ({
    prompts,
    onPromptClick,
    title,
    className = ''
}) => {
    if (!prompts || prompts.length === 0) {
        return null;
    }

    return (
        <div className={`mt-2 ${className}`}>
            {title && (
                <div className="text-xs text-gray-600 mb-2 font-medium">
                    {title}
                </div>
            )}
            <div 
                className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide"
                style={{
                    scrollbarWidth: 'none',
                    msOverflowStyle: 'none'
                } as React.CSSProperties}
            >
                {prompts.map((prompt, index) => (
                    <button
                        key={prompt.id || index}
                        onClick={() => onPromptClick(prompt.text)}
                        className="flex-shrink-0 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors text-left"
                        style={{
                            minWidth: '150px',
                            maxWidth: '250px'
                        }}
                        title={prompt.text}  // Show full text on hover
                    >
                        <span className="line-clamp-3">  {/* Allow 3 lines */}
                            {prompt.text}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};