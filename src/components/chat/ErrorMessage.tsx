import React from 'react';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface ErrorMessageProps {
    message: string;
}

export const ErrorMessage: React.FC<ErrorMessageProps> = React.memo(({ message }) => {
    return (
        <div
            className="
                w-full flex items-start gap-2 px-4 py-3 my-2 rounded-lg
                bg-red-50 border-2 border-red-300 text-red-800
                transition-all duration-200
            "
        >
            <ExclamationTriangleIcon className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div className="flex-1 break-words">
                <span className="font-medium">エラー:</span> {message}
            </div>
        </div>
    );
});
