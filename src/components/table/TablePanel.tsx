import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';
import type { DBContext } from '../../lib/duckdb/dbContext';
import { TableView } from './TableView';
import { TableDropdownMenu } from './TableDropdownMenu';
import { VisualizationHeader } from '../common/VisualizationHeader';

interface TablePanelProps {
    connection: AsyncDuckDBConnection;
    tableName: string;
    dbContext: DBContext;
    schema?: string | null;
}

export function TablePanel({ connection, tableName, dbContext, schema }: TablePanelProps) {
    return (
        <div className="h-full flex flex-col overflow-hidden">
            {/* Table Title Bar with Menu */}
            <VisualizationHeader
                title={tableName || 'Table'}
                toolButtons={[]}
                menu={<TableDropdownMenu tableName={tableName} dbContext={dbContext} schema={schema} />}
            />

            {/* Table Content */}
            <div className="flex-1 overflow-hidden">
                <TableView connection={connection} tableName={tableName} dbContext={dbContext} />
            </div>
        </div>
    );
}
