import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface ColumnInfo {
    name: string;
    type: string;
}

export interface GeometryCheckResult {
    hasGeometry: boolean;
    geometryColumnName: string | null;
    geometryColumns: string[];
    allColumns: string[];
    nonGeometryColumns: string[];
}

/**
 * Check if a table has a geometry column and return column information
 */
export async function checkTableGeometry(
    connection: AsyncDuckDBConnection,
    tableName: string
): Promise<GeometryCheckResult> {
    try {
        // Query table schema using PRAGMA table_info
        const result = await connection.query(`PRAGMA table_info('${tableName}')`);
        const columns = result.toArray();
        
        // Extract column information
        const columnInfo: ColumnInfo[] = columns.map(row => {
            const rowData = row as Record<string, unknown>;
            return {
                name: String(rowData.name || ''),
                type: String(rowData.type || '')
            };
        });
        
        const allColumns = columnInfo.map(col => col.name).filter(name => name);
        
        // Find all geometry columns
        const geometryColumns = columnInfo
            .filter(col => col.type && col.type.toUpperCase().includes('GEOMETRY'))
            .map(col => col.name);
        
        const hasGeometry = geometryColumns.length > 0;
        const geometryColumnName = geometryColumns[0] || null;
        
        // Get non-geometry columns
        const nonGeometryColumns = columnInfo
            .filter(col => !col.type || !col.type.toUpperCase().includes('GEOMETRY'))
            .map(col => col.name);
        
        return {
            hasGeometry,
            geometryColumnName,
            geometryColumns,
            allColumns,
            nonGeometryColumns
        };
    } catch (error) {
        console.error('Error checking table geometry:', error);
        return {
            hasGeometry: false,
            geometryColumnName: null,
            geometryColumns: [],
            allColumns: [],
            nonGeometryColumns: []
        };
    }
}