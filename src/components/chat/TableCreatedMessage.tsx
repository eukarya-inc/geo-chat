import React from 'react';
import { TableCellsIcon, ChartBarIcon, MapIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon } from '@heroicons/react/24/solid';

interface TableCreatedMessageProps {
    tableName: string;
    isSelected: boolean;
    onClick: () => void;
    hasChartSpec?: boolean;
    hasGeometry?: boolean;
    onChartIconClick?: () => void;
    onMapIconClick?: () => void;
}

export const TableCreatedMessage: React.FC<TableCreatedMessageProps> = React.memo(
    ({
        tableName,
        isSelected,
        onClick,
        hasChartSpec = false,
        hasGeometry = false,
        onChartIconClick,
        onMapIconClick,
    }) => {
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
                <span className="font-medium flex-1">
                    テーブルを作成しました: <strong>{tableName}</strong>
                </span>
                {hasChartSpec && (
                    <button
                        className="flex items-center gap-1 px-2 py-1 rounded text-green-600 hover:text-green-700 hover:bg-green-50 transition-colors"
                        title="クリックしてチャートを表示"
                        onClick={e => {
                            e.stopPropagation();
                            onChartIconClick?.();
                        }}
                    >
                        <ChartBarIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium">グラフ</span>
                    </button>
                )}
                {hasGeometry && (
                    <button
                        className="flex items-center gap-1 px-2 py-1 rounded text-blue-600 hover:text-blue-700 hover:bg-blue-50 transition-colors"
                        title="クリックして地図を表示"
                        onClick={e => {
                            e.stopPropagation();
                            onMapIconClick?.();
                        }}
                    >
                        <MapIcon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-sm font-medium">地図</span>
                    </button>
                )}
            </div>
        );
    }
);
