import { useState, useRef, useEffect } from 'react';
import { ChartBarIcon, MapIcon } from '@heroicons/react/24/outline';
import type { ChatType } from './ChatList';

interface ChatTypeMenuProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectType: (type: ChatType) => void;
    anchorRef?: React.RefObject<HTMLElement | null>;
}

export function ChatTypeMenu({ isOpen, onClose, onSelectType, anchorRef }: ChatTypeMenuProps) {
    const menuRef = useRef<HTMLDivElement>(null);
    const [position, setPosition] = useState({ top: 0, left: 0 });

    useEffect(() => {
        if (isOpen && anchorRef?.current) {
            const rect = anchorRef.current.getBoundingClientRect();
            setPosition({
                top: rect.bottom + 8,
                left: rect.left
            });
        }
    }, [isOpen, anchorRef]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onClose]);

    if (!isOpen) return null;

    const menuItems = [
        {
            type: 'graph' as ChatType,
            icon: ChartBarIcon,
            label: 'グラフチャット',
            description: 'データ可視化と分析'
        },
        {
            type: 'map' as ChatType,
            icon: MapIcon,
            label: '地図チャット',
            description: '地理空間データ分析'
        }
    ];

    return (
        <div
            ref={menuRef}
            className="fixed z-50 bg-white rounded-lg shadow-lg border border-gray-200 py-2 min-w-[200px]"
            style={{
                top: `${position.top}px`,
                left: `${position.left}px`
            }}
        >
            {menuItems.map((item) => (
                <button
                    key={item.type}
                    onClick={() => {
                        onSelectType(item.type);
                        onClose();
                    }}
                    className="w-full px-4 py-3 hover:bg-gray-50 flex items-start gap-3 text-left transition-colors"
                >
                    <item.icon className="w-5 h-5 text-gray-600 mt-0.5" />
                    <div>
                        <div className="text-sm font-medium text-gray-900">{item.label}</div>
                        <div className="text-xs text-gray-500">{item.description}</div>
                    </div>
                </button>
            ))}
        </div>
    );
}