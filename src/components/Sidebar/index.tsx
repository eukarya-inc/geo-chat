import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Bars3Icon, ChatBubbleLeftRightIcon, PresentationChartBarIcon } from '@heroicons/react/24/outline';
import { ChatList } from '../chat/ChatList';
import { useAtom } from 'jotai';
import { chatModeAtom } from '../../store/localAtoms';

interface SidebarProps {
    selectedView?: 'chat' | 'dashboard-list';
    onNavigate?: (view: 'chat' | 'dashboard-list') => void;
}

interface TooltipButtonProps {
    onClick: () => void;
    icon: React.ReactNode;
    label: string;
    isActive?: boolean;
}

function TooltipButton({ onClick, icon, label, isActive = false }: TooltipButtonProps) {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPos, setTooltipPos] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    useEffect(() => {
        if (showTooltip && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setTooltipPos({
                top: rect.top + rect.height / 2,
                left: rect.right + 8,
            });
        }
    }, [showTooltip]);

    return (
        <>
            <button
                ref={buttonRef}
                onClick={onClick}
                onMouseEnter={() => setShowTooltip(true)}
                onMouseLeave={() => setShowTooltip(false)}
                className={`w-full p-3 rounded transition-colors flex items-center justify-center ${
                    isActive ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-100'
                }`}
            >
                {icon}
            </button>
            {showTooltip &&
                createPortal(
                    <div
                        className="fixed px-3 py-1.5 bg-gray-800 text-white text-sm rounded whitespace-nowrap pointer-events-none z-50 -translate-y-1/2"
                        style={{
                            top: `${tooltipPos.top}px`,
                            left: `${tooltipPos.left}px`,
                        }}
                    >
                        {label}
                        <div className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-gray-800" />
                    </div>,
                    document.body
                )}
        </>
    );
}

export function Sidebar({ selectedView, onNavigate }: SidebarProps) {
    const [isCollapsed, setIsCollapsed] = useState(false);
    const [chatMode, setChatMode] = useAtom(chatModeAtom);

    return (
        <div
            className={`h-full border-r border-gray-300 bg-gray-50 flex-shrink-0 transition-all duration-300 ${
                isCollapsed ? 'w-16' : 'w-64'
            }`}
        >
            <div className="h-full flex flex-col">
                {/* Toggle Button */}
                <div className={`p-2 border-b border-gray-200 flex ${isCollapsed ? 'justify-center' : 'justify-end'}`}>
                    <button
                        onClick={() => setIsCollapsed(!isCollapsed)}
                        className={`hover:bg-gray-200 rounded transition-colors ${isCollapsed ? 'p-3 w-full flex items-center justify-center' : 'p-2'}`}
                        title={isCollapsed ? 'サイドバーを展開' : 'サイドバーを折りたたむ'}
                    >
                        <Bars3Icon className="w-5 h-5 text-gray-600" />
                    </button>
                </div>

                {/* Navigation */}
                {isCollapsed ? (
                    <div className="flex-1 overflow-y-auto p-2">
                        <div className="space-y-1">
                            <TooltipButton
                                onClick={() => onNavigate?.('chat')}
                                icon={<ChatBubbleLeftRightIcon className="w-5 h-5" />}
                                label="チャット"
                                isActive={selectedView === 'chat'}
                            />
                            <TooltipButton
                                onClick={() => onNavigate?.('dashboard-list')}
                                icon={<PresentationChartBarIcon className="w-5 h-5" />}
                                label="ダッシュボード"
                                isActive={selectedView === 'dashboard-list'}
                            />
                        </div>
                    </div>
                ) : (
                    <ChatList selectedView={selectedView} onNavigate={onNavigate} />
                )}

                {/* Chat Mode Toggle (bottom) */}
                <div className="border-t border-gray-200 p-3">
                    {isCollapsed ? (
                        <button
                            onClick={() => setChatMode(chatMode === 'normal' ? 'simple' : 'normal')}
                            className={`w-full p-2 rounded transition-colors ${
                                chatMode === 'simple' ? 'bg-blue-100 text-blue-700' : 'bg-gray-200 text-gray-700'
                            }`}
                            title={chatMode === 'normal' ? 'シンプルモードに切り替え' : 'ノーマルモードに切り替え'}
                        >
                            <span className="text-xs font-bold">{chatMode === 'normal' ? 'N' : 'S'}</span>
                        </button>
                    ) : (
                        <div className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">表示モード</span>
                            <button
                                onClick={() => setChatMode(chatMode === 'normal' ? 'simple' : 'normal')}
                                className={`px-3 py-1 rounded text-sm transition-colors ${
                                    chatMode === 'simple'
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                }`}
                            >
                                {chatMode === 'normal' ? '通常' : 'シンプル'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
