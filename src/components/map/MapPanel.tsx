import { useState, useRef } from 'react';
import Map from './index';
import { MapDropdownMenu } from './MapDropdownMenu';
import { MapStyleModal } from './MapStyleModal';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { MapSpec } from '../../store/remoteAtoms';
import type { MapStyleManager } from './mapStyleManager';
import { ClipboardDocumentIcon, ArrowUpTrayIcon, PaintBrushIcon } from '@heroicons/react/24/outline';
import html2canvas from 'html2canvas';

interface MapPanelProps {
    title?: string;
    tableName: string;
    geometryColumn?: string;
    dbContext: DBContext;
    schema?: string;
    mapSpec?: MapSpec;
    onRemove?: () => void;
    onExport?: () => void;
    showRemoveButton?: boolean;
    showExportButton?: boolean;
    isExportDisabled?: boolean;
    exportTooltip?: string;
    vizId?: string;
}

export function MapPanel({
    title,
    tableName,
    geometryColumn,
    dbContext,
    schema,
    mapSpec,
    onRemove,
    onExport,
    showRemoveButton = true,
    showExportButton = true,
    isExportDisabled = false,
    exportTooltip,
    vizId,
}: MapPanelProps) {
    const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
    const styleManagerRef = useRef<MapStyleManager | null>(null);
    const styleChangeHandlerRef = useRef<((style: maplibregl.StyleSpecification) => void) | null>(null);

    const handleMapReady = (styleManager: MapStyleManager) => {
        styleManagerRef.current = styleManager;
    };

    const handleStyleChange = (handler: (style: maplibregl.StyleSpecification) => void) => {
        styleChangeHandlerRef.current = handler;
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

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Map Title Bar with Menu */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <h4 className="text-sm font-medium text-gray-900 truncate">{title || tableName || 'Map'}</h4>
                <div className="flex items-center gap-0.5">
                    <button
                        onClick={handleCopyMapToClipboard}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-2 cursor-pointer rounded hover:bg-gray-100"
                        title="クリップボードにコピー"
                        type="button"
                    >
                        <ClipboardDocumentIcon className="w-5 h-5" />
                    </button>
                    {showExportButton && onExport && (
                        <button
                            onClick={() => {
                                if (!isExportDisabled) {
                                    onExport();
                                }
                            }}
                            className={`transition-colors p-2 rounded ${
                                isExportDisabled
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-400 hover:text-gray-600 cursor-pointer hover:bg-gray-100'
                            }`}
                            title={exportTooltip || 'ダッシュボードにエクスポート'}
                            disabled={isExportDisabled}
                            type="button"
                        >
                            <ArrowUpTrayIcon className="w-5 h-5" />
                        </button>
                    )}
                    <button
                        onClick={() => setIsStyleModalOpen(true)}
                        className="text-gray-400 hover:text-gray-600 transition-colors p-2 cursor-pointer rounded hover:bg-gray-100"
                        title="地図スタイルを編集"
                        type="button"
                    >
                        <PaintBrushIcon className="w-5 h-5" />
                    </button>
                    <MapDropdownMenu
                        vizId={vizId}
                        vizTitle={title || tableName}
                        onRemove={onRemove}
                        onExport={onExport}
                        showRemoveButton={showRemoveButton}
                        showExportButton={showExportButton}
                        isExportDisabled={isExportDisabled}
                        exportTooltip={exportTooltip}
                        onOpenStyleEditor={() => setIsStyleModalOpen(true)}
                    />
                </div>
            </div>

            {/* Map Content */}
            <div className="flex-1 overflow-hidden">
                <Map
                    dbContext={dbContext}
                    schema={schema}
                    selectedTable={tableName}
                    geometryColumnName={geometryColumn}
                    tableStyles={mapSpec?.tableStyles}
                    initialStyle={mapSpec?.style}
                    onMapReady={handleMapReady}
                    onStyleChange={handleStyleChange}
                />
            </div>

            {/* Style Editor Modal */}
            <MapStyleModal
                isOpen={isStyleModalOpen}
                onClose={() => setIsStyleModalOpen(false)}
                styleManager={styleManagerRef.current}
                onStyleChange={styleChangeHandlerRef.current || undefined}
            />
        </div>
    );
}
