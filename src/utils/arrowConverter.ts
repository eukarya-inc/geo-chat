/**
 * Converts Arrow types (Vector, StructRow) and BigInt values to regular JavaScript objects
 * This is needed because DuckDB-WASM returns Arrow format data that needs conversion for JSON serialization
 *
 * @param val - The value to convert
 * @param columnTypes - Optional map of column names to DuckDB type names (e.g., "HUGEINT", "BIGINT")
 */
export function convertArrowToJS(val: unknown, columnTypes?: Map<string, string>): unknown {
    // Handle null/undefined
    if (val === null || val === undefined) {
        return val;
    }

    // Handle BigInt - convert to number for JSON serialization
    if (typeof val === 'bigint') {
        return Number(val);
    }

    // Handle primitive types
    if (typeof val !== 'object') {
        return val;
    }

    // Handle arrays
    if (Array.isArray(val)) {
        return val.map(item => convertArrowToJS(item, columnTypes));
    }

    // Handle Arrow Vector (LIST types) - check constructor name
    const constructor = (val as Record<string, unknown>).constructor;
    if (constructor?.name === '_Vector') {
        const vector = val as { toArray(): unknown[] };
        return vector.toArray().map(item => convertArrowToJS(item, columnTypes));
    }

    // Handle Arrow StructRow or objects with toJSON method
    if ('toJSON' in val && typeof (val as { toJSON: unknown }).toJSON === 'function') {
        const struct = val as { toJSON(): unknown };
        return convertArrowToJS(struct.toJSON(), columnTypes);
    }

    // Handle plain objects - recursively convert all properties
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
        let convertedValue = convertArrowToJS(value, columnTypes);

        // Convert string to number for integer types that may be returned as strings
        if (columnTypes && columnTypes.has(key)) {
            const colType = columnTypes.get(key)?.toUpperCase();
            if (colType && isIntegerType(colType) && typeof convertedValue === 'string') {
                let trimmedValue = convertedValue.trim();

                // Remove surrounding quotes if present (handles cases like "\"50308\"")
                // This can happen when data is double-encoded as JSON
                if (trimmedValue.startsWith('"') && trimmedValue.endsWith('"')) {
                    trimmedValue = trimmedValue.slice(1, -1);
                }

                if (trimmedValue !== '') {
                    const numValue = Number(trimmedValue);
                    if (!isNaN(numValue) && isFinite(numValue)) {
                        convertedValue = numValue;
                    }
                }
            }
        }

        result[key] = convertedValue;
    }
    return result;
}

/**
 * Check if a DuckDB type is an integer type that might be returned as string
 * Note: Arrow represents HUGEINT and other large integers as Decimal types
 */
function isIntegerType(type: string): boolean {
    const upperType = type.toUpperCase();

    const integerTypes = [
        'TINYINT',
        'SMALLINT',
        'INTEGER',
        'BIGINT',
        'HUGEINT',
        'UTINYINT',
        'USMALLINT',
        'UINTEGER',
        'UBIGINT',
        'UHUGEINT',
        'INT',
        'INT1',
        'INT2',
        'INT4',
        'INT8',
    ];

    if (integerTypes.some(t => upperType.includes(t))) {
        return true;
    }

    // Check for Decimal with scale 0 (e.g., "Decimal[38e0]" for HUGEINT)
    // Decimal with scale 0 represents integer values
    if (upperType.includes('DECIMAL') && upperType.includes('E0')) {
        return true;
    }

    return false;
}
