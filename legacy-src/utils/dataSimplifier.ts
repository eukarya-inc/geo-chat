/**
 * Utility functions to simplify data for AI consumption
 * Replaces large blob/geometry values with human-readable placeholders
 */

/**
 * Check if a column type is geometry
 */
export function isGeometryType(columnType?: string): boolean {
    if (!columnType) return false;
    const typeUpper = columnType.toUpperCase();
    return (
        typeUpper.includes('GEOMETRY') ||
        typeUpper.includes('POINT') ||
        typeUpper.includes('LINESTRING') ||
        typeUpper.includes('POLYGON') ||
        typeUpper.includes('MULTIPOINT') ||
        typeUpper.includes('MULTILINESTRING') ||
        typeUpper.includes('MULTIPOLYGON') ||
        typeUpper.includes('GEOMETRYCOLLECTION')
    );
}

/**
 * Simplify a single value for AI consumption
 * Replaces blob/geometry with placeholders to avoid sending large binary data
 */
export function simplifyValue(value: unknown, columnType?: string): unknown {
    if (value === null || value === undefined) {
        return null;
    }

    // Simplify geometry types
    if (isGeometryType(columnType)) {
        return '[Geometry]';
    }

    // Simplify binary data (BLOB)
    if (
        value instanceof Uint8Array ||
        value instanceof ArrayBuffer ||
        (value && typeof value === 'object' && 'byteLength' in value)
    ) {
        let byteLength = 0;
        if (value instanceof Uint8Array) {
            byteLength = value.byteLength;
        } else if (value instanceof ArrayBuffer) {
            byteLength = value.byteLength;
        } else if (value && typeof value === 'object' && 'byteLength' in value) {
            byteLength = (value as { byteLength: number }).byteLength;
        }

        if (byteLength > 0) {
            if (byteLength < 1024) {
                return `[Blob: ${byteLength}B]`;
            } else if (byteLength < 1024 * 1024) {
                return `[Blob: ${(byteLength / 1024).toFixed(1)}KB]`;
            } else {
                return `[Blob: ${(byteLength / (1024 * 1024)).toFixed(1)}MB]`;
            }
        }
        return '[Blob]';
    }

    // Return other values as-is
    return value;
}

/**
 * Simplify an array of data rows for AI consumption
 * Replaces blob/geometry values with placeholders based on column types from schema
 */
export function simplifyDataForAI(
    data: Record<string, unknown>[],
    schemaData: Array<{ column_name: string; column_type: string }>
): Record<string, unknown>[] {
    const columnTypeMap = new Map<string, string>();
    schemaData.forEach(col => {
        columnTypeMap.set(col.column_name, col.column_type);
    });

    return data.map(row => {
        const simplifiedRow: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
            const columnType = columnTypeMap.get(key);
            simplifiedRow[key] = simplifyValue(value, columnType);
        }
        return simplifiedRow;
    });
}
