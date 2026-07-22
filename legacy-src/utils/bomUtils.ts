/**
 * Utility functions for handling BOM (Byte Order Mark) in strings
 */

/**
 * Removes BOM (Byte Order Mark) from the beginning of a string
 * Common BOMs:
 * - UTF-8: EF BB BF (\uFEFF)
 * - UTF-16 BE: FE FF
 * - UTF-16 LE: FF FE
 * - UTF-32 BE: 00 00 FE FF
 * - UTF-32 LE: FF FE 00 00
 */
export function removeBOM(str: string): string {
    if (!str) return str;

    // Most common: UTF-8 BOM
    if (str.charCodeAt(0) === 0xfeff) {
        return str.slice(1);
    }

    // Also handle the case where BOM is represented as three separate characters
    if (str.charCodeAt(0) === 0xef && str.charCodeAt(1) === 0xbb && str.charCodeAt(2) === 0xbf) {
        return str.slice(3);
    }

    return str;
}

/**
 * Checks if a string starts with a BOM
 */
export function hasBOM(str: string): boolean {
    if (!str) return false;

    return (
        str.charCodeAt(0) === 0xfeff ||
        (str.charCodeAt(0) === 0xef && str.charCodeAt(1) === 0xbb && str.charCodeAt(2) === 0xbf)
    );
}
