import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    EllipsisVerticalIcon,
    ArrowUpTrayIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CameraIcon,
    PaintBrushIcon,
} from '@heroicons/react/24/outline';
import html2canvas from 'html2canvas';

interface MapDropdownMenuProps {
    vizId?: string;
    vizTitle?: string;
    onRemove?: () => void;
    onExport?: () => void;
    showRemoveButton?: boolean;
    showExportButton?: boolean;
    isExportDisabled?: boolean;
    exportTooltip?: string;
    onOpenStyleEditor?: () => void;
}

export function MapDropdownMenu({
    vizId,
    vizTitle,
    onRemove,
    onExport,
    showRemoveButton = true,
    showExportButton = true,
    isExportDisabled = false,
    exportTooltip,
    onOpenStyleEditor,
}: MapDropdownMenuProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Calculate menu position when opened
    useEffect(() => {
        if (isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPosition({
                top: rect.bottom + window.scrollY,
                left: rect.right + window.scrollX - 192, // 192px is menu width (w-48 = 12rem = 192px)
            });
        }
    }, [isOpen]);

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

    const handleSaveMapAsImage = async () => {
        try {
            let mapContainer: Element | null = null;

            if (vizId) {
                mapContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            }

            if (!mapContainer) {
                // Try to find map container by looking for map element
                mapContainer = document.querySelector('#map');
            }

            if (!mapContainer) {
                alert('Map not found. Please try again.');
                setIsOpen(false);
                return;
            }

            // Use html2canvas to capture the entire map container
            const canvas = await html2canvas(mapContainer as HTMLElement, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
            });

            canvas.toBlob(blob => {
                if (blob) {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    const filename = vizTitle ? `${vizTitle.replace(/[^a-z0-9]/gi, '_')}.png` : 'map.png';
                    a.download = filename;
                    a.click();
                    URL.revokeObjectURL(url);
                } else {
                    alert('Failed to export map as image. Please try again.');
                }
            }, 'image/png');
        } catch (error) {
            console.error('Error exporting map:', error);
            alert('Failed to export map as image. Please try again.');
        }
        setIsOpen(false);
    };

    const handleCopyMapToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
                setIsOpen(false);
                return;
            }

            let mapContainer: Element | null = null;

            if (vizId) {
                mapContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            }

            if (!mapContainer) {
                // Try to find map container by looking for map element
                mapContainer = document.querySelector('#map');
            }

            if (!mapContainer) {
                alert('Map not found. Please try again.');
                setIsOpen(false);
                return;
            }

            // Use html2canvas to capture the entire map container
            const canvas = await html2canvas(mapContainer as HTMLElement, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
            });

            // Safari requires ClipboardItem to be created synchronously with a Promise
            const blobPromise = new Promise<Blob>((resolve, reject) => {
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(blob);
                    } else {
                        reject(new Error('Failed to create image from map'));
                    }
                }, 'image/png');
            });

            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);

            alert('Map copied to clipboard!');
            setIsOpen(false);
        } catch (err) {
            console.error('Error copying map:', err);
            alert(`Failed to copy map to clipboard: ${err instanceof Error ? err.message : 'Unknown error'}`);
            setIsOpen(false);
        }
    };

    const handleRemove = () => {
        if (onRemove) {
            onRemove();
        }
        setIsOpen(false);
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
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 cursor-pointer"
                title="Map options"
                type="button"
            >
                <EllipsisVerticalIcon className="w-5 h-5" />
            </button>

            {isOpen &&
                createPortal(
                    <div
                        ref={dropdownRef}
                        className="fixed w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-[10000]"
                        style={{
                            top: `${menuPosition.top}px`,
                            left: `${menuPosition.left}px`,
                        }}
                    >
                        <div className="py-1">
                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleCopyMapToClipboard();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <ClipboardDocumentIcon className="w-4 h-4 mr-2" />
                                クリップボードにコピー
                            </button>

                            <button
                                onClick={e => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    handleSaveMapAsImage();
                                }}
                                onMouseDown={e => e.stopPropagation()}
                                className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                type="button"
                            >
                                <CameraIcon className="w-4 h-4 mr-2" />
                                画像として保存
                            </button>

                            {onOpenStyleEditor && (
                                <button
                                    onClick={e => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onOpenStyleEditor();
                                        setIsOpen(false);
                                    }}
                                    onMouseDown={e => e.stopPropagation()}
                                    className="flex items-center w-full px-4 py-2 text-sm text-left text-gray-700 hover:bg-gray-100 transition-colors cursor-pointer"
                                    type="button"
                                >
                                    <PaintBrushIcon className="w-4 h-4 mr-2" />
                                    スタイルエディタ
                                </button>
                            )}

                            {showExportButton && onExport && (
                                <>
                                    <hr className="my-1 border-gray-200" />

                                    <button
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            if (!isExportDisabled) {
                                                onExport();
                                                setIsOpen(false);
                                            }
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className={`flex items-center w-full px-4 py-2 text-sm text-left transition-colors ${
                                            isExportDisabled
                                                ? 'text-gray-400 cursor-not-allowed'
                                                : 'text-gray-700 hover:bg-gray-100 cursor-pointer'
                                        }`}
                                        title={exportTooltip}
                                        disabled={isExportDisabled}
                                        type="button"
                                    >
                                        <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                                        ダッシュボードにエクスポート
                                    </button>
                                </>
                            )}

                            {showRemoveButton && onRemove && (
                                <>
                                    <hr className="my-1 border-gray-200" />

                                    <button
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            handleRemove();
                                        }}
                                        onMouseDown={e => e.stopPropagation()}
                                        className="flex items-center w-full px-4 py-2 text-sm text-left text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                                        type="button"
                                    >
                                        <TrashIcon className="w-4 h-4 mr-2" />
                                        地図を削除
                                    </button>
                                </>
                            )}
                        </div>
                    </div>,
                    document.body
                )}
        </>
    );
}
