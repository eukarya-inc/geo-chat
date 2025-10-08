import React from 'react';
import { TableCellsIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface TableCreatedMessageProps {
    tableName: string;
    isSelected: boolean;
    onClick: () => void;
}

export const TableCreatedMessage: React.FC<TableCreatedMessageProps> = React.memo(
    ({ tableName, isSelected, onClick }) => {
        return (
            <div
                className={`
                w-full flex items-center gap-2 px-4 py-3 my-2 rounded-lg cursor-pointer
                transition-all duration-200 select-none
                ${
                    isSelected
                        ? 'bg-blue-100 border-2 border-blue-400 text-blue-800 hover:bg-blue-200'
                        : 'bg-gray-100 border-2 border-gray-300 text-gray-700 hover:bg-gray-200 hover:border-gray-400'
                }
            `}
                onClick={onClick}
                title={`クリックして「${tableName}」テーブルを選択`}
            >
                {isSelected ? (
                    <CheckCircleIcon className="w-5 h-5 flex-shrink-0" />
                ) : (
                    <TableCellsIcon className="w-5 h-5 flex-shrink-0" />
                )}
                <span className="font-medium">
                    テーブルを作成しました: <strong>{tableName}</strong>
                </span>
            </div>
        );
    }
);
