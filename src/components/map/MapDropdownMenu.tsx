import {
    ArrowUpTrayIcon,
    TrashIcon,
    ClipboardDocumentIcon,
    CameraIcon,
    PaintBrushIcon,
} from '@heroicons/react/24/outline';
import html2canvas from 'html2canvas';
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
    };

    const handleCopyMapToClipboard = async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                alert('Clipboard API is not supported in your browser. Please use the download option instead.');
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
        } catch (err) {
            console.error('Error copying map:', err);
            alert(`Failed to copy map to clipboard: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
    };

    const menuItems: DropdownMenuItem[] = [
        {
            title: 'クリップボードにコピー',
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
