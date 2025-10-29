import { useState } from 'react';
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
    const [copyButtonText, setCopyButtonText] = useState('クリップボードにコピー');
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

            // Try to get MapLibre GL canvas directly first
            const getMapLibreCanvas = (): HTMLCanvasElement | null => {
                const mapCanvas = mapContainer!.querySelector('.maplibregl-canvas') as HTMLCanvasElement;
                if (mapCanvas && mapCanvas.width > 0 && mapCanvas.height > 0) {
                    // Try to get the map instance
                    const mapElement = mapCanvas.closest('[data-viz-id]') || mapContainer;
                    const mapInstance =
                        (mapElement as HTMLElement & { _map?: unknown })?._map ||
                        (mapCanvas.parentElement as HTMLElement & { _map?: unknown })?._map;

                    const mapInstanceWithCanvas = mapInstance as { getCanvas?: () => HTMLCanvasElement };
                    if (mapInstanceWithCanvas && typeof mapInstanceWithCanvas.getCanvas === 'function') {
                        try {
                            return mapInstanceWithCanvas.getCanvas();
                        } catch (e) {
                            console.warn('Failed to get canvas from MapLibre GL instance:', e);
                        }
                    }

                    return mapCanvas;
                }
                return null;
            };

            const mapCanvas = getMapLibreCanvas();

            if (mapCanvas) {
                // Direct canvas approach
                const containerRect = mapContainer.getBoundingClientRect();
                const exportCanvas = document.createElement('canvas');
                const ctx = exportCanvas.getContext('2d');

                if (ctx) {
                    exportCanvas.width = containerRect.width;
                    exportCanvas.height = containerRect.height;

                    // Set background
                    ctx.fillStyle = '#f9fafb';
                    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

                    try {
                        ctx.drawImage(mapCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

                        exportCanvas.toBlob(blob => {
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
                        }, 'image/png');
                        return;
                    } catch (e) {
                        console.warn('Direct canvas capture failed, falling back to html2canvas:', e);
                    }
                }
            }

            // Fallback to html2canvas with optimized settings
            const canvas = await html2canvas(mapContainer as HTMLElement, {
                useCORS: true,
                allowTaint: true,
                backgroundColor: null,
                ignoreElements: element => {
                    // Skip MapLibre GL controls that can interfere
                    if (element.classList.contains('maplibregl-control-container')) return true;
                    if (element.classList.contains('maplibregl-ctrl')) return true;
                    return false;
                },
            });

            canvas.toBlob(blob => {
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
                // Try to find map container by looking for map element
                mapContainer = document.querySelector('#map');
            }

            if (!mapContainer) {
                setCopyButtonText('地図が見つかりません');
                setTimeout(() => {
                    setCopyButtonText('クリップボードにコピー');
                }, 2000);
                return;
            }

            // Try to get MapLibre GL canvas directly first
            const getMapLibreCanvas = (): HTMLCanvasElement | null => {
                const mapCanvas = mapContainer!.querySelector('.maplibregl-canvas') as HTMLCanvasElement;
                if (mapCanvas && mapCanvas.width > 0 && mapCanvas.height > 0) {
                    // Try to get the map instance
                    const mapElement = mapCanvas.closest('[data-viz-id]') || mapContainer;
                    const mapInstance =
                        (mapElement as HTMLElement & { _map?: unknown })?._map ||
                        (mapCanvas.parentElement as HTMLElement & { _map?: unknown })?._map;

                    const mapInstanceWithCanvas = mapInstance as { getCanvas?: () => HTMLCanvasElement };
                    if (mapInstanceWithCanvas && typeof mapInstanceWithCanvas.getCanvas === 'function') {
                        try {
                            return mapInstanceWithCanvas.getCanvas();
                        } catch (e) {
                            console.warn('Failed to get canvas from MapLibre GL instance:', e);
                        }
                    }

                    return mapCanvas;
                }
                return null;
            };

            const mapCanvas = getMapLibreCanvas();
            let canvas: HTMLCanvasElement;

            if (mapCanvas) {
                // Direct canvas approach
                const containerRect = mapContainer.getBoundingClientRect();
                const exportCanvas = document.createElement('canvas');
                const ctx = exportCanvas.getContext('2d');

                if (ctx) {
                    exportCanvas.width = containerRect.width;
                    exportCanvas.height = containerRect.height;

                    // Set background
                    ctx.fillStyle = '#f9fafb';
                    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

                    try {
                        ctx.drawImage(mapCanvas, 0, 0, exportCanvas.width, exportCanvas.height);
                        canvas = exportCanvas;
                    } catch (e) {
                        console.warn('Direct canvas capture failed, falling back to html2canvas:', e);
                        // Fall through to html2canvas approach
                        canvas = await html2canvas(mapContainer as HTMLElement, {
                            useCORS: true,
                            allowTaint: true,
                            backgroundColor: null,
                            ignoreElements: element => {
                                if (element.classList.contains('maplibregl-control-container')) return true;
                                if (element.classList.contains('maplibregl-ctrl')) return true;
                                return false;
                            },
                        });
                    }
                } else {
                    // Fall back to html2canvas
                    canvas = await html2canvas(mapContainer as HTMLElement, {
                        useCORS: true,
                        allowTaint: true,
                        backgroundColor: null,
                        ignoreElements: element => {
                            if (element.classList.contains('maplibregl-control-container')) return true;
                            if (element.classList.contains('maplibregl-ctrl')) return true;
                            return false;
                        },
                    });
                }
            } else {
                // Fallback to html2canvas with optimized settings
                canvas = await html2canvas(mapContainer as HTMLElement, {
                    useCORS: true,
                    allowTaint: true,
                    backgroundColor: null,
                    ignoreElements: element => {
                        if (element.classList.contains('maplibregl-control-container')) return true;
                        if (element.classList.contains('maplibregl-ctrl')) return true;
                        return false;
                    },
                });
            }

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
