import type { AsyncDuckDBConnection } from '@duckdb/duckdb-wasm';

export interface ColumnInfo {
    name: string;
    type: string;
}

export interface GeometryCheckResult {
    hasGeometry: boolean;
    geometryColumnName: string | null;
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
        const columnInfo: ColumnInfo[] = columns.map(row => ({
            name: (row as any).name,
            type: (row as any).type
        }));
        
        const allColumns = columnInfo.map(col => col.name).filter(name => name);
        
        // Find geometry column
        const geometryColumn = columnInfo.find(col => 
            col.type && col.type.toUpperCase().includes('GEOMETRY')
        );
        
        const hasGeometry = !!geometryColumn;
        const geometryColumnName = geometryColumn?.name || null;
        
        // Get non-geometry columns
        const nonGeometryColumns = columnInfo
            .filter(col => !col.type || !col.type.toUpperCase().includes('GEOMETRY'))
            .map(col => col.name);
        
        return {
            hasGeometry,
            geometryColumnName,
            allColumns,
            nonGeometryColumns
        };
    } catch (error) {
        console.error('Error checking table geometry:', error);
        return {
            hasGeometry: false,
            geometryColumnName: null,
            allColumns: [],
            nonGeometryColumns: []
        };
    }
}