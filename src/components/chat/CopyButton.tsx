import { useState } from 'react';

interface CopyButtonProps {
    onCopy: () => void;
    className?: string;
}

export function CopyButton({ onCopy, className = '' }: CopyButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleClick = () => {
        onCopy();
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${className}`}
            title={copied ? 'コピーしました' : 'コピー'}
            aria-label={copied ? 'コピーしました' : 'コピー'}
        >
            {copied ? (
                <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
            ) : (
                <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                </svg>
            )}
        </button>
    );
}
