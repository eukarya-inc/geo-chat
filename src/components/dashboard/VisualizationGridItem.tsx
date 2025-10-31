import { ChartBarIcon, MapIcon } from '@heroicons/react/24/outline';
import { ChartPanel } from '../chart';
import { MapPanel } from '../map';
import { TablePanel } from '../table/TablePanel';
import type { ChartSpec } from '../../types/chart';
import type { DBContext } from '../../lib/duckdb/dbContext';
import type { DashboardVisualization } from '../../store/remoteAtoms';

interface VisualizationGridItemProps {
    viz: DashboardVisualization;
    dbContext: DBContext;
    schemaName: string;
    onRemove: (vizId: string) => void;
    onUpdateChart: (vizId: string, newSpec: ChartSpec) => void;
    onUpdateTitle: (vizId: string, newTitle: string) => void;
}

export function VisualizationGridItem({
    viz,
    dbContext,
    schemaName,
    onRemove,
    onUpdateChart,
    onUpdateTitle,
}: VisualizationGridItemProps) {
    if (viz.type === 'chart' && viz.chartSpec) {
        return (
            <ChartPanel
                chartSpec={viz.chartSpec}
                dbContext={dbContext}
                schema={schemaName}
                configMode="modal"
                vizId={viz.id}
                onRemove={() => onRemove(viz.id)}
                onSpecChange={newSpec => onUpdateChart(viz.id, newSpec)}
                showDataSourceButton={true}
                editable={true}
                onTitleChange={newTitle => onUpdateTitle(viz.id, newTitle)}
            />
        );
    }

    if (viz.type === 'map' && viz.tableName) {
        return (
            <MapPanel
                title={viz.title}
                tableName={viz.tableName}
                geometryColumn={viz.geometryColumn}
                dbContext={dbContext}
                schema={schemaName}
                mapSpec={viz.mapSpec}
                onRemove={() => onRemove(viz.id)}
                vizId={viz.id}
                editable={true}
                onTitleChange={newTitle => onUpdateTitle(viz.id, newTitle)}
            />
        );
    }

    if (viz.type === 'table' && viz.tableName) {
        return (
            <TablePanel
                title={viz.title}
                tableName={viz.tableName}
                dbContext={dbContext}
                schema={schemaName}
                onRemove={() => onRemove(viz.id)}
                showRemoveButton={true}
                editable={true}
                onTitleChange={newTitle => onUpdateTitle(viz.id, newTitle)}
            />
        );
    }

    // Fallback for missing or invalid visualizations
    return (
        <div className="h-full flex flex-col">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 bg-gray-50 cursor-move">
                <h4 className="text-sm font-medium text-gray-900 truncate">{viz.title}</h4>
            </div>
            <div className="flex-1 p-2 overflow-hidden">
                <div className="h-full flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <div className="mb-2">
                            {viz.type === 'chart' && <ChartBarIcon className="w-8 h-8 mx-auto text-gray-300" />}
                            {viz.type === 'map' && <MapIcon className="w-8 h-8 mx-auto text-gray-300" />}
                        </div>
                        <p className="text-sm">
                            {viz.type === 'chart'
                                ? 'Chart spec missing'
                                : viz.type === 'map'
                                  ? 'Map table missing'
                                  : `${viz.type} visualization`}
                        </p>
                        {viz.sql && <p className="text-xs mt-2 font-mono bg-gray-100 p-2 rounded">{viz.sql}</p>}
                    </div>
                </div>
            </div>
        </div>
    );
}
