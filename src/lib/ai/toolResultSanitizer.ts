/**
 * Generic sanitizer for tool results before storing in messages.
 * Removes large arrays to prevent excessive message storage size.
 */

/**
 * Configuration for sanitization
 */
export interface SanitizeConfig {
    /**
     * Maximum number of array elements to keep.
     * Arrays larger than this will be removed.
     * @default 10
     */
    maxArraySize?: number;

    /**
     * Maximum object depth to traverse.
     * Prevents infinite recursion and improves performance.
     * @default 5
     */
    maxDepth?: number;
}

const DEFAULT_CONFIG: Required<SanitizeConfig> = {
    maxArraySize: 10,
    maxDepth: 5,
};

/**
 * Recursively sanitize an object by removing large arrays.
 * This prevents tool results with large data sets from bloating message storage.
 *
 * @param obj - The object to sanitize
 * @param config - Configuration for sanitization
 * @param depth - Current recursion depth (internal use)
 * @returns Sanitized object with large arrays removed
 *
 * @example
 * ```ts
 * const result = {
 *   success: true,
 *   data: Array(100).fill({ id: 1 }), // Large array
 *   metadata: { count: 100 }
 * };
 *
 * const sanitized = sanitizeToolResult(result);
 * // { success: true, metadata: { count: 100 } }
 * // 'data' field is removed because it's too large
 * ```
 */
export function sanitizeToolResult(obj: unknown, config: SanitizeConfig = {}, depth: number = 0): unknown {
    const { maxArraySize, maxDepth } = { ...DEFAULT_CONFIG, ...config };

    // Prevent infinite recursion
    if (depth > maxDepth) {
        return obj;
    }

    // Handle null/undefined
    if (obj === null || obj === undefined) {
        return obj;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
        // If array is too large, remove it entirely
        if (obj.length > maxArraySize) {
            console.log(`[Tool Result Sanitizer] Removed array with ${obj.length} elements (max: ${maxArraySize})`);
            return undefined;
        }
        // Recursively sanitize array elements
        return obj.map(item => sanitizeToolResult(item, config, depth + 1));
    }

    // Handle objects
    if (typeof obj === 'object') {
        const sanitized: Record<string, unknown> = {};
        let removedFields = 0;

        for (const [key, value] of Object.entries(obj)) {
            const sanitizedValue = sanitizeToolResult(value, config, depth + 1);
            // Only include fields that weren't removed (not undefined)
            if (sanitizedValue !== undefined) {
                sanitized[key] = sanitizedValue;
            } else if (Array.isArray(value) && value.length > maxArraySize) {
                // Field was removed due to large array
                removedFields++;
            }
        }

        if (removedFields > 0) {
            console.log(`[Tool Result Sanitizer] Removed ${removedFields} large array field(s) from object`);
        }

        return sanitized;
    }

    // Primitives (string, number, boolean) pass through
    return obj;
}

/**
 * Calculate approximate size of an object in bytes (for logging/debugging)
 */
export function estimateObjectSize(obj: unknown): number {
    const seen = new WeakSet();

    function calculate(o: unknown): number {
        if (o === null || o === undefined) return 0;

        if (typeof o === 'string') return o.length * 2; // UTF-16
        if (typeof o === 'number') return 8;
        if (typeof o === 'boolean') return 4;

        if (typeof o === 'object') {
            // Prevent circular reference
            if (seen.has(o as object)) return 0;
            seen.add(o as object);

            if (Array.isArray(o)) {
                return o.reduce((sum, item) => sum + calculate(item), 0);
            }

            return Object.entries(o).reduce((sum, [key, value]) => {
                return sum + key.length * 2 + calculate(value);
            }, 0);
        }

        return 0;
    }

    return calculate(obj);
}
