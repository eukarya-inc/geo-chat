import { useMemo } from 'react';
import { getRelativeTime } from '../../utils/timeUtils';

interface TableCardProps {
    tableName: string;
    lastUpdated: Date;
    isSelected: boolean;
    onToggle: (tableName: string) => void;
}

export function TableCard({ tableName, lastUpdated, isSelected, onToggle }: TableCardProps) {
    const relativeTime = useMemo(() => getRelativeTime(lastUpdated), [lastUpdated]);
    return (
        <button
            onClick={() => onToggle(tableName)}
            className={`
                flex items-center gap-2 rounded hover:opacity-80 transition-opacity
                w-[220px] p-3
                ${isSelected ? 'bg-[rgba(111,228,126,0.30)]' : 'bg-transparent'}
            `}
            style={{
                outline: isSelected ? '1px #6FE47E solid' : '1px rgba(0, 0, 0, 0.20) solid',
                outlineOffset: '-1px',
            }}
        >
            {/* Table Icon */}
            <div className="w-6 h-6 relative flex-shrink-0">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path
                        d="M3 5.25H21V18C21 18.1989 20.921 18.3897 20.7803 18.5303C20.6397 18.671 20.4489 18.75 20.25 18.75H3.75C3.55109 18.75 3.36032 18.671 3.21967 18.5303C3.07902 18.3897 3 18.1989 3 18V5.25Z"
                        stroke="black"
                        strokeOpacity="0.5"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M3 9.75H21"
                        stroke="black"
                        strokeOpacity="0.5"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M3 14.25H21"
                        stroke="black"
                        strokeOpacity="0.5"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                    <path
                        d="M8.25 9.75V18.75"
                        stroke="black"
                        strokeOpacity="0.5"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                </svg>
            </div>

            {/* Table Info */}
            <div className="flex flex-col gap-1 flex-1 min-w-0">
                <div className="truncate text-sm font-normal text-black" style={{ fontFamily: 'Inter' }}>
                    {tableName}
                </div>
                <div className="text-xs font-normal text-black/60" style={{ fontFamily: 'Inter' }}>
                    last update {relativeTime}
                </div>
            </div>
        </button>
    );
}
