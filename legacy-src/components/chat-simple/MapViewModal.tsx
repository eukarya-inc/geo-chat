import { ClipboardDocumentIcon, PlusIcon, CheckIcon } from '@heroicons/react/24/outline';
import Map from '../map';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { ModalWrapper, type ToolButton } from './ModalWrapper';
import { useCallback } from 'react';
import { toBlob } from 'html-to-image';

interface MapViewModalProps {
    isOpen: boolean;
    onClose: () => void;
    tableName: string;
    geometryColumn?: string;
    dbContext: DBContext | null;
    schema?: string | null;
    onExportToDashboard?: () => void;
}

export function MapViewModal({
    isOpen,
    onClose,
    tableName,
    geometryColumn,
    dbContext,
    schema,
    onExportToDashboard,
}: MapViewModalProps) {
    const handleCopyMap = useCallback(async () => {
        try {
            // Check if Clipboard API is available
            if (!navigator.clipboard || !navigator.clipboard.write) {
                console.error('Clipboard API is not supported');
                return;
            }

            const mapContainer = document.querySelector('[id^="map-"]');
            if (!mapContainer) {
                console.error('Map container not found');
                return;
            }

            // Use html-to-image to capture the entire map container
            // html-to-image handles modern CSS including OKLCH colors natively
            const blob = await toBlob(mapContainer as HTMLElement, {
                cacheBust: true,
                pixelRatio: 2, // Higher quality for retina displays
            });

            if (!blob) {
                throw new Error('Failed to create image from map');
            }

            // Safari requires ClipboardItem to be created synchronously with a Promise
            const blobPromise = Promise.resolve(blob);

            await navigator.clipboard.write([new ClipboardItem({ 'image/png': blobPromise })]);
        } catch (err) {
            console.error('地図のコピーに失敗:', err);
        }
    }, []);

    const toolButtons: ToolButton[] = [
        {
            icon: <ClipboardDocumentIcon className="w-5 h-5 text-gray-600" />,
            label: '画像としてコピー',
            onClick: handleCopyMap,
            tooltip: '地図を画像としてクリップボードにコピー',
            temporaryIcon: <CheckIcon className="w-5 h-5 text-green-600" />,
            temporaryLabel: 'コピーしました',
            temporaryTooltip: 'コピーしました',
        },
    ];

    if (onExportToDashboard) {
        toolButtons.push({
            icon: <PlusIcon className="w-5 h-5 text-gray-600" />,
            label: 'ダッシュボードに書き出す',
            onClick: onExportToDashboard,
            tooltip: 'ダッシュボードにエクスポート',
        });
    }

    return (
        <ModalWrapper isOpen={isOpen} onClose={onClose} title={`地図: ${tableName}`} toolButtons={toolButtons}>
            {dbContext && tableName && isOpen ? (
                <Map
                    dbContext={dbContext}
                    selectedTable={tableName}
                    geometryColumnName={geometryColumn}
                    chatId={schema || null}
                />
            ) : (
                <div className="flex items-center justify-center h-full text-gray-500">地図を表示できません</div>
            )}
        </ModalWrapper>
    );
}
