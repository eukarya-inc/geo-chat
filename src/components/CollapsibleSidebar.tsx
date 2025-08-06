import React from 'react';

interface CollapsibleSidebarProps {
    children: React.ReactNode;
    isCollapsed: boolean;
    onToggle: () => void;
    width?: string;
    minWidth?: string;
}

export function CollapsibleSidebar({ 
    children, 
    isCollapsed,
    width = '300px',
    minWidth = '0px'
}: CollapsibleSidebarProps) {
    return (
        <div 
            className="relative h-full bg-gray-50 border-r border-gray-300 transition-all duration-300 flex-shrink-0"
            style={{ width: isCollapsed ? minWidth : width }}
        >
            <div className={`h-full overflow-hidden ${isCollapsed ? 'hidden' : 'block'}`}>
                {children}
            </div>
        </div>
    );
}