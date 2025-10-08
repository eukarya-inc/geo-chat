import type { DBContext } from '../../duckdb/dbContext';

export interface GeometryInfo {
    columnName: string;
    geometryType: string;
}

export interface GeometryDetectionResult {
    hasGeometry: boolean;
    geometryInfo?: GeometryInfo[];
}

/**
 * Detects geometry columns from table schema
 */
export function detectGeometryColumns(schema: Array<{ column_name: string; column_type: string }>): string[] {
    return schema
        .filter(col => col.column_type.toUpperCase() === 'GEOMETRY' || col.column_type.toUpperCase().startsWith('GEOMETRY('))
        .map(col => col.column_name);
}

/**
 * Gets actual geometry types using ST_GeometryType
 */
export async function getGeometryTypes(dbContext: DBContext, tableName: string, columnName: string, schema: string | null): Promise<string[]> {
    try {
        const typeQuery = schema
            ? `SELECT DISTINCT ST_GeometryType(${columnName}) as geom_type FROM ${schema}.${tableName} WHERE ${columnName} IS NOT NULL LIMIT 5`
            : `SELECT DISTINCT ST_GeometryType(${columnName}) as geom_type FROM ${tableName} WHERE ${columnName} IS NOT NULL LIMIT 5`;

        const typeResult = await dbContext.executeQuery(typeQuery, schema);
        const types = (typeResult as Array<{ geom_type: string }>).map(r => r.geom_type);
        return types;
    } catch (error) {
        // If ST_GeometryType fails, return empty array
        console.warn(`Failed to get geometry type for ${columnName}:`, error);
        return [];
    }
}

/**
 * Detects and analyzes geometry columns in a table
 */
export async function analyzeTableGeometry(dbContext: DBContext, tableName: string, schema: string | null): Promise<GeometryDetectionResult> {
    try {
        // Get table schema
        const schemaQuery = schema ? `DESCRIBE ${schema}.${tableName}` : `DESCRIBE ${tableName}`;
        const schemaResult = await dbContext.executeQuery(schemaQuery, schema);
        const tableSchema = schemaResult as Array<{ column_name: string; column_type: string }>;

        // Detect geometry columns
        const geometryColumns = detectGeometryColumns(tableSchema);

        if (geometryColumns.length === 0) {
            return { hasGeometry: false };
        }

        // Get actual geometry types for each column
        const geometryInfo: GeometryInfo[] = [];

        for (const columnName of geometryColumns) {
            const types = await getGeometryTypes(dbContext, tableName, columnName, schema);

            // Find the column type from schema
            const columnSchema = tableSchema.find(col => col.column_name === columnName);
            const columnType = columnSchema?.column_type || 'GEOMETRY';

            geometryInfo.push({
                columnName,
                geometryType: types.length > 0 ? types.join(', ') : columnType.toUpperCase(),
            });
        }

        return {
            hasGeometry: true,
            geometryInfo,
        };
    } catch (error) {
        console.error('Failed to analyze table geometry:', error);
        return { hasGeometry: false };
    }
}

/**
 * Formats geometry info for display
 */
export function formatGeometryInfo(geometryInfo: GeometryInfo[]): string {
    return geometryInfo.map(info => `${info.columnName} (${info.geometryType})`).join(', ');
}
