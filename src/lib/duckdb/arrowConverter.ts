/**
 * Converts a DuckDB-WASM Arrow row into a plain JS object suitable for display
 * and JSON serialization.
 *
 * Design choices for Phase 2 (table display only):
 * - BigInt -> number when it fits in a safe integer, otherwise its string form.
 * - Arrow Vectors / StructRows / nested objects are recursively unwrapped.
 * - Dates are left as `Date` instances (the UI stringifies them).
 * - Binary values (Uint8Array / ArrayBuffer) — which is how DuckDB GEOMETRY
 *   arrives (WKB bytes) — are replaced with the placeholder string
 *   `"<geometry>"`. Actual geometry decoding/rendering is Phase 3's job.
 */
export const GEOMETRY_PLACEHOLDER = '<geometry>';

export function convertArrowToJS(val: unknown): unknown {
    if (val === null || val === undefined) return val;

    if (typeof val === 'bigint') {
        return Number.isSafeInteger(Number(val)) ? Number(val) : val.toString();
    }

    if (typeof val !== 'object') return val;

    if (val instanceof Date) return val;

    // Binary blobs (incl. WKB geometry) — not useful raw in a table view.
    if (val instanceof Uint8Array || val instanceof ArrayBuffer) {
        return GEOMETRY_PLACEHOLDER;
    }

    if (Array.isArray(val)) {
        return val.map(convertArrowToJS);
    }

    // Arrow LIST columns surface as `_Vector`.
    const ctorName = (val as { constructor?: { name?: string } }).constructor?.name;
    if (ctorName === '_Vector') {
        return (val as { toArray(): unknown[] }).toArray().map(convertArrowToJS);
    }

    // Arrow StructRow (and other Arrow rows) expose `toJSON()`.
    if (typeof (val as { toJSON?: unknown }).toJSON === 'function') {
        return convertArrowToJS((val as { toJSON(): unknown }).toJSON());
    }

    // Plain object — convert each field.
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(val)) {
        result[key] = convertArrowToJS(value);
    }
    return result;
}
