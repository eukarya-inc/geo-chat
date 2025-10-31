import { useEffect, useState } from 'react';
import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { TableView } from './TableView';
import { TableDropdownMenu } from './TableDropdownMenu';
import { VisualizationHeader } from '../common/VisualizationHeader';
import { createExportButton } from '../common/VisualizationToolButtons';

interface TablePanelProps {
    title?: string; // Display title (can be customized)
    tableName: string; // Actual table name in DuckDB (immutable)
    dbContext: DBContext;
    schema?: string | null;
    onExport?: () => void;
    showExportButton?: boolean;
    isExportDisabled?: boolean;
    exportTooltip?: string;
    onRemove?: () => void;
    showRemoveButton?: boolean;
    editable?: boolean;
    onTitleChange?: (newTitle: string) => void;
}

export function TablePanel({
    title,
    tableName,
    dbContext,
    schema,
    onExport,
    showExportButton = false,
    isExportDisabled = false,
    exportTooltip,
    onRemove,
    showRemoveButton = false,
    editable = false,
    onTitleChange,
}: TablePanelProps) {
    const [connection, setConnection] = useState<AsyncDuckDBConnection | null>(null);

    useEffect(() => {
        let isMounted = true;
        let conn: AsyncDuckDBConnection | null = null;

        const initConnection = async () => {
            conn = await dbContext.createManagedConnection(schema || null);
            if (isMounted) {
                setConnection(conn);
            }
        };

        initConnection();

        return () => {
            isMounted = false;
            if (conn) {
                conn.close().catch(err => {
                    console.error('Failed to close connection:', err);
                });
            }
        };
    }, [dbContext, schema]);

    const toolButtons = [];

    // Add export button if enabled
    if (showExportButton && onExport) {
        toolButtons.push(
            createExportButton({
                onExport,
                disabled: isExportDisabled,
                tooltip: exportTooltip,
            })
        );
    }

    if (!connection) {
        return (
            <div className="h-full flex items-center justify-center bg-gray-50">
                <p className="text-sm text-gray-500">Loading table...</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Table Title Bar with Menu */}
            <VisualizationHeader
                title={title || tableName || 'Table'}
                toolButtons={toolButtons}
                editable={editable}
                onTitleChange={onTitleChange}
                menu={
                    <TableDropdownMenu
                        tableName={tableName}
                        dbContext={dbContext}
                        schema={schema}
                        onExport={onExport}
                        showExportButton={showExportButton}
                        isExportDisabled={isExportDisabled}
                        onRemove={onRemove}
                        showRemoveButton={showRemoveButton}
                    />
                }
            />

            {/* Table Content */}
            <div className="flex-1 overflow-hidden">
                <TableView connection={connection} tableName={tableName} dbContext={dbContext} />
            </div>
        </div>
    );
}
