import { useState } from 'react';
import {
    ArrowUpTrayIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CameraIcon,
    PaintBrushIcon,
} from '@heroicons/react/24/outline';
import { toBlob } from 'html-to-image';
import { DropdownMenu, type DropdownMenuItem } from '../common/DropdownMenu';

interface MapDropdownMenuProps {
    vizId?: string;
    vizTitle?: string;
    onRemove?: () => void;
    onExport?: () => void;
    showRemoveButton?: boolean;
    showExportButton?: boolean;
    isExportDisabled?: boolean;
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
    onOpenStyleEditor,
}: MapDropdownMenuProps) {
    const [copyButtonText, setCopyButtonText] = useState('クリップボードにコピー');
    const handleSaveMapAsImage = async () => {
        try {
            let mapContainer: Element | null = null;

            if (vizId) {
                mapContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            }

            if (!mapContainer) {
                // Try to find map container by looking for any map element
                mapContainer = document.querySelector('[id^="map-"]');
            }

            if (!mapContainer) {
                alert('Map not found. Please try again.');
                return;
            }

            // Use html-to-image to capture the entire map container
            const blob = await toBlob(mapContainer as HTMLElement, {
                cacheBust: true,
                pixelRatio: 2,
            });

            if (blob) {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                const filename = vizTitle ? `${vizTitle}.png` : 'map.png';
                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
            } else {
                alert('Failed to export map as image. Please try again.');
            }
        } catch (error) {
            console.error('Error exporting map:', error);
            alert('Failed to export map as image. Please try again.');
        }
    };

    const handleCopyMapToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                setCopyButtonText('クリップボードAPIが未対応');
                setTimeout(() => {
                    setCopyButtonText('クリップボードにコピー');
                }, 2000);
                return;
            }

            let mapContainer: Element | null = null;

            if (vizId) {
                mapContainer = document.querySelector(`[data-viz-id="${vizId}"]`);
            }

            if (!mapContainer) {
                // Try to find map container by looking for any map element
                mapContainer = document.querySelector('[id^="map-"]');
            }

            if (!mapContainer) {
                setCopyButtonText('地図が見つかりません');
                setTimeout(() => {
                    setCopyButtonText('クリップボードにコピー');
                }, 2000);
                return;
            }

            // Use html-to-image to capture the entire map container
            const blob = await toBlob(mapContainer as HTMLElement, {
                cacheBust: true,
                pixelRatio: 2,
            });

            if (!blob) {
                throw new Error('Failed to create image from map');
            }

            // Safari requires ClipboardItem to be created synchronously with a Promise
            const blobPromise = Promise.resolve(blob);

            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);

            setCopyButtonText('コピーしました！');
            setTimeout(() => {
                setCopyButtonText('クリップボードにコピー');
            }, 2000);
        } catch (err) {
            console.error('Error copying map:', err);
            setCopyButtonText('コピー失敗');
            setTimeout(() => {
                setCopyButtonText('クリップボードにコピー');
            }, 2000);
        }
    };

    const menuItems: DropdownMenuItem[] = [
        {
            title: copyButtonText,
            icon: <ClipboardDocumentIcon className="w-4 h-4" />,
            onClick: handleCopyMapToClipboard,
        },
        {
            title: '画像として保存',
            icon: <CameraIcon className="w-4 h-4" />,
            onClick: handleSaveMapAsImage,
        },
        ...(onOpenStyleEditor
            ? [
                  {
                      title: 'スタイルエディタ',
                      icon: <PaintBrushIcon className="w-4 h-4" />,
                      onClick: onOpenStyleEditor,
                  } as DropdownMenuItem,
              ]
            : []),
        ...(showExportButton && onExport
            ? [
                  {
                      title: 'ダッシュボードにエクスポート',
                      icon: <ArrowUpTrayIcon className="w-4 h-4" />,
                      onClick: onExport,
                      disabled: isExportDisabled,
                      divider: 'before',
                  } as DropdownMenuItem,
              ]
            : []),
        ...(showRemoveButton && onRemove
            ? [
                  {
                      title: '地図を削除',
                      icon: <TrashIcon className="w-4 h-4" />,
                      onClick: onRemove,
                      variant: 'danger' as const,
                      divider: 'before',
                  } as DropdownMenuItem,
              ]
            : []),
    ];

    return <DropdownMenu title="地図オプション" items={menuItems} menuWidth="w-48" />;
}
