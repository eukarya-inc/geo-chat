import { useState, useRef } from 'react';
import Map from './index';
import { MapDropdownMenu } from './MapDropdownMenu';
import { MapStyleModal } from './MapStyleModal';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { MapSpec } from '../../store/remoteAtoms';
import type { MapStyleManager } from './mapStyleManager';
import html2canvas from 'html2canvas';
import { VisualizationHeader } from '../common/VisualizationHeader';
import { createCopyButton, createExportButton } from '../common/VisualizationToolButtons';

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
                console.error('Clipboard API is not supported');
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
                console.error('Map container not found');
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
        } catch (err) {
            console.error('Error copying map:', err);
        }
    };

    const toolButtons = [
        createCopyButton({
            onCopy: handleCopyMapToClipboard,
        }),
        ...(showExportButton && onExport
            ? [
                  createExportButton({
                      onExport: () => {
                          if (!isExportDisabled) {
                              onExport();
                          }
                      },
                      disabled: isExportDisabled,
                      tooltip: exportTooltip,
                  }),
              ]
            : []),
    ];

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Map Title Bar with Menu */}
            <VisualizationHeader
                title={title || tableName || 'Map'}
                toolButtons={toolButtons}
                menu={
                    <MapDropdownMenu
                        vizId={vizId}
                        vizTitle={title || tableName}
                        onRemove={onRemove}
                        onExport={onExport}
                        showRemoveButton={showRemoveButton}
                        showExportButton={showExportButton}
                        isExportDisabled={isExportDisabled}
                        onOpenStyleEditor={() => setIsStyleModalOpen(true)}
                    />
                }
            />

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
