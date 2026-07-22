/**
 * Utilities for stripping a UTF-8 BOM (Byte Order Mark) from strings.
 * DuckDB's CSV reader can carry a leading BOM into the first column name.
 */

/** True if the string starts with a UTF-8 BOM (as U+FEFF or the EF BB BF triple). */
export function hasBOM(str: string): boolean {
    if (!str) return false;
    return (
        str.charCodeAt(0) === 0xfeff ||
        (str.charCodeAt(0) === 0xef && str.charCodeAt(1) === 0xbb && str.charCodeAt(2) === 0xbf)
    );
}

/** Removes a leading UTF-8 BOM if present; returns the string unchanged otherwise. */
export function removeBOM(str: string): string {
    if (!str) return str;
    if (str.charCodeAt(0) === 0xfeff) return str.slice(1);
    if (str.charCodeAt(0) === 0xef && str.charCodeAt(1) === 0xbb && str.charCodeAt(2) === 0xbf) {
        return str.slice(3);
    }
    return str;
}
