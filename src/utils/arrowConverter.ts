/**
 * Converts Arrow types (Vector, StructRow) and BigInt values to regular JavaScript objects
 * This is needed because DuckDB-WASM returns Arrow format data that needs conversion for JSON serialization
 */
export function convertArrowToJS(val: unknown): unknown {
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
        return val.map(convertArrowToJS);
    }

    // Handle Arrow Vector (LIST types) - check constructor name
    const constructor = (val as Record<string, unknown>).constructor;
    if (constructor?.name === '_Vector') {
        const vector = val as { toArray(): unknown[] };
        return vector.toArray().map(convertArrowToJS);
    }

    // Handle Arrow StructRow or objects with toJSON method
    if ('toJSON' in val && typeof (val as { toJSON: unknown }).toJSON === 'function') {
        const struct = val as { toJSON(): unknown };
        return convertArrowToJS(struct.toJSON());
    }

    // Handle plain objects - recursively convert all properties
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
        result[key] = convertArrowToJS(value);
    }
    return result;
}
