import { useState, useEffect, useRef, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { EllipsisVerticalIcon } from '@heroicons/react/24/outline';

export interface DropdownMenuItem {
    title: string;
    icon: ReactNode;
    onClick: () => void;
    disabled?: boolean;
    variant?: 'default' | 'danger';
    divider?: 'before' | 'after' | 'both';
}

interface DropdownMenuProps {
    title: string;
    items: DropdownMenuItem[];
    menuWidth?: string; // Tailwind class like 'w-48' or 'w-56'
}

export function DropdownMenu({ title, items, menuWidth = 'w-48' }: DropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Calculate menu position when opened
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            // Convert Tailwind width class to pixels (w-48 = 12rem = 192px, w-56 = 14rem = 224px)
            const widthMap: Record<string, number> = {
                'w-48': 192,
                'w-56': 224,
                'w-64': 256,
            };
            const menuWidthPx = widthMap[menuWidth] || 192;
            setMenuPosition({
                top: rect.bottom + window.scrollY,
                left: rect.right + window.scrollX - menuWidthPx,
            });
        }
    }, [isOpen, menuWidth]);

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (
                buttonRef.current &&
                !buttonRef.current.contains(event.target as Node) &&
                dropdownRef.current &&
                !dropdownRef.current.contains(event.target as Node)
            ) {
                setIsOpen(false);
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const handleItemClick = (item: DropdownMenuItem) => {
        if (!item.disabled) {
            item.onClick();
            setIsOpen(false);
        }
    };

    return (
        <>
            <button
                ref={buttonRef}
                onClick={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    setIsOpen(!isOpen);
                }}
                onMouseDown={e => {
                    e.stopPropagation();
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 cursor-pointer rounded hover:bg-gray-100"
                title={title}
                type="button"
            >
                <EllipsisVerticalIcon className="w-5 h-5" />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        className={`fixed ${menuWidth} bg-white border border-gray-200 rounded-lg shadow-lg z-[10000]`}
                        style={{
                            top: `${menuPosition.top}px`,
                            left: `${menuPosition.left}px`,
                        }}
                    >
                        <div className="py-1">
                            {items.map((item, index) => (
                                <div key={index}>
                                    {(item.divider === 'before' || item.divider === 'both') && index > 0 && (
                                        <hr className="my-1 border-gray-200" />
                                    )}
                                    <button
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleItemClick(item);
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className={`flex items-center w-full px-4 py-2 text-sm text-left transition-colors ${
                                            item.disabled
                                                ? 'text-gray-400 cursor-not-allowed'
                                                : item.variant === 'danger'
                                                  ? 'text-red-600 hover:bg-red-50 cursor-pointer'
                                                  : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                                        }`}
                                        disabled={item.disabled}
                                        type="button"
                                    >
                                        <span className="w-4 h-4 mr-2">{item.icon}</span>
                                        {item.title}
                                    </button>
                                    {(item.divider === 'after' || item.divider === 'both') && (
                                        <hr className="my-1 border-gray-200" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
