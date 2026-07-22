/**
 * Fixes common mistakes in MapLibre GL expressions that AI tends to make
 */

export interface ExpressionFixResult {
    fixed: unknown;
    warnings: string[];
}

/**
 * Validates and fixes malformed MapLibre GL get expressions
 * Common AI mistakes:
 * 1. Adding default values as third parameter to nested get: ["get", "field", ["get", "struct", 0]]
 * 2. Incorrect nesting of get expressions
 * 3. Using numbers where expressions are expected
 *
 * @param expr - The expression to fix (can be any type)
 * @returns The fixed expression and warnings
 */
export function fixMaplibreExpressionWithWarnings(expr: unknown): ExpressionFixResult {
    const warnings: string[] = [];
    const fixed = fixExpressionRecursive(expr, warnings);
    return { fixed, warnings };
}

/**
 * Legacy function for backward compatibility
 * @param expr - The expression to fix
 * @returns The fixed expression
 */
export function fixMaplibreExpression(expr: unknown): unknown {
    return fixMaplibreExpressionWithWarnings(expr).fixed;
}

/**
 * Internal recursive function that fixes expressions and collects warnings
 */
function fixExpressionRecursive(expr: unknown, warnings: string[]): unknown {
    if (!Array.isArray(expr)) return expr;

    // Handle 'get' expressions
    if (expr[0] === 'get') {
        return fixGetExpression(expr, warnings);
    }

    // Handle 'case' expressions
    if (expr[0] === 'case') {
        return fixCaseExpression(expr, warnings);
    }

    // Handle comparison operators
    if (['==', '!=', '<', '<=', '>', '>=', 'all', 'any'].includes(expr[0])) {
        return fixComparisonExpression(expr, warnings);
    }

    // Handle interpolate expressions
    if (expr[0] === 'interpolate') {
        return fixInterpolateExpression(expr, warnings);
    }

    // Recursively fix nested expressions
    return expr.map(item => fixExpressionRecursive(item, warnings));
}

/**
 * Fixes get expressions specifically
 */
function fixGetExpression(expr: unknown[], warnings: string[]): unknown[] {
    // Basic get with property name
    if (expr.length === 2) {
        return expr;
    }

    // Get with nested expression or invalid default
    if (expr.length === 3) {
        const [op, prop, third] = expr;

        // Special case: AI trying to access array element with ["get", field, ["get", array, index]]
        // This pattern suggests trying to access array[index].field
        if (Array.isArray(third) && third[0] === 'get' && third.length === 3 && typeof third[2] === 'number') {
            const arrayField = third[1];
            const index = third[2];

            // MapLibre doesn't support complex array indexing in this way
            // The best we can do is warn and return a fallback
            const warning = `Cannot access array element ${arrayField}[${index}].${prop} in MapLibre expressions. Using fallback value null instead.`;
            warnings.push(warning);
            console.warn(warning);

            // Return a literal null which won't cause validation errors
            return ['literal', null];
        }

        // Special case: AI trying to access property of array element with ["get", property, ["at", index, ["get", array]]]
        // This pattern suggests trying to access array[index].property
        if (Array.isArray(third) && third[0] === 'at') {
            // Extract details for warning
            const index = third[1];
            const arrayExpr = third[2];
            const arrayName = Array.isArray(arrayExpr) && arrayExpr[0] === 'get' ? arrayExpr[1] : 'array';

            // MapLibre doesn't support accessing properties of array elements
            const warning = `Cannot access property "${prop}" of array element ${arrayName}[${index}] in MapLibre expressions. Arrays of objects are not supported for property styling. Consider flattening your data structure in SQL.`;
            warnings.push(warning);
            console.warn(warning);

            // Return a literal null which won't cause validation errors
            return ['literal', null];
        }

        // If third param is a nested get expression, recursively fix it
        if (Array.isArray(third) && third[0] === 'get') {
            // Recursively fix the nested get
            return [op, prop, fixExpressionRecursive(third, warnings)];
        }

        // If third param is just a number (invalid default value), remove it
        if (typeof third === 'number') {
            const warning = `Removed invalid default value ${third} from ["get", "${prop}", ${third}]. Use ["coalesce", ["get", "${prop}"], ${third}] if you need a default value.`;
            warnings.push(warning);
            console.warn(warning);
            return [op, prop];
        }

        // If third param is another type of expression, recursively fix it
        if (Array.isArray(third)) {
            return [op, prop, fixExpressionRecursive(third, warnings)];
        }
    }

    // Unexpected number of parameters
    if (expr.length > 3) {
        const warning = `Get expression has too many parameters (${expr.length}). Using only the first 2.`;
        warnings.push(warning);
        console.warn(warning);
        return [expr[0], expr[1]];
    }

    return expr;
}

/**
 * Fixes case expressions
 */
function fixCaseExpression(expr: unknown[], warnings: string[]): unknown[] {
    const result = [expr[0]]; // 'case'

    // Process pairs of condition-value plus optional default
    for (let i = 1; i < expr.length; i++) {
        // For odd indices (conditions) or the last element (default value)
        if (i % 2 === 1 && i < expr.length - 1) {
            // This should be a condition - fix it recursively
            result.push(fixExpressionRecursive(expr[i], warnings));
        } else {
            // This is a value or the default - add as is but fix if it's an expression
            if (Array.isArray(expr[i])) {
                result.push(fixExpressionRecursive(expr[i], warnings));
            } else {
                result.push(expr[i]);
            }
        }
    }

    return result;
}

/**
 * Fixes comparison expressions
 */
function fixComparisonExpression(expr: unknown[], warnings: string[]): unknown[] {
    const [operator, ...operands] = expr;
    return [operator, ...operands.map(op => fixExpressionRecursive(op, warnings))];
}

/**
 * Fixes interpolate expressions
 */
function fixInterpolateExpression(expr: unknown[], warnings: string[]): unknown[] {
    if (expr.length < 4) {
        const warning = 'Interpolate expression has too few parameters';
        warnings.push(warning);
        console.warn(warning);
        return expr;
    }

    const [op, interpolationType, input, ...stops] = expr;

    // Fix the input expression (usually a get expression)
    const fixedInput = fixExpressionRecursive(input, warnings);

    // Ensure interpolate domain works with numeric values (vector tiles stringify properties)
    let numericInput = fixedInput;
    if (Array.isArray(fixedInput) && fixedInput[0] === 'get') {
        numericInput = ['to-number', fixedInput];
    }

    // Stops should be alternating input/output values
    const fixedStops = stops.map((stop, index) => {
        // Even indices are input values (numbers), odd indices might be colors or expressions
        if (index % 2 === 0) {
            return stop; // Input values are typically numbers
        } else {
            // Output values might be expressions that need fixing
            return Array.isArray(stop) ? fixExpressionRecursive(stop, warnings) : stop;
        }
    });

    return [op, interpolationType, numericInput, ...fixedStops];
}

/**
 * Validates if an expression is likely valid
 * This is a simple check and doesn't cover all MapLibre GL expression rules
 */
export function isValidExpression(expr: unknown): boolean {
    if (!Array.isArray(expr)) return true;

    const [operator] = expr;

    // Check if it's a known operator
    const validOperators = [
        'get',
        'has',
        'in',
        'case',
        'coalesce',
        'interpolate',
        '==',
        '!=',
        '<',
        '<=',
        '>',
        '>=',
        'all',
        'any',
        'none',
        '+',
        '-',
        '*',
        '/',
        '%',
        '^',
        'concat',
        'downcase',
        'upcase',
        'rgb',
        'rgba',
        'to-color',
        'typeof',
        'string',
        'number',
        'boolean',
        'literal',
        'array',
        'at',
        'length',
        'slice',
    ];

    if (!validOperators.includes(operator)) {
        return false;
    }

    // Special validation for get expressions
    if (operator === 'get') {
        // Should have 2 or 3 params, and if 3, the third should be an expression
        if (expr.length > 3) return false;
        if (expr.length === 3) {
            const third = expr[2];
            // Third param should be an array (expression) not a primitive
            if (!Array.isArray(third) && third !== null && third !== undefined) {
                // Unless it's a valid object parameter (rare case)
                if (typeof third !== 'object') {
                    return false;
                }
            }
        }
    }

    return true;
}
