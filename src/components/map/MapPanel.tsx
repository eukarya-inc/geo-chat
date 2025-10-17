import { useState, useRef } from 'react';
import Map from './index';
import { MapDropdownMenu } from './MapDropdownMenu';
import { MapStyleModal } from './MapStyleModal';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { MapSpec } from '../../store/remoteAtoms';
import type { MapStyleManager } from './mapStyleManager';

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

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Map Title Bar with Menu */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <h4 className="text-sm font-medium text-gray-900 truncate">{title || tableName || 'Map'}</h4>
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
