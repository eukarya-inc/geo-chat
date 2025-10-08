import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fixMaplibreExpression, fixMaplibreExpressionWithWarnings, isValidExpression } from './maplibreExpressionFixer';

// Mock console.warn to test warnings
const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

describe('maplibreExpressionFixer', () => {
    beforeEach(() => {
        consoleWarnSpy.mockClear();
    });

    describe('fixMaplibreExpression', () => {
        describe('get expressions', () => {
            it('should leave valid simple get expressions unchanged', () => {
                const expr = ['get', 'property'];
                expect(fixMaplibreExpression(expr)).toEqual(expr);
                expect(consoleWarnSpy).not.toHaveBeenCalled();
            });

            it('should leave valid nested get expressions unchanged', () => {
                const expr = ['get', 'field', ['get', 'parent']];
                expect(fixMaplibreExpression(expr)).toEqual(expr);
                expect(consoleWarnSpy).not.toHaveBeenCalled();
            });

            it('should handle array indexing attempt (common AI mistake)', () => {
                // AI tries to access array[index].field which MapLibre doesn't support
                const expr = ['get', '営業収入_千円', ['get', '輸送実績', 0]];
                const expected = ['literal', null];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access array element 輸送実績[0].営業収入_千円 in MapLibre expressions. Using fallback value null instead.'
                );
            });

            it('should remove invalid default value from simple get', () => {
                // AI might add default directly to get
                const expr = ['get', 'property', 100];
                const expected = ['get', 'property'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Removed invalid default value 100 from ["get", "property", 100]. Use ["coalesce", ["get", "property"], 100] if you need a default value.'
                );
            });

            it('should handle deeply nested get expressions', () => {
                const expr = ['get', 'a', ['get', 'b', ['get', 'c']]];
                expect(fixMaplibreExpression(expr)).toEqual(expr);
            });

            it('should fix multiple levels of array access attempts', () => {
                const expr = ['get', 'level1', ['get', 'level2', ['get', 'level3', 999]]];
                // The innermost array access gets replaced with literal null, propagating up
                const expected = ['get', 'level1', ['literal', null]];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access array element level3[999].level2 in MapLibre expressions. Using fallback value null instead.'
                );
            });

            it('should handle get with too many parameters', () => {
                const expr = ['get', 'prop', 'extra1', 'extra2'];
                const expected = ['get', 'prop'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith('Get expression has too many parameters (4). Using only the first 2.');
            });
        });

        describe('case expressions', () => {
            it('should leave valid case expressions unchanged', () => {
                const expr = ['case', ['>', ['get', 'value'], 100], 'red', ['>', ['get', 'value'], 50], 'yellow', 'green'];
                expect(fixMaplibreExpression(expr)).toEqual(expr);
            });

            it('should fix array indexing attempts within case conditions', () => {
                const expr = ['case', ['>=', ['get', '営業収入_千円', ['get', '輸送実績', 0]], 10000], '#ff4444', '#aaaaaa'];
                const expected = ['case', ['>=', ['literal', null], 10000], '#ff4444', '#aaaaaa'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access array element 輸送実績[0].営業収入_千円 in MapLibre expressions. Using fallback value null instead.'
                );
            });

            it('should handle multiple conditions with fixes', () => {
                const expr = ['case', ['==', ['get', 'type', 0], 'A'], 'red', ['==', ['get', 'type', 0], 'B'], 'blue', 'gray'];
                const expected = ['case', ['==', ['get', 'type'], 'A'], 'red', ['==', ['get', 'type'], 'B'], 'blue', 'gray'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
            });
        });

        describe('comparison expressions', () => {
            it('should fix get expressions within comparisons', () => {
                const expr = ['>', ['get', 'value', 0], 100];
                const expected = ['>', ['get', 'value'], 100];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
            });

            it('should handle all comparison operators', () => {
                const operators = ['==', '!=', '<', '<=', '>', '>='];
                operators.forEach(op => {
                    const expr = [op, ['get', 'prop', 999], 100];
                    const expected = [op, ['get', 'prop'], 100];
                    expect(fixMaplibreExpression(expr)).toEqual(expected);
                });
            });

            it('should fix both sides of comparison', () => {
                const expr = ['>=', ['get', 'a', 0], ['get', 'b', 0]];
                const expected = ['>=', ['get', 'a'], ['get', 'b']];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
            });
        });

        describe('interpolate expressions', () => {
            it('should leave valid interpolate expressions unchanged', () => {
                const expr = ['interpolate', ['linear'], ['get', 'population'], 0, '#ffffff', 1000000, '#ff0000'];
                expect(fixMaplibreExpression(expr)).toEqual(expr);
            });

            it('should fix get expression in interpolate input', () => {
                const expr = ['interpolate', ['linear'], ['get', 'value', 0], 0, 'blue', 100, 'red'];
                const expected = ['interpolate', ['linear'], ['get', 'value'], 0, 'blue', 100, 'red'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
            });

            it('should handle array access attempt in interpolate', () => {
                const expr = ['interpolate', ['linear'], ['get', 'revenue', ['get', 'metrics', 0]], 0, '#00ff00', 1000000, '#ff0000'];
                const expected = ['interpolate', ['linear'], ['literal', null], 0, '#00ff00', 1000000, '#ff0000'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access array element metrics[0].revenue in MapLibre expressions. Using fallback value null instead.'
                );
            });
        });

        describe('at expressions', () => {
            it('should detect and fix invalid property access using at expression', () => {
                // AI tries to access array[index].property using ["get", "property", ["at", index, ["get", "array"]]]
                const expr = ['get', '営業収入_千円', ['at', 10, ['get', '輸送実績']]];
                const expected = ['literal', null];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access property "営業収入_千円" of array element 輸送実績[10] in MapLibre expressions. Arrays of objects are not supported for property styling. Consider flattening your data structure in SQL.'
                );
            });

            it('should fix at expression in case statement', () => {
                const expr = ['case', ['>=', ['get', '営業収入_千円', ['at', 10, ['get', '輸送実績']]], 10000], '#ff4444', '#aaaaaa'];
                const expected = ['case', ['>=', ['literal', null], 10000], '#ff4444', '#aaaaaa'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access property "営業収入_千円" of array element 輸送実績[10] in MapLibre expressions. Arrays of objects are not supported for property styling. Consider flattening your data structure in SQL.'
                );
            });
        });

        describe('fixMaplibreExpressionWithWarnings', () => {
            it('should return warnings array with fixed expression', () => {
                const expr = ['get', 'property', 100];
                const result = fixMaplibreExpressionWithWarnings(expr);
                expect(result.fixed).toEqual(['get', 'property']);
                expect(result.warnings).toHaveLength(1);
                expect(result.warnings[0]).toBe(
                    'Removed invalid default value 100 from ["get", "property", 100]. Use ["coalesce", ["get", "property"], 100] if you need a default value.'
                );
            });

            it('should collect multiple warnings', () => {
                const expr = ['case', ['>=', ['get', 'a', 10], ['get', 'b', 20]], 'red', 'blue'];
                const result = fixMaplibreExpressionWithWarnings(expr);
                expect(result.warnings).toHaveLength(2);
                expect(result.warnings[0]).toContain('Removed invalid default value 10');
                expect(result.warnings[1]).toContain('Removed invalid default value 20');
            });
        });

        describe('complex nested expressions', () => {
            it('should fix complex real-world expression from AI', () => {
                // This is the actual expression that caused the error
                const expr = ['case', ['>=', ['get', '営業収入_千円', ['get', '輸送実績', 0]], 10000], '#ff4444', '#aaaaaa'];
                const expected = ['case', ['>=', ['literal', null], 10000], '#ff4444', '#aaaaaa'];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
                expect(consoleWarnSpy).toHaveBeenCalledWith(
                    'Cannot access array element 輸送実績[0].営業収入_千円 in MapLibre expressions. Using fallback value null instead.'
                );
            });

            it('should handle multiple nested issues in one expression', () => {
                const expr = [
                    'case',
                    ['all', ['>', ['get', 'a', ['get', 'b', 0]], 100], ['<', ['get', 'c', 0], 50]],
                    ['interpolate', ['linear'], ['get', 'd', 0], 0, 'blue', 100, 'red'],
                    'gray',
                ];
                const expected = [
                    'case',
                    ['all', ['>', ['literal', null], 100], ['<', ['get', 'c'], 50]],
                    ['interpolate', ['linear'], ['get', 'd'], 0, 'blue', 100, 'red'],
                    'gray',
                ];
                expect(fixMaplibreExpression(expr)).toEqual(expected);
            });
        });

        describe('non-expression values', () => {
            it('should return non-array values as-is', () => {
                expect(fixMaplibreExpression('red')).toBe('red');
                expect(fixMaplibreExpression(42)).toBe(42);
                expect(fixMaplibreExpression(null)).toBe(null);
                expect(fixMaplibreExpression(undefined)).toBe(undefined);
                expect(fixMaplibreExpression({ color: 'blue' })).toEqual({ color: 'blue' });
            });

            it('should handle empty arrays', () => {
                expect(fixMaplibreExpression([])).toEqual([]);
            });
        });
    });

    describe('isValidExpression', () => {
        it('should validate simple get expressions', () => {
            expect(isValidExpression(['get', 'property'])).toBe(true);
            expect(isValidExpression(['get', 'prop', ['get', 'parent']])).toBe(true);
        });

        it('should reject get with invalid third parameter', () => {
            expect(isValidExpression(['get', 'prop', 100])).toBe(false);
            expect(isValidExpression(['get', 'prop', 'string'])).toBe(false);
        });

        it('should reject get with too many parameters', () => {
            expect(isValidExpression(['get', 'a', 'b', 'c', 'd'])).toBe(false);
        });

        it('should validate known operators', () => {
            expect(isValidExpression(['case', true, 'a', 'b'])).toBe(true);
            expect(isValidExpression(['interpolate', ['linear'], ['get', 'x'], 0, 'a', 1, 'b'])).toBe(true);
            expect(isValidExpression(['>', 1, 2])).toBe(true);
        });

        it('should reject unknown operators', () => {
            expect(isValidExpression(['unknown-op', 'arg1'])).toBe(false);
            expect(isValidExpression(['random', 1, 2, 3])).toBe(false);
        });

        it('should handle non-array values', () => {
            expect(isValidExpression('red')).toBe(true);
            expect(isValidExpression(123)).toBe(true);
            expect(isValidExpression(null)).toBe(true);
        });
    });
});
