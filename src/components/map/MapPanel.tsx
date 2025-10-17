import Map from './index';
import { MapDropdownMenu } from './MapDropdownMenu';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { MapSpec } from '../../store/remoteAtoms';

interface MapPanelProps {
    title?: string;
    tableName: string;
    geometryColumn?: string;
    dbContext: DBContext;
    schema?: string;
    mapSpec?: MapSpec;
    showControls?: boolean;
    onRemove?: () => void;
    showRemoveButton?: boolean;
    vizId?: string;
}

export function MapPanel({
    title,
    tableName,
    geometryColumn,
    dbContext,
    schema,
    mapSpec,
    showControls = false,
    onRemove,
    showRemoveButton = true,
    vizId,
}: MapPanelProps) {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Map Title Bar with Menu */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <h4 className="text-sm font-medium text-gray-900 truncate">{title || tableName || 'Map'}</h4>
                <MapDropdownMenu
                    vizId={vizId}
                    vizTitle={title || tableName}
                    onRemove={onRemove}
                    showRemoveButton={showRemoveButton}
                />
            </div>

            {/* Map Content */}
            <div className="flex-1 overflow-hidden">
                <div
                    className="h-full"
                    onMouseDown={e => showControls || e.stopPropagation()}
                    onTouchStart={e => showControls || e.stopPropagation()}
                >
                    <Map
                        dbContext={dbContext}
                        schema={schema}
                        selectedTable={tableName}
                        geometryColumnName={geometryColumn}
                        tableStyles={mapSpec?.tableStyles}
                        initialStyle={mapSpec?.style}
                        showControls={showControls}
                    />
                </div>
            </div>
        </div>
    );
}
