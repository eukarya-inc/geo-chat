// Validates and fixes common MapLibre style expression errors

export function validateAndFixStyleExpression(expr: unknown): unknown {
    if (!Array.isArray(expr)) return expr;
    
    // Handle case expressions
    if (expr[0] === 'case') {
        const fixed: unknown[] = ['case'];
        
        // Case expressions should have pairs of condition/result, plus optional default
        for (let i = 1; i < expr.length - 1; i += 2) {
            const condition = expr[i];
            const result = expr[i + 1];
            
            // Validate condition
            if (Array.isArray(condition)) {
                fixed.push(validateAndFixStyleExpression(condition));
            } else {
                fixed.push(condition);
            }
            
            // Add result
            fixed.push(result);
        }
        
        // Add default value if odd number of arguments (last one is default)
        if ((expr.length - 1) % 2 === 1) {
            fixed.push(expr[expr.length - 1]);
        }
        
        return fixed;
    }
    
    // Handle comparison operators
    if (['>=', '>', '<=', '<', '==', '!='].includes(expr[0] as string)) {
        if (expr.length !== 3) {
            console.warn(`Invalid comparison expression: ${JSON.stringify(expr)}`);
            return false; // Return false as a safe default
        }
        
        // Fix common error: [">=", value, property] should be [">=", property, value]
        const [op, left, right] = expr;
        
        // If left is a number and right is a get expression, swap them
        if (typeof left === 'number' && Array.isArray(right) && right[0] === 'get') {
            return [op, right, left];
        }
        
        // Recursively validate sub-expressions
        return [
            op,
            validateAndFixStyleExpression(left),
            validateAndFixStyleExpression(right)
        ];
    }
    
    // Handle get expressions
    if (expr[0] === 'get') {
        // Get expressions should have 1 or 2 arguments
        if (expr.length < 2 || expr.length > 3) {
            console.warn(`Invalid get expression: ${JSON.stringify(expr)}`);
            return null;
        }
        return expr;
    }
    
    // Recursively validate nested arrays
    return expr.map(item => validateAndFixStyleExpression(item));
}

// Log validation errors for debugging
export function logStyleExpressionIssues(expr: unknown, context: string): void {
    console.log(`Validating style expression for ${context}:`, JSON.stringify(expr));
    
    const validated = validateAndFixStyleExpression(expr);
    if (JSON.stringify(validated) !== JSON.stringify(expr)) {
        console.log(`Fixed expression:`, JSON.stringify(validated));
    }
}
